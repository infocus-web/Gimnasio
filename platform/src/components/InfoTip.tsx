'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/**
 * Botón "i" chiquito que explica qué hace el botón de al lado.
 * Se abre con clic/toque y se cierra con otro toque, tocando afuera o con Escape.
 * El globo se posiciona fijo en pantalla y nunca se sale de los bordes (sirve en celular).
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()

  const place = useCallback(() => {
    const b = btn.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const gutter = 16
    const width = Math.min(300, window.innerWidth - gutter * 2)
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, gutter), window.innerWidth - width - gutter)
    const h = box.current?.offsetHeight ?? 0
    const below = r.bottom + 8
    const top = h && below + h > window.innerHeight - gutter && r.top - 8 - h > gutter ? r.top - 8 - h : below
    setPos({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !box.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btn}
        type="button"
        aria-label={`Qué hace «${label}»`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] font-serif text-[11px] font-bold italic leading-none transition-colors before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]/60 ${
          open ? 'border-[#edcc36] bg-[#edcc36] text-black' : 'border-zinc-500 text-zinc-400 hover:border-zinc-300 hover:text-zinc-200'
        }`}
      >
        i
      </button>
      {open && (
        <div
          ref={box}
          id={id}
          role="note"
          style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden', top: 0, left: 0 }}
          className="fixed z-50 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal text-zinc-200 shadow-2xl shadow-black/60 [&_strong]:font-semibold [&_strong]:text-white [&>p+p]:mt-2"
        >
          {children}
        </div>
      )}
    </span>
  )
}
