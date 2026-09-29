import type { Metadata } from 'next'
import { PeakHoursScreen } from './PeakHoursScreen'

export const metadata: Metadata = { title: 'Horarios pico' }

export default function HorariosPage() {
  return <PeakHoursScreen />
}
