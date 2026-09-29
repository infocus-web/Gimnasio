import { Suspense } from 'react'
import type { Metadata } from 'next'
import { StaffLoginForm } from './StaffLoginForm'

export const metadata: Metadata = {
  title: 'Acceso equipo',
  robots: { index: false, follow: false },   // no aparece en Google
}

export default function StaffLoginPage() {
  return (
    <Suspense>
      <StaffLoginForm />
    </Suspense>
  )
}
