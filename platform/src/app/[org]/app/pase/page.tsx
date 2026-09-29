import type { Metadata } from 'next'
import { PassScreen } from './PassScreen'

export const metadata: Metadata = { title: 'Mi pase' }

export default function PasePage() {
  return <PassScreen />
}
