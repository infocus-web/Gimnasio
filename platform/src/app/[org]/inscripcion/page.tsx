import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MessageCircle, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPublicGym } from '@/features/public/profile'
import { BRAND } from '@/features/public/media'
import { display, text } from '@/features/public/fonts'
import { mpConfigured } from '@/features/payments/mercadopago'
import { SignupForm, type SignupPlan } from '@/features/public/SignupForm'
import { startSignup } from '@/features/public/signup-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps<'/[org]/inscripcion'>): Promise<Metadata> {
  const { org } = await params
  const gym = await getPublicGym(org)
  return {
    title: { absolute: gym ? `Inscribite · ${gym.name}` : 'Inscribite' },
    description: 'Elegí tu plan, pagá online con Mercado Pago y empezá a entrenar.',
  }
}

/** Inscripción online: datos + plan + pago con Mercado Pago. La ficha se crea al aprobarse el pago (0038). */
export default async function SignupPage({ params, searchParams }: PageProps<'/[org]/inscripcion'>) {
  const { org } = await params
  const sp = await searchParams
  const gym = await getPublicGym(org)
  if (!gym) notFound()

  const supabase = await createClient()
  const { data } = await supabase.rpc('public_signup_plans', { p_slug: org })
  const plans = (((data ?? null) as { plans?: SignupPlan[] } | null)?.plans ?? []) as SignupPlan[]
  const wanted = typeof sp.plan === 'string' ? sp.plan.toLowerCase() : null
  const initialPlan = plans.find((p) => p.id === wanted || p.name.toLowerCase() === wanted)?.id ?? plans[0]?.id ?? null
  const whatsapp = gym.profile.whatsapp ? `https://wa.me/${gym.profile.whatsapp.replace(/\D/g, '')}` : null
  const available = mpConfigured() && !!process.env.SUPABASE_SECRET_KEY && plans.length > 0

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
        <h1 className="font-display text-[clamp(2.2rem,6vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-white">Inscribite online</h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">
          Elegí tu plan, completá tus datos y pagá con Mercado Pago. Al toque te llega un email para entrar a la app con tu QR de acceso.
        </p>

        {available ? (
          <SignupForm action={startSignup.bind(null, gym.slug)} plans={plans} initialPlan={initialPlan} />
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
