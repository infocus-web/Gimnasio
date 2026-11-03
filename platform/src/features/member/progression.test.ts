// Pruebas de la sugerencia de carga y del puntaje del Evolution Check:
//   node --experimental-strip-types src/features/member/progression.test.ts
import assert from 'node:assert/strict'
// @ts-ignore -- extensión .ts para correr directo con node --experimental-strip-types
import { parseRepRange, suggestLoad } from './progression.ts'
// @ts-ignore
import { ageOn, scoreAssessment } from '../assessment/scoring.ts'

assert.deepEqual(parseRepRange('8-12'), [8, 12])
assert.deepEqual(parseRepRange('10'), [10, 10])
assert.equal(parseRepRange('AMRAP'), null)
assert.equal(parseRepRange('30 s'), null)

const s = (reps: number, kg: number, rpe?: number) => ({ reps, weightKg: kg, rpe })

// Completó 3×12 con 60 kg → sube 2,5
assert.deepEqual(suggestLoad([s(12, 60), s(12, 60), s(12, 60)], 3, '8-12', 3)?.weightKg, 62.5)
// Mancuernas livianas → +1
assert.equal(suggestLoad([s(12, 10), s(12, 10), s(12, 10)], 3, '10-12', 3)?.weightKg, 11)
// Llegó pero al límite (RPE 10) → mantiene
assert.equal(suggestLoad([s(12, 60, 8), s(12, 60, 10), s(12, 60, 10)], 3, '8-12', 3)?.kind, 'keep')
// Le faltó una serie → mantiene
assert.equal(suggestLoad([s(12, 60), s(12, 60)], 3, '8-12', 3)?.kind, 'keep')
// No llegó al mínimo en la mayoría → baja 5 % redondeado a 2,5
const down = suggestLoad([s(6, 80), s(5, 80), s(9, 80)], 3, '8-12', 3)
assert.equal(down?.kind, 'down')
assert.equal(down?.weightKg, 75)
// Series de calentamiento con menos peso no cuentan
assert.equal(suggestLoad([s(15, 40), s(12, 60), s(12, 60), s(12, 60)], 3, '8-12', 3)?.weightKg, 62.5)
// Volvió después de 4 semanas → mantiene
assert.equal(suggestLoad([s(12, 60), s(12, 60), s(12, 60)], 3, '8-12', 28)?.kind, 'back')
// Sin peso (peso corporal) o reps no numéricas → sin sugerencia
assert.equal(suggestLoad([s(12, 0)], 3, '8-12', 3), null)
assert.equal(suggestLoad([s(12, 60)], 3, 'AMRAP', 3), null)

// ---- Evolution Check ----
assert.equal(ageOn('1986-11-03', '2026-11-02'), 39)
assert.equal(ageOn('1986-11-03', '2026-11-03'), 40)
const fit = scoreAssessment({ sex: 'M', age_years: 40, squats_1min: 42, pushups: 27, plank_s: 120, sit_reach_cm: 10, balance_s: 25, step_hr: 83, body_fat_pct: 14 })
assert.equal(fit.areas.length, 6)
assert.ok(fit.areas.every((a) => a.score >= 85), 'todo excelente')
assert.ok(fit.fitnessAge! < 32, 'edad fitness menor')
assert.equal(fit.focus.length, 0)
const weak = scoreAssessment({ sex: 'F', age_years: 50, squats_1min: 10, plank_s: 15, resting_hr: 90 })
assert.ok(weak.fitnessAge! > 55, 'edad fitness mayor')
assert.deepEqual(weak.focus.map((a) => a.key).length, 2)
assert.equal(scoreAssessment({ sex: 'M', age_years: 30, pushups: 20 }).fitnessAge, null, 'con menos de 3 áreas no hay edad fitness')
// Pulso más bajo = mejor
assert.ok(
  scoreAssessment({ sex: 'M', age_years: 30, step_hr: 85 }).areas[0]!.score > scoreAssessment({ sex: 'M', age_years: 30, step_hr: 120 }).areas[0]!.score,
)
console.log('progresión y Evolution Check: OK')

// ---- CSV de balanza ----
// @ts-ignore
import { parseScaleCsv } from '../assessment/scale-csv.ts'
const inbody = parseScaleCsv('ID,Test Date / Time,Weight,SMM(Skeletal Muscle Mass),PBF(Percent Body Fat),Visceral Fat Level,BMR(Basal Metabolic Rate)\n30111222,20261102103000,81.2,35.1,21.5,8,1750\n123,20261102103000,80,30,20,5,1600\n')
assert.equal(inbody.error, undefined)
assert.equal(inbody.rows.length, 1)
assert.equal(inbody.skipped, 1)
assert.deepEqual(inbody.rows[0], { dni: '30111222', measured_at: '2026-11-02T10:30:00-03:00', weight_kg: 81.2, body_fat_pct: 21.5, muscle_kg: 35.1, visceral_fat: 8, water_pct: null, bmr_kcal: 1750 })
const tanita = parseScaleCsv('DNI;Fecha;Hora;Peso (kg);Grasa %;Agua %;Masa muscular\n"30.111.222";02/11/2026;08:15;81,2;21,5;55,3;60,1\n')
assert.deepEqual(tanita.rows[0], { dni: '30111222', measured_at: '2026-11-02T08:15:00-03:00', weight_kg: 81.2, body_fat_pct: 21.5, muscle_kg: 60.1, visceral_fat: null, water_pct: 55.3, bmr_kcal: null })
assert.ok(parseScaleCsv('Nombre,Peso\nJuan,80\n').error)
console.log('CSV de balanza: OK')
