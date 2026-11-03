import Link from 'next/link'
import type { Metadata, Route } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { importScaleCsv } from '@/features/admin/assessment-actions'
import { ScaleImportForm } from '@/features/admin/AssessmentForms'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Importar balanza' }

export default async function ScaleImportPage({ params }: PageProps<'/[org]/admin/alumnos/balanza'>) {
  const { org: slug } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (ctx.staff.role !== 'trainer' && !ctx.can('training.manage_all')) return <p className="text-sm text-zinc-400">Esta sección es para profesores.</p>
  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/alumnos` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Alumnos
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-white">Importar mediciones de la balanza</h1>
        <p className="text-sm text-zinc-400">
          Para balanzas de bioimpedancia (InBody, Tanita, Omron…). Exportá las mediciones a CSV desde el programa de la balanza (en InBody:
          LookinBody → Exportar) y subilo acá. Se asignan a cada socio por DNI y no se duplican si subís el mismo archivo dos veces.
        </p>
      </div>
      <Card title="Subir archivo">
        <ScaleImportForm action={importScaleCsv.bind(null, slug)} />
      </Card>
      <Card title="Qué columnas reconocemos">
        <ul className="list-inside list-disc space-y-1 text-sm text-zinc-300">
          <li><strong className="text-white">DNI</strong> del socio (columna DNI, Documento o ID). En la balanza cargá el DNI como ID de cada persona.</li>
          <li><strong className="text-white">Fecha</strong> (y hora si está en otra columna). Acepta día/mes/año, año-mes-día y el formato de InBody.</li>
          <li><strong className="text-white">Peso</strong> y/o <strong className="text-white">% de grasa</strong> (PBF).</li>
          <li>Opcionales: masa muscular (SMM), grasa visceral, agua (%), metabolismo basal (BMR).</li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">También podés cargar una medición a mano desde la ficha de cada alumno.</p>
      </Card>
    </div>
  )
}
