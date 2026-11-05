import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { getPublicGym } from '@/features/public/profile'
import { LegalPage, contactLine } from '@/features/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: 'Condiciones de uso de la app y de los servicios de Evolution Fitness GYM.',
}
export const revalidate = 3600

export default async function TermsPage() {
  const gym = await getPublicGym('evolution')
  const name = gym?.name ?? 'Evolution Fitness GYM'
  const contact = contactLine(gym?.profile.email, gym?.profile.whatsapp)

  return (
    <LegalPage title="Términos y condiciones" updated="5 de noviembre de 2026">
      <p>Al crear una cuenta o usar la app de {name} aceptás estas condiciones.</p>

      <h2>Tu cuenta</h2>
      <ul>
        <li>La cuenta es personal. Cuidá tu contraseña y no la compartas.</li>
        <li>El QR de ingreso es solo para vos: no se presta ni se comparte.</li>
        <li>Los datos que cargás tienen que ser reales.</li>
      </ul>

      <h2>Planes y pagos</h2>
      <ul>
        <li>Los precios y lo que incluye cada plan se publican en la web y en recepción.</li>
        <li>El plan se activa cuando el pago se acredita y vence en la fecha que ves en la app. Al vencer, el ingreso se bloquea hasta que lo renueves.</li>
        <li>Los pagos online los procesa Mercado Pago, con sus propias condiciones.</li>
      </ul>

      <h2>Salud y uso del gimnasio</h2>
      <ul>
        <li>Para entrenar tenés que estar en condiciones de salud y presentar el apto médico en recepción.</li>
        <li>Respetá las indicaciones de los profesores y las normas del gimnasio.</li>
        <li>Las reservas de clases están sujetas a cupo. Si no vas a ir, cancelala para liberar el lugar.</li>
      </ul>

      <h2>Baja y datos</h2>
      <p>
        Podés pedir la baja de tu cuenta {contact}. Cómo tratamos tus datos está explicado en la{' '}
        <Link href={'/privacidad' as Route}>Política de privacidad</Link>.
      </p>

      <h2>Cambios</h2>
      <p>Podemos actualizar estas condiciones; la fecha de arriba indica la última versión.</p>
    </LegalPage>
  )
}
