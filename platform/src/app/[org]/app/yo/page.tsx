import type { Metadata } from 'next'
import { YoScreen } from './YoScreen'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default function YoPage() {
  return <YoScreen />
}
