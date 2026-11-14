'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, MessageCircle, Printer, QrCode, Send } from 'lucide-react'

/**
 * Link para que los socios que ya entrenan (anotados en el cuaderno) se registren solos
 * en /soy-socio. No eligen plan ni pagan: quedan en «Ya socios · web» y recepción les asigna el plan.
 */
export function ExistingMemberInvite({ url, gymName, pending, pendingHref }: { url: string; gymName: string; pending: number; pendingHref: string }) {
  const [copied, setCopied] = useState<'link' | 'text' | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const message =
    `¡Hola! Estamos pasando a los socios de ${gymName} al sistema nuevo. ` +
    `Registrate acá con tu email y cargá tus datos (te lleva 2 minutos): ${url}\n` +
    `No tenés que pagar nada: tu plan sigue igual y nosotros te lo cargamos. Después vas a poder ver tu cuota, reservar clases y entrar con la app.`

  useEffect(() => {
    if (!showQr || qr) return
    void QRCode.toDataURL(url, { margin: 1, width: 600, color: { dark: '#000000', light: '#ffffff' } }).then(setQr)
  }, [showQr, qr, url])

  const copy = (what: 'link' | 'text') => {
    void navigator.clipboard?.writeText(what === 'link' ? url : message)
    setCopied(what)
    setTimeout(() => setCopied(null), 2000)
  }

  const printQr = () => {
    if (!qr) return
    const w = window.open('', '_blank', 'width=700,height=900')
    if (!w) return
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Registrate · ${gymName}</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#000}h1{font-size:34px;margin:0 0 8px}p{font-size:20px;margin:6px 0}img{width:420px;height:420px;margin:24px auto;display:block}small{font-size:14px;color:#444;word-break:break-all}</style></head>
<body><h1>¿Ya sos socio de ${gymName}?</h1><p>Escaneá el código y registrate en 2 minutos.</p><p><strong>No pagás nada:</strong> tu plan te lo cargamos nosotros.</p>
<img src="${qr}" alt=""><small>${url}</small><script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }

  const btn =
    'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]'

  return (
    <section aria-labelledby="invite-title" className="rounded-2xl border border-[#edcc36]/30 bg-[#edcc36]/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 id="invite-title" className="flex items-center gap-2 text-base font-bold text-white">
            <Send className="h-4 w-4 text-[#edcc36]" aria-hidden="true" /> Socios del cuaderno: que se registren solos
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Mandales este link. Crean su cuenta y cargan sus datos y su foto, <strong className="text-zinc-200">sin elegir plan ni pagar</strong>.
            Después aparecen en «Ya socios · web» y les asignás el plan.
          </p>
        </div>
        <a href={pendingHref} className="rounded-xl border border-zinc-700 bg-black/40 px-3 py-2 text-center hover:border-[#edcc36]/60">
          <span className="block text-2xl font-extrabold tabular-nums text-white">{pending}</span>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">para asignar plan</span>
        </a>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Link de registro para socios"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-[44px] w-full rounded-xl border border-[#444] bg-[#1a1a1a] px-3 font-mono text-xs text-white"
        />
        <button type="button" onClick={() => copy('link')} className={`${btn} shrink-0 border-zinc-700 text-zinc-200 hover:border-[#edcc36]/60`}>
          {copied === 'link' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === 'link' ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className={`${btn} border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Mandar por WhatsApp
        </a>
        <button type="button" onClick={() => copy('text')} className={`${btn} border-zinc-700 text-zinc-200 hover:border-[#edcc36]/60`}>
          {copied === 'text' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied === 'text' ? 'Mensaje copiado' : 'Copiar mensaje'}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          aria-expanded={showQr}
          className={`${btn} border-zinc-700 text-zinc-200 hover:border-[#edcc36]/60`}
        >
          <QrCode className="h-4 w-4" aria-hidden="true" /> {showQr ? 'Ocultar QR' : 'QR para el mostrador'}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Tip: pegá el mensaje en el grupo de WhatsApp del gym, así le llega a todos de una vez.</p>

      {showQr && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-black/40 p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Código QR del link de registro" className="h-40 w-40 rounded-lg bg-white p-2" />
          ) : (
            <div className="h-40 w-40 animate-pulse rounded-lg bg-zinc-800" />
          )}
          <div className="space-y-2 text-sm text-zinc-400">
            <p>Imprimilo y pegalo en recepción o en el molinete: lo escanean con la cámara del celular.</p>
            <button type="button" onClick={printQr} disabled={!qr} className={`${btn} border-[#edcc36]/60 text-[#edcc36] hover:bg-[#edcc36]/10 disabled:opacity-40`}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir cartel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
