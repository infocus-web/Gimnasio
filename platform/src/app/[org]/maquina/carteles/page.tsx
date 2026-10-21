import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { machineUrl, qrSvg } from '@/features/floor/qr'
import { PrintButton } from '@/features/floor/PrintButton'

export const metadata: Metadata = { title: 'Carteles de máquinas', robots: { index: false, follow: false } }

/**
 * Carteles A5 para pegar en cada máquina (fuera del panel para imprimir limpio).
 * ?id=<máquina> imprime uno; sin id, todos los de las máquinas en uso.
 */
export default async function PostersPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org: slug } = await params
  const id = (await searchParams).id
  const ctx = await getAdminContext(slug)
  const back = `/${slug}/admin/maquinas`
  if (!ctx || (ctx.staff.role !== 'trainer' && !ctx.can('training.manage_all'))) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <p className="text-sm text-zinc-400">Solo el equipo del gimnasio puede imprimir los carteles.</p>
      </main>
    )
  }

  const supabase = await createClient()
  let query = supabase.from('machines').select('id, name, area, code').eq('org_id', ctx.org.id).eq('active', true).order('name')
  if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) query = query.eq('id', id)
  const { data: machines } = await query
  const posters = await Promise.all(
    (machines ?? []).map(async (m) => {
      const url = await machineUrl(slug, m.code)
      return { ...m, url, svg: await qrSvg(url) }
    }),
  )

  return (
    <main className="posters-page min-h-dvh bg-zinc-900 pb-10">
      <style>{`
        .poster { width: 148mm; height: 210mm; }
        .poster-qr svg { width: 100%; height: 100%; display: block; }
        @page { size: A5 portrait; margin: 0; }
        @media print {
          html, body, .posters-page { background: #fff !important; }
          .no-print { display: none !important; }
          .posters-page { padding: 0 !important; }
          .poster-list { gap: 0 !important; padding: 0 !important; }
          .poster { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
          .poster:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen and (max-width: 640px) {
          .poster { width: 100%; height: auto; aspect-ratio: 148 / 210; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <Link href={back as Route} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-zinc-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a Máquinas
        </Link>
        <p className="text-sm text-zinc-400">
          {posters.length === 1 ? '1 cartel' : `${posters.length} carteles`} · tamaño A5 (media hoja A4). En el diálogo de impresión elegí “A5” o “Ajustar a la página”.
        </p>
        {posters.length > 0 && <PrintButton />}
      </div>

      {posters.length === 0 ? (
        <p className="p-6 text-center text-sm text-zinc-400">No hay máquinas en uso para imprimir.</p>
      ) : (
        <div className="poster-list flex flex-col items-center gap-8 p-4 sm:p-8">
          {posters.map((p) => (
            <section
              key={p.id}
              className="poster flex flex-col items-center justify-between overflow-hidden bg-white px-[12mm] py-[12mm] text-center text-black shadow-2xl"
              aria-label={`Cartel de ${p.name}`}
            >
              <div className="w-full">
                <p className="text-[11pt] font-bold uppercase tracking-[0.3em] text-zinc-500">{ctx.org.name}</p>
                <h2 className="mt-[4mm] text-[30pt] font-black leading-tight">{p.name}</h2>
                {p.area && <p className="mt-[1mm] text-[13pt] text-zinc-600">{p.area}</p>}
              </div>
              <div className="poster-qr aspect-square w-[95mm] max-w-full" dangerouslySetInnerHTML={{ __html: p.svg }} />
              <div className="w-full">
                <p className="text-[17pt] font-extrabold leading-snug">Escaneá para ver cómo se usa y tu último peso</p>
                <div className="mx-auto mt-[4mm] h-[2mm] w-[30mm] rounded-full bg-[#edcc36]" />
                <p className="mt-[3mm] font-mono text-[9pt] text-zinc-500">{p.url.replace(/^https?:\/\//, '')}</p>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
