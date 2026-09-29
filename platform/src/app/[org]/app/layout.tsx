import Link from 'next/link'
import { Dumbbell } from 'lucide-react'
import { getMemberContext } from '@/lib/member-context'
import { MemberProvider } from '@/features/member/MemberProvider'
import { MemberNav } from '@/features/member/MemberNav'
import { SignOutButton } from '@/features/member/SignOutButton'

export default async function MemberAppLayout({ children, params }: LayoutProps<'/[org]/app'>) {
  const { org: slug } = await params
  const ctx = await getMemberContext(slug)

  if ('error' in ctx) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-bold text-white">
            {ctx.error === 'NO_ORG' ? 'Gimnasio no encontrado' : 'Todavía no sos socio de este gimnasio'}
          </h1>
          <p className="text-sm text-zinc-400">
            {ctx.error === 'NO_ORG'
              ? 'Revisá el link que te pasaron.'
              : 'Pedile a recepción que vincule tu email a tu ficha de socio.'}
          </p>
          <SignOutButton />
        </div>
      </main>
    )
  }

  const { org, meId, family } = ctx
  return (
    <MemberProvider
      org={{ id: org.id, slug: org.slug, name: org.name, locationId: org.locationId, openingHours: org.openingHours }}
      meId={meId}
      family={family}
    >
      <header className="sticky top-0 z-30 border-b border-zinc-900 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#edcc36]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#edcc36]/40 bg-[#edcc36]/10">
              <Dumbbell className="h-5 w-5 text-[#edcc36]" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-extrabold tracking-tight text-white">
              {org.name.toUpperCase()}
            </span>
          </Link>
          <SignOutButton compact />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pt-4" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>
      <MemberNav orgSlug={org.slug} />
    </MemberProvider>
  )
}
