import type { Metadata } from 'next'
import { WorkoutScreen } from './WorkoutScreen'

export const metadata: Metadata = { title: 'Entrenar' }

export default function EntrenarPage() {
  return <WorkoutScreen />
}
