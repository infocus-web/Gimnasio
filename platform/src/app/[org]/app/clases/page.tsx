import type { Metadata } from 'next'
import { ClassesScreen } from './ClassesScreen'

export const metadata: Metadata = { title: 'Clases' }

export default function ClasesPage() {
  return <ClassesScreen />
}
