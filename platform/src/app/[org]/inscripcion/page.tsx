import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { ArrowLeft, Camera, CreditCard, MessageCircle, ShieldCheck, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPublicGym } from '@/features/public/profile'
import { BRAND } from '@/features/public/media'
import { display, text } from '@/features/public/fonts'
import { mpConfigured } from '@/features/payments/mercadopago'
import { SignupForm, type SignupPlan } from '@/features/public/SignupForm'
import { saveSignupProfile, startSignup } from '@/features/public/signup-actions'
import { SignupProfileForm } from '@/features/public/SignupProfileForm'
import { getSignupProfile } from '@/features/public/signup-profile'
import type { ReferralInfo } from '@/features/public/referral-types'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/[org]/inscripcion'>): Promise<Metadata> {
  const { org } = await params
  const gym = await getPublicGym(org)
  return {
    title: { absolute: gym ? `Inscribite · ${gym.name}` : 'Inscribite' },
    description: 'Elegí tu plan, pagá online con Mercado Pago y empezá a entrenar.',
  }
}

/**
 * Inscripción online: cuenta primero, pago después.
 *  0. Sin sesión → "Creá tu cuenta" (email + contraseña, confirma por email y vuelve acá).
 *  1. Con sesión y sin datos → tus datos + tu foto de socio (cámara del celular). Crea la ficha
 *     como "lead" (sin plan) vinculada a la cuenta.
 *  2. Datos completos → elegir plan y pagar con Mercado Pago. Al aprobarse el pago (0038) esa
 *     misma ficha pasa a activa.
 */
export default async function SignupPage({ params, searchParams }: PageProps<'/[org]/inscripcion'>) {
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
  const step: 'account' | 'profile' | 'plan' = !accountEmail ? 'account' : !profile?.complete || sp.datos === '1' ? 'profile' : 'plan'
  const { data } = await supabase.rpc('public_signup_plans', { p_slug: org })
  const plans = (((data ?? null) as { plans?: SignupPlan[] } | null)?.plans ?? []) as SignupPlan[]
  const wanted = typeof sp.plan === 'string' ? sp.plan.toLowerCase() : null
  const initialPlan = plans.find((p) => p.id === wanted || p.name.toLowerCase() === wanted)?.id ?? plans[0]?.id ?? null
  const ref = typeof sp.ref === 'string' ? sp.ref.slice(0, 30) : null
  const referral = ref ? ((await supabase.rpc('public_referral_lookup', { p_slug: org, p_code: ref })).data as ReferralInfo | null) : null
  const whatsapp = gym.profile.whatsapp ? `https://wa.me/${gym.profile.whatsapp.replace(/\D/g, '')}` : null
  const available = mpConfigured() && !!process.env.SUPABASE_SECRET_KEY && plans.length > 0
  // Al volver de crear la cuenta / ingresar, cae de nuevo acá con el mismo plan y código de amigo/a
  const back = new URLSearchParams()
  if (typeof sp.plan === 'string') back.set('plan', sp.plan)
  if (ref) back.set('ref', ref)
  const here = `/${gym.slug}/inscripcion${back.size ? `?${back}` : ''}`

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
        {available && step !== 'account' && <Steps step={step} />}
        <h1 className="font-display text-[clamp(2.2rem,6vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-white">
          {step === 'account' ? 'Inscribite online' : step === 'profile' ? `¡Bienvenido/a a ${gym.name}!` : `¡Ya casi, ${profile?.firstName}!`}
        </h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">
          {step === 'account'
            ? 'Primero creá tu cuenta con tu email y una contraseña. Después completás tus datos, elegís tu plan y pagás con Mercado Pago.'
            : step === 'profile'
              ? 'Qué bueno que te sumes. Contanos un poco de vos y sacate una foto para tu ficha de socio: te lleva un minuto.'
              : 'Elegí el plan que más te guste y pagalo con Mercado Pago. Apenas se acredita, te esperamos para entrenar: tu QR ya abre el molinete.'}
        </p>
        {available && step === 'plan' && profile && (
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-white/10 bg-[#141414] p-3">
            {profile.photoSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.photoSrc} alt="Tu foto de socio" className="h-14 w-14 shrink-0 rounded-full object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">
                {profile.firstName} {profile.lastName}
              </p>
              <p className="truncate text-sm text-white/55">
                DNI {profile.document} · {profile.phone}
              </p>
            </div>
            <Link
              href={`${here}${here.includes('?') ? '&' : '?'}datos=1` as Route}
              className="flex min-h-[44px] shrink-0 items-center px-2 text-sm font-semibold text-brand hover:underline"
            >
              Editar
            </Link>
          </div>
        )}

        {available && !accountEmail ? (
          <div className="mt-10 space-y-4 rounded-lg border border-white/10 bg-[#141414] p-6">
            <p className="flex items-center gap-2 font-display text-2xl font-bold text-white">
              <UserPlus className="h-6 w-6 text-brand" aria-hidden="true" /> 1. Creá tu cuenta
            </p>
            <p className="text-white/65">
              Te llega un email para confirmarla (una sola vez). Al confirmarla volvés acá para elegir tu plan y pagar.
            </p>
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
          </div>
        ) : available && accountEmail && step === 'profile' ? (
          <SignupProfileForm
            action={saveSignupProfile.bind(null, gym.slug, here)}
            accountEmail={accountEmail}
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
        ) : available && accountEmail ? (
          <SignupForm
            action={startSignup.bind(null, gym.slug)}
            plans={plans}
            initialPlan={initialPlan}
            slug={gym.slug}
            initialReferral={referral}
            accountEmail={accountEmail}
            profileDone
          />
        ) : (
          <div className="mt-10 rounded-lg border border-white/10 bg-[#141414] p-6">
            <p className="text-lg font-semibold text-white">Por ahora la inscripción online no está disponible.</p>
            <p className="mt-2 text-white/65">Escribinos y te inscribimos en un minuto, o acercate a recepción.</p>
            {whatsapp && (
              <a
                href={`${whatsapp}?text=${encodeURIComponent('Hola! Quiero inscribirme en el gimnasio.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-md bg-brand px-5 font-bold text-black hover:bg-[#f5db5c]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" /> Escribir por WhatsApp
              </a>
            )}
          </div>
        )}

        <p className="mt-8 flex items-start gap-2 text-sm text-white/45">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          El pago lo procesa Mercado Pago: nosotros no vemos ni guardamos los datos de tu tarjeta.
        </p>
      </main>
    </div>
  )
}

/** Paso actual de la inscripción: 1 tus datos y tu foto · 2 tu plan y el pago */
function Steps({ step }: { step: 'profile' | 'plan' }) {
  const items = [
    { key: 'profile', label: 'Tus datos y tu foto', Icon: Camera },
    { key: 'plan', label: 'Tu plan y el pago', Icon: CreditCard },
  ] as const
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Pasos de la inscripción">
      {items.map(({ key, label, Icon }, i) => {
        const on = key === step
        const done = step === 'plan' && key === 'profile'
        return (
          <li key={key} className="flex items-center gap-2" aria-current={on ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-6 bg-white/20" aria-hidden="true" />}
            <span className={`grid h-8 w-8 place-items-center rounded-full ${on ? 'bg-brand text-black' : done ? 'bg-brand/20 text-brand' : 'bg-white/10 text-white/50'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className={on ? 'font-semibold text-white' : 'text-white/50'}>
              {i + 1}. {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
