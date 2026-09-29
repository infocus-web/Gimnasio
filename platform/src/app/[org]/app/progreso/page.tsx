import type { Metadata } from 'next'
import { ProgressScreen } from './ProgressScreen'

export const metadata: Metadata = { title: 'Progreso' }

export default function ProgresoPage() {
  return <ProgressScreen />
}
