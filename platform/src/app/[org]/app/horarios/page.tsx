import type { Metadata } from 'next'
import { PeakHoursScreen } from './PeakHoursScreen'

export const metadata: Metadata = { title: 'Concurrencia' }

export default function HorariosPage() {
  return <PeakHoursScreen />
}
