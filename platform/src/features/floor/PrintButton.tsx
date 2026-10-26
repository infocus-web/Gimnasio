'use client'

import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-tac inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
    </button>
  )
}
