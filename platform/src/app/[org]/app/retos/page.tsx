import type { Metadata } from 'next'
import { ChallengesScreen } from './ChallengesScreen'

export const metadata: Metadata = { title: 'Retos' }

export default function RetosPage() {
  return <ChallengesScreen />
}
