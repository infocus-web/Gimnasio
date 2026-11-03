import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata, Route } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getAdminContext } from '@/features/admin/context'
import { createClient } from '@/lib/supabase/server'
import { saveAssessment } from '@/features/admin/assessment-actions'
import { AssessmentForm } from '@/features/admin/AssessmentForms'
import { todayYMD } from '@/features/admin/format'
import { ageOn } from '@/features/assessment/scoring'
import { Card } from '@/features/admin/ui'

export const metadata: Metadata = { title: 'Evolution Check' }

export default async function AssessmentPage({ params }: PageProps<'/[org]/admin/alumnos/[memberId]/evaluacion'>) {
  const { org: slug, memberId } = await params
  const ctx = await getAdminContext(slug)
  if (!ctx) return null
  if (ctx.staff.role !== 'trainer' && !ctx.can('training.manage_all')) return <p className="text-sm text-zinc-400">Esta sección es para profesores.</p>
  const supabase = await createClient()

  const [{ data: s }, { data: member }, { data: last }] = await Promise.all([
    supabase.from('coach_client_overview').select('member_name').eq('member_id', memberId).eq('org_id', ctx.org.id).maybeSingle(),
    supabase.from('members').select('birth_date').eq('id', memberId).maybeSingle(),
    supabase.from('fitness_assessments').select('sex, height_cm').eq('member_id', memberId).order('assessed_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!s) notFound()
  const today = todayYMD(ctx.org.timezone)

  return (
    <div className="space-y-5">
      <Link href={`/${slug}/admin/alumnos/${memberId}` as Route} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {s.member_name}
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-white">Evolution Check</h1>
        <p className="text-sm text-zinc-400">
          Evaluación física de 15 minutos. Cargá las pruebas que hagas (todas son opcionales); con 3 áreas o más se calcula la edad fitness. El
          alumno ve el resultado en la app y la IA lo usa para sugerir su rutina. Conviene repetirla cada 8 a 12 semanas.
        </p>
      </div>
      <Card title={`Nueva evaluación · ${s.member_name}`}>
        <AssessmentForm
          action={saveAssessment.bind(null, slug, memberId)}
          today={today}
          defaults={{
            sex: (last?.sex as 'F' | 'M' | undefined) ?? null,
            age: ageOn(member?.birth_date ?? null, today),
            height: last?.height_cm ?? null,
          }}
        />
      </Card>
    </div>
  )
}
