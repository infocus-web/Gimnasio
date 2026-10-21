/** Mientras carga una pantalla del panel (Reportes, ficha de socio…): esqueleto en vez de la pantalla congelada. */
export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-900" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-900/80" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-900/60" />
    </div>
  )
}
