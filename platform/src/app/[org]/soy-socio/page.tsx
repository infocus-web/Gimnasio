import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { ArrowLeft, CheckCircle2, MessageCircle, Smartphone, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicGym } from '@/features/public/profile'
import { BRAND } from '@/features/public/media'
import { display, text } from '@/features/public/fonts'
import { saveSignupProfile } from '@/features/public/signup-actions'
import { SignupProfileForm } from '@/features/public/SignupProfileForm'
import { getSignupProfile } from '@/features/public/signup-profile'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/[org]/soy-socio'>): Promise<Metadata> {
  const { org } = await params
  const gym = await getPublicGym(org)
  return {
    title: { absolute: gym ? `Ya soy socio · ${gym.name}` : 'Ya soy socio' },
    description: 'Si ya entrenás en el gimnasio, creá tu cuenta y cargá tus datos para usar la app.',
    robots: { index: false, follow: false },
  }
}

/**
 * Alta online para quienes YA son socios del gimnasio (vienen del sistema viejo).
 * Mismo circuito que /inscripcion pero SIN elegir plan ni pagar:
 *  0. Sin sesión → crear cuenta (email + contraseña) o ingresar.
 *  1. Con sesión → datos + foto de socio. La ficha queda como "lead" con la etiqueta
 *     "socio-existente" (o se vincula a la ficha que ya hubiera cargado recepción).
 *  2. Listo → recepción le asigna su plan desde el panel (filtro "Ya socios · web").
 */
export default async function ExistingMemberPage({ params, searchParams }: PageProps<'/[org]/soy-socio'>) {
  const { org } = await params
  const sp = await searchParams
  const gym = await getPublicGym(org)
  if (!gym) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const accountEmail = user?.email_confirmed_at ? (user.email ?? null) : null
  const profile = user && accountEmail ? await getSignupProfile(org, user.id) : null
  const step: 'account' | 'profile' | 'done' = !accountEmail ? 'account' : !profile?.complete || sp.datos === '1' ? 'profile' : 'done'
  const available = !!process.env.SUPABASE_SECRET_KEY
  const whatsapp = gym.profile.whatsapp ? `https://wa.me/${gym.profile.whatsapp.replace(/\D/g, '')}` : null
  const here = `/${gym.slug}/soy-socio`

  // ¿Ya tiene la cuota al día? (si recepción ya le había cargado el plan)
  let planOk = false
  if (step === 'done' && profile && available) {
    const { data } = await createAdminClient()
      .from('member_directory')
      .select('membership_status, current_period_end')
      .eq('id', profile.memberId)
      .maybeSingle()
    planOk =
      !!data &&
      ['active', 'trialing'].includes(data.membership_status ?? '') &&
      !!data.current_period_end &&
      new Date(data.current_period_end).getTime() > Date.now()
  }

  return (
    <div className={`${display.variable} ${text.variable} public-site min-h-dvh bg-black font-text text-[#e9e7e1]`}>
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link href={`/${gym.slug}`} aria-label={`${gym.name}, volver a la web`} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Image src={BRAND.logo} alt={gym.name} width={BRAND.logoWidth} height={BRAND.logoHeight} priority className="h-9 w-auto sm:h-11" />
        </Link>
        <Link href={`/${gym.slug}`} className="flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-brand">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-8">
        <h1 className="font-display text-[clamp(2.2rem,6vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-white">
          {step === 'account' ? '¿Ya entrenás con nosotros?' : step === 'profile' ? '¡Hola de nuevo!' : `¡Listo, ${profile?.firstName}!`}
        </h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">
          {step === 'account'
            ? `Pasamos a un sistema nuevo en ${gym.name}. Creá tu cuenta con tu email y una contraseña y cargá tus datos: no tenés que pagar nada acá.`
            : step === 'profile'
              ? 'Contanos tus datos y sacate una foto para tu ficha de socio. Te lleva un minuto.'
              : planOk
                ? 'Tu cuenta ya está vinculada y tu cuota está al día. Ya podés usar la app del gimnasio.'
                : 'Ya quedaste registrado/a. En recepción te activamos tu cuota en el sistema nuevo y listo.'}
        </p>

        {!available ? (
          <div className="mt-10 rounded-lg border border-white/10 bg-[#141414] p-6">
            <p className="text-lg font-semibold text-white">Por ahora el registro online no está disponible.</p>
            <p className="mt-2 text-white/65">Acercate a recepción y te registramos en un minuto.</p>
          </div>
        ) : step === 'account' ? (
          <div className="mt-10 space-y-4 rounded-lg border border-white/10 bg-[#141414] p-6">
            <p className="flex items-center gap-2 font-display text-2xl font-bold text-white">
              <UserPlus className="h-6 w-6 text-brand" aria-hidden="true" /> Creá tu cuenta
            </p>
            <p className="text-white/65">Te llega un email para confirmarla (una sola vez). Al confirmarla volvés acá para cargar tus datos.</p>
            <Link
              href={`/login?modo=crear&next=${encodeURIComponent(here)}` as Route}
              className="flex min-h-[54px] w-full items-center justify-center rounded-md bg-brand px-5 text-lg font-bold text-black hover:bg-[#f5db5c]"
            >
              Crear mi cuenta
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(here)}` as Route}
              className="flex min-h-[48px] w-full items-center justify-center rounded-md border border-white/20 font-semibold text-white hover:border-white"
            >
              Ya tengo cuenta · Ingresar
            </Link>
            <p className="pt-2 text-sm text-white/45">
              ¿Todavía no sos socio?{' '}
              <Link href={`/${gym.slug}/inscripcion` as Route} className="font-semibold text-brand hover:underline">
                Inscribite acá
              </Link>
            </p>
          </div>
        ) : step === 'profile' && accountEmail ? (
          <SignupProfileForm
            action={saveSignupProfile.bind(null, gym.slug, here)}
            accountEmail={accountEmail}
            submitLabel="Guardar mis datos"
            defaults={
              profile
                ? {
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    document: profile.document ?? '',
                    phone: profile.phone ?? '',
                    birthDate: profile.birthDate ?? '',
                    photoSrc: profile.photoSrc,
                  }
                : null
            }
          />
        ) : (
          <div className="mt-10 space-y-5 rounded-lg border border-white/10 bg-[#141414] p-6">
            <div className="flex items-center gap-3">
              {profile?.photoSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoSrc} alt="Tu foto de socio" className="h-14 w-14 shrink-0 rounded-full object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> {profile?.firstName} {profile?.lastName}
                </p>
                <p className="truncate text-sm text-white/55">
                  DNI {profile?.document} · {profile?.phone}
                </p>
              </div>
              <Link href={`${here}?datos=1` as Route} className="flex min-h-[44px] shrink-0 items-center px-2 text-sm font-semibold text-brand hover:underline">
                Editar
              </Link>
            </div>
            <Link
              href={`/${gym.slug}/app` as Route}
              className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-md bg-brand px-5 text-lg font-bold text-black hover:bg-[#f5db5c]"
            >
              <Smartphone className="h-5 w-5" aria-hidden="true" /> Ir a la app
            </Link>
            {!planOk && whatsapp && (
              <a
                href={`${whatsapp}?text=${encodeURIComponent(`Hola! Ya me registré en la web como socio (${profile?.firstName} ${profile?.lastName}, DNI ${profile?.document}). ¿Me activan la cuota?`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border border-white/20 font-semibold text-white hover:border-white"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" /> Avisar por WhatsApp
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
