import type { Metadata } from 'next'
import { getPublicGym } from '@/features/public/profile'
import { LegalPage, contactLine } from '@/features/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Qué datos personales usa Evolution Fitness GYM, para qué y cómo ejercer tus derechos.',
}
export const revalidate = 3600

export default async function PrivacyPage() {
  const gym = await getPublicGym('evolution')
  const name = gym?.name ?? 'Evolution Fitness GYM'
  const contact = contactLine(gym?.profile.email, gym?.profile.whatsapp)

  return (
    <LegalPage title="Política de privacidad" updated="5 de noviembre de 2026">
      <p>
        En {name}
        {gym?.address ? ` (${gym.address})` : ''} cuidamos tus datos personales. Acá te contamos qué datos usamos cuando te
        inscribís, usás la app o venís al gimnasio, para qué los usamos y qué derechos tenés.
      </p>

      <h2>Quién es responsable de tus datos</h2>
      <p>El responsable es {name}. Podés comunicarte con nosotros {contact}.</p>

      <h2>Qué datos usamos</h2>
      <ul>
        <li>Datos de tu cuenta: email y contraseña (la contraseña se guarda cifrada; nadie del gimnasio puede verla).</li>
        <li>Si entrás con Google: tu nombre, tu email y tu foto de perfil de Google. No accedemos a tu correo ni a otros datos de tu cuenta de Google.</li>
        <li>Datos de socio: nombre, apellido, DNI, celular y, si la cargás, fecha de nacimiento.</li>
        <li>Plan, pagos y vencimientos. Los pagos online los procesa Mercado Pago: nosotros no vemos ni guardamos los datos de tu tarjeta.</li>
        <li>Ingresos al gimnasio (día y hora), reservas de clases, rutinas y el progreso que registres en la app.</li>
        <li>Si usás el ingreso con palma o rostro en los lectores de la entrada, el lector guarda una plantilla biométrica para reconocerte. Es opcional: siempre podés entrar con el QR de la app.</li>
        <li>El apto médico u otros documentos que entregues en recepción.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Darte acceso a la app y al gimnasio, y controlar que tu plan esté al día.</li>
        <li>Cobrar tu plan y mandarte comprobantes, recordatorios de vencimiento y avisos sobre clases.</li>
        <li>Mostrarte tus rutinas, reservas y progreso.</li>
        <li>Cuidar tu salud y seguridad durante la actividad física.</li>
      </ul>
      <p>No vendemos ni alquilamos tus datos, y no los usamos para publicidad de terceros.</p>

      <h2>Con quién se comparten</h2>
      <p>
        Solo con los servicios que necesitamos para que todo funcione: Supabase (base de datos), Vercel (alojamiento de la web),
        Mercado Pago (cobros), Resend (envío de emails) y Google (solo si elegís entrar con Google). También podemos tener que
        informarlos si lo pide una autoridad con orden legal.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras seas socio o tengas una cuenta. Si te das de baja, archivamos tu ficha y la borramos cuando nos lo pidas,
        salvo lo que la ley nos obligue a guardar (por ejemplo, comprobantes de pago).
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir ver, corregir o borrar tus datos, o borrar tu cuenta, {contact}. Respondemos dentro de los plazos de la Ley
        25.326 de Protección de Datos Personales. Si no quedás conforme, podés reclamar ante la Agencia de Acceso a la
        Información Pública (AAIP), órgano de control de esa ley.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, vas a ver la fecha nueva arriba de todo y, si el cambio es importante, te avisamos por email.</p>
    </LegalPage>
  )
}
