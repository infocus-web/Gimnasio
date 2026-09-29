import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { Search, UserPlus, Smartphone, Users } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, planState, PLAN_STATE_UI } from '@/features/admin/format'

export const metadata: Metadata = { title: 'Socios' }

const FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'al_dia', label: 'Al día' },
  { key: 'por_vencer', label: 'Por vencer' },
  { key: 'vencido', label: 'Vencidos / sin plan' },
  { key: 'archivados', label: 'Archivados' },
] as const

const PAGE_SIZE = 50

export default async function MembersPage({ params, searchParams }: PageProps<'/[org]/admin/socios'>) {
  const { org: slug } = await params
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').replace(/[,()*%\\:]/g, ' ').trim().slice(0, 60)
  const estado = typeof sp.estado === 'string' ? sp.estado : ''
  const page = Math.max(1, Number(sp.p) || 1)

  const ctx = (await getAdminContext(slug))!
  if (!ctx.can('members.read')) {
    return <p className="text-sm text-zinc-400">No tenés permiso para ver el listado de socios.</p>
  }

  const supabase = await createClient()
  const now = new Date().toISOString()
  const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString()

  let query = supabase
    .from('member_directory')
    .select('id, first_name, last_name, email, phone, document_id, status, has_app, is_payer, plan_name, membership_status, current_period_end, last_checkin_at', {
      count: 'exact',
    })
    .eq('org_id', ctx.org.id)

  query = estado === 'archivados' ? query.eq('status', 'archived') : query.neq('status', 'archived')
  if (estado === 'al_dia') query = query.gt('current_period_end', in7)
  if (estado === 'por_vencer') query = query.gte('current_period_end', now).lte('current_period_end', in7)
  if (estado === 'vencido') query = query.or(`membership_id.is.null,current_period_end.lt.${now}`)

  if (q) {
    const terms = q.split(/\s+/).slice(0, 3)
    for (const t of terms) {
      query = query.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,document_id.ilike.%${t}%,email.ilike.%${t}%`)
    }
  }

  const from = (page - 1) * PAGE_SIZE
  const { data: rows, count } = await query
    .order('last_name')
    .order('first_name')
    .range(from, from + PAGE_SIZE - 1)

  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const qs = (patch: Record<string, string | number>) => {
    const u = new URLSearchParams()
    const merged = { q, estado, p: page, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'p' && v === 1)) u.set(k, String(v))
    const s = u.toString()
    return `/${slug}/admin/socios${s ? `?${s}` : ''}` as Route
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Socios</h1>
          <p className="text-sm text-zinc-400">{total} {total === 1 ? 'ficha' : 'fichas'}</p>
        </div>
        {ctx.can('members.write') && (
          <Link
            href={`/${slug}/admin/socios/nuevo` as Route}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#edcc36] px-4 text-sm font-bold text-black"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Nuevo socio
          </Link>
        )}
      </div>

      <form role="search" className="flex gap-2" action={`/${slug}/admin/socios`}>
        {estado && <input type="hidden" name="estado" value={estado} />}
        <label className="relative flex-1">
          <span className="sr-only">Buscar socio</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Nombre, apellido, DNI o email"
            className="min-h-[44px] w-full rounded-xl border border-zinc-800 bg-black pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]"
          />
        </label>
        <button className="min-h-[44px] rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:border-[#edcc36]/60">
          Buscar
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ estado: f.key, p: 1 })}
            aria-current={estado === f.key ? 'true' : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              estado === f.key ? 'border-[#edcc36] bg-[#edcc36]/10 text-[#edcc36]' : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows && rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80">
          <table className="w-full text-left text-sm">
            <thead className="hidden bg-zinc-950 text-xs uppercase tracking-wide text-zinc-500 md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Socio</th>
                <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-3 font-semibold">Vence</th>
                <th scope="col" className="px-4 py-3 font-semibold">Última entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {rows.map((m) => {
                const st = PLAN_STATE_UI[planState(m as { membership_status: string | null; current_period_end: string | null; status: string })]
                return (
                  <tr key={m.id} className="group relative bg-black hover:bg-zinc-950">
                    <td className="px-4 py-3">
                      <Link
                        href={`/${slug}/admin/socios/${m.id}` as Route}
                        className="font-semibold text-white after:absolute after:inset-0 group-hover:text-[#edcc36] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#edcc36]"
                      >
                        {m.last_name ? `${m.last_name}, ${m.first_name}` : m.first_name}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        {m.document_id && <span>DNI {m.document_id}</span>}
                        {m.has_app && (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <Smartphone className="h-3 w-3" aria-hidden="true" /> App
                          </span>
                        )}
                        {!m.is_payer && m.plan_name && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" aria-hidden="true" /> Grupo familiar
                          </span>
                        )}
                        <span className={`rounded-md border px-1.5 py-0.5 md:hidden ${st.className}`}>{st.label}</span>
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-300 md:table-cell">
                      <span className={`mr-2 rounded-md border px-1.5 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                      {m.plan_name ?? ''}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-zinc-300 md:table-cell">{fmtDate(m.current_period_end)}</td>
                    <td className="hidden px-4 py-3 tabular-nums text-zinc-400 md:table-cell">{fmtDate(m.last_checkin_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
          <p className="text-sm text-zinc-400">
            {q || estado ? 'No hay socios que coincidan con la búsqueda.' : 'Todavía no cargaste ningún socio.'}
          </p>
          {!q && !estado && ctx.can('members.write') && (
            <Link href={`/${slug}/admin/socios/nuevo` as Route} className="mt-3 inline-block text-sm font-semibold text-[#edcc36]">
              Cargar el primero →
            </Link>
          )}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-between text-sm text-zinc-400">
          {page > 1 ? <Link href={qs({ p: page - 1 })} className="hover:text-white">← Anterior</Link> : <span />}
          <span>
            Página {page} de {pages}
          </span>
          {page < pages ? <Link href={qs({ p: page + 1 })} className="hover:text-white">Siguiente →</Link> : <span />}
        </nav>
      )}
    </div>
  )
}
