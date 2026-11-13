import type { Metadata } from 'next'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { BoardsPanel, type BoardItem, type LiveInfo } from '@/features/floor/BoardsPanel'
import { boardTimer, deleteBoard, hideBoard, saveBoard, showBoard } from '@/features/floor/board-actions'
import { boardMediaUrl, cleanMedia, cleanTimer } from '@/features/screens/board'

export const metadata: Metadata = { title: 'Pizarra TV' }

/** El profe prepara sus pizarras (texto, imágenes, videos, temporizador) y las pone en la TV al entrar a la clase. */
export default async function BoardPage({ params }: PageProps<'/[org]/admin/mis-clases/pizarra'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  const isAdmin = ctx.can('training.manage_all') || ctx.can('org.manage')
  if (!(ctx.staff.role === 'trainer' || ctx.can('schedule.own') || isAdmin)) {
    return <p className="text-sm text-zinc-400">La pizarra de la TV es para los profesores.</p>
  }

  const supabase = await createClient()
  let q = supabase
    .from('class_boards')
    .select('id, staff_id, title, body, media, timer, updated_at, staff(display_name)')
    .eq('org_id', ctx.org.id)
    .order('updated_at', { ascending: false })
  if (!isAdmin) q = q.eq('staff_id', ctx.staff.id)
  const [{ data }, live] = await Promise.all([q, supabase.rpc('tv_board_live', { p_org: ctx.org.id })])

  const boards: BoardItem[] = (data ?? []).map((b) => ({
    id: b.id,
    mine: b.staff_id === ctx.staff.id,
    author: (b.staff as unknown as { display_name: string } | null)?.display_name ?? '',
    title: b.title,
    body: b.body ?? '',
    media: cleanMedia(b.media, `${ctx.org.id}/`).map((m) => ({ ...m, url: boardMediaUrl(m.path) ?? '' })),
    timer: cleanTimer(b.timer),
  }))
  const liveInfo = (live.data ?? null) as LiveInfo | null

  return (
    <BoardsPanel
      orgId={ctx.org.id}
      staffId={ctx.staff.id}
      isAdmin={isAdmin}
      boards={boards}
      live={liveInfo}
      save={saveBoard.bind(null, slug)}
      remove={deleteBoard.bind(null, slug)}
      show={showBoard.bind(null, slug)}
      hide={hideBoard.bind(null, slug)}
      timer={boardTimer.bind(null, slug)}
    />
  )
}
