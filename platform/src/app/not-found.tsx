import Link from 'next/link'
import { Dumbbell } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#edcc36]/40 bg-[#edcc36]/10">
          <Dumbbell className="h-7 w-7 text-[#edcc36]" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-extrabold text-white">No encontramos esta página</h1>
        <p className="text-sm text-zinc-400">Puede que el link esté mal escrito o que la página ya no exista.</p>
        <Link
          href="/"
          className="btn-tac inline-flex min-h-[44px] items-center rounded-xl bg-[#edcc36] px-5 text-sm font-bold text-black"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
