import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { Wordmark } from '@/components/Wordmark'
import { getMemberContext, getStaffContext } from '@/lib/member-context'
import { MemberProvider } from '@/features/member/MemberProvider'
import { MemberNav } from '@/features/member/MemberNav'
import { SignOutButton } from '@/features/member/SignOutButton'
import { SurveyPrompt } from '@/features/member/SurveyPrompt'

export default async function MemberAppLayout({ children, params }: LayoutProps<'/[org]/app'>) {
  const { org: slug } = await params
  const ctx = await getMemberContext(slug)

  if ('error' in ctx) {
    // El dueño / staff sin ficha de socio va directo a su pantalla.
    if (ctx.error === 'NOT_A_MEMBER' && (await getStaffContext(slug))) {
      redirect(`/${slug}/admin` as Route)
    }
    // Cuenta nueva sin ficha: directo a completar sus datos y su foto (paso 1 de la inscripción)
    if (ctx.error === 'NOT_A_MEMBER') redirect(`/${slug}/inscripcion` as Route)
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-bold text-white">
            {ctx.error === 'NO_ORG' ? 'Gimnasio no encontrado' : 'Todavía no sos socio de este gimnasio'}
          </h1>
          <p className="text-sm text-zinc-400">
            {ctx.error === 'NO_ORG'
              ? 'Revisá el link que te pasaron.'
              : 'Tu cuenta ya está creada, pero todavía no tiene un plan en el gimnasio. Inscribite online o acercate a recepción con este mismo email.'}
          </p>
          {ctx.error !== 'NO_ORG' && (
            <Link
              href={`/${slug}/inscripcion` as Route}
              className="btn-tac flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#edcc36] font-bold text-black"
            >
              Inscribirme online
            </Link>
          )}
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
            <Wordmark name={org.name} size="sm" />
          </Link>
          <SignOutButton compact />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pt-4" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <SurveyPrompt />
        {children}
      </main>
      <MemberNav orgSlug={org.slug} />
    </MemberProvider>
  )
}
