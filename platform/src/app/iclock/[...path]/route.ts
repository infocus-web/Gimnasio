import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decodeBody, handshakeOptions, parseCdata, parseResults, redactForLog } from '@/features/access/adms'

/**
 * Lectores ZKTeco (SpeedFace) — protocolo ADMS / "Servidor en la nube".
 * En el lector: Comunicación → Servidor en la nube → dirección = este sitio.
 * La lógica y la seguridad (lector registrado + IP fija) viven en las
 * funciones adms_* de la base, que solo acepta llamadas con la clave del servidor.
 */
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ path: string[] }> }

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

function same(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** IP pública del lector. Si llega por el puente HTTP (ver docs), el puente la informa con un secreto compartido. */
function deviceIp(req: NextRequest) {
  const secret = process.env.ADMS_RELAY_SECRET
  const given = req.headers.get('x-adms-relay-secret')
  if (secret && given && same(secret, given)) {
    const ip = req.headers.get('x-adms-device-ip')
    if (ip) return ip.trim()
  }
  return (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim()
}

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  const route = path.join('/').toLowerCase().replace(/\.aspx$/, '')
  const url = new URL(req.url)
  const sn = url.searchParams.get('SN') ?? url.searchParams.get('sn') ?? ''
  const ip = deviceIp(req)
  const body = req.method === 'POST' ? decodeBody(await req.arrayBuffer()) : ''

  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error('[adms] falta SUPABASE_SECRET_KEY: no se puede atender al lector', sn)
    return text('ERROR', 503)
  }
  const db = createAdminClient()
  const log = (result: string, logBody = body) =>
    db.rpc('adms_log', {
      p_sn: sn,
      p_ip: ip,
      p_method: req.method,
      p_path: route,
      p_query: url.search,
      p_body: redactForLog(logBody),
      p_result: result,
    })

  try {
    // ---- Saludo / datos ------------------------------------------------------
    if (route === 'cdata') {
      if (req.method === 'GET') {
        const info = Object.fromEntries(
          ['pushver', 'DeviceType', 'language', 'PushOptionsFlag'].flatMap((k) => {
            const v = url.searchParams.get(k)
            return v ? [[k, v]] : []
          }),
        )
        const { data } = await db.rpc('adms_hello', { p_sn: sn, p_ip: ip, p_info: info })
        const r = (data ?? {}) as { status?: string; timezone?: string; attlog_stamp?: string; operlog_stamp?: string }
        await log(`hello:${r.status}`)
        if (r.status !== 'ok') return text('OK')          // sigue intentando; aparece como "detectado" en el panel
        return text(
          handshakeOptions(sn, {
            attlogStamp: r.attlog_stamp,
            operlogStamp: r.operlog_stamp,
            timezone: r.timezone ?? 'America/Argentina/Buenos_Aires',
          }),
        )
      }

      const table = (url.searchParams.get('table') ?? '').toUpperCase()
      if (table === 'OPTIONS' || table === '') {
        // "~DeviceName=SpeedFace-V5L,FWVersion=…,UserCount=…" → info del lector
        const info = Object.fromEntries(
          body
            .split(/[\r\n,]+/)
            .map((p) => p.replace(/^~/, '').split('='))
            .filter((p) => p.length === 2 && p[0] && p[1] && p[0].length < 40)
            .slice(0, 40),
        )
        const { data } = await db.rpc('adms_hello', { p_sn: sn, p_ip: ip, p_info: info })
        await log(`options:${(data as { status?: string } | null)?.status}`)
        return text('OK')
      }

      const records = parseCdata(table, body)
      const { data, error } = await db.rpc('adms_push', {
        p_sn: sn,
        p_ip: ip,
        p_table: table,
        p_stamp: url.searchParams.get('Stamp') ?? url.searchParams.get('OpStamp') ?? '',
        p_records: records,
      })
      const r = (data ?? {}) as { status?: string; accepted?: number }
      await log(error ? `error:${error.message}` : `${table}:${r.status}:${records.length}/${r.accepted ?? 0}`)
      if (error) return text('ERROR', 500)
      // Sin registrar o desde otra IP: 503 para que el lector guarde los datos y reintente más tarde
      if (r.status !== 'ok') return text('ERROR', 503)
      return text(`OK: ${records.length}`)
    }

    // ---- El lector pide comandos ----------------------------------------------
    if (route === 'getrequest') {
      const { data, error } = await db.rpc('adms_poll', { p_sn: sn, p_ip: ip })
      if (error) {
        await log(`error:${error.message}`)
        return text('OK')
      }
      const cmds = (data ?? []) as { id: number; cmd: string }[]
      if (!cmds.length) return text('OK')
      await log(`sent:${cmds.length}`, cmds.map((c) => `C:${c.id}:${c.cmd}`).join('\n'))
      return text(cmds.map((c) => `C:${c.id}:${c.cmd}`).join('\n') + '\n')
    }

    // ---- Resultado de los comandos --------------------------------------------
    if (route === 'devicecmd') {
      const results = parseResults(body)
      const { data } = await db.rpc('adms_results', { p_sn: sn, p_ip: ip, p_results: results })
      await log(`results:${results.length}/${data ?? 0}`)
      return text('OK')
    }

    if (route === 'ping') return text('OK')

    // Otras variantes del protocolo (registry, push, rtdata…): se registran para adaptarnos
    await log('unhandled')
    return text('OK')
  } catch (e) {
    console.error('[adms]', route, sn, e)
    return text('ERROR', 500)
  }
}

export const GET = handle
export const POST = handle
