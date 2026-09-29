Sos un desarrollador frontend senior. Vas a evolucionar la UI de "Evolution Fitness" que ya armaste (estética cyber: negro + amarillo #edcc36, glassmorphism, Orbitron/JetBrains Mono, mobile-first). MANTENÉ exactamente ese estilo visual.

## Contexto técnico (muy importante)
- El backend ya existe (Supabase + Next.js). Otro desarrollador va a conectar tus componentes a los datos reales. Tu trabajo es SOLO la capa visual.
- Stack: React 19 + TypeScript estricto + Tailwind CSS 4 + lucide-react + motion. Nada más, salvo `qrcode` (para dibujar QR) y `html5-qrcode` (para escanear con cámara).
- Los componentes tienen que ser "presentacionales": reciben datos por props tipadas y avisan acciones por callbacks (`onBook`, `onCancel`, `onScan`...). NO guardes datos en localStorage, NO simules pagos, NO inventes lógica de negocio.
- Poné todos los datos de ejemplo en UN solo archivo: `src/mocks/demoData.ts`.
- Compatible con Next.js App Router: nada de react-router, no uses `window`/`document` fuera de useEffect, y poné `'use client'` solo en los componentes interactivos.
- Cada pantalla tiene que tener sus estados: cargando (skeleton), vacío, error y éxito.
- Accesibilidad: botones de 44px mínimo, contraste AA, `aria-label` en los íconos y respetar `prefers-reduced-motion`.
- Textos en español rioplatense (vos), sin promesas falsas. Nada de "holograma", "biomecánica nominal", "0.2 segundos" ni datos inventados. Los nombres de los planes y los precios vienen por props.
- Borrá lo que no se usa: @google/genai, express, dotenv, el Navbar duplicado y el README de AI Studio.

## Tipos que tenés que usar (no los cambies)
```ts
export type BookingStatus = 'booked' | 'waitlisted' | 'canceled' | 'late_canceled' | 'checked_in' | 'no_show'
export type MembershipStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired'

export interface ClassSession {
  id: string
  className: string
  color: string                 // color del tipo de clase
  roomName: string
  instructorName: string
  instructorPhotoUrl?: string
  startsAt: string              // ISO
  endsAt: string
  capacity: number
  spotsLeft: number
  waitlistLeft: number
  usesEquipment: boolean        // ej. spinning → hay que elegir bici
  myBooking?: { id: string; status: BookingStatus; waitlistPosition?: number | null; equipmentLabel?: string | null }
}
export interface EquipmentSpot { id: string; label: string; taken: boolean; row: number; col: number }
export interface CheckinToken { token: string; expiresAt: string; refreshInSeconds: number }
export interface MembershipSummary { planName: string; status: MembershipStatus; currentPeriodEnd: string; creditsRemaining: number | null }
export interface FamilyMember { id: string; firstName: string; lastName: string; photoUrl?: string; isMe: boolean }
export interface PrescribedExercise { id: string; name: string; muscleGroup?: string; videoUrl?: string; targetSets: number; targetReps: string; targetWeightKg?: number | null; restSeconds: number; notes?: string }
export interface LoggedSet { exerciseId: string; setNumber: number; reps: number; weightKg: number; rpe?: number }
export interface CheckinResult {
  found: boolean; allowed: boolean; duplicate?: boolean
  reason?: 'QR_EXPIRED_OR_INVALID' | 'MEMBER_NOT_FOUND' | 'NO_ACTIVE_MEMBERSHIP' | 'IN_GRACE_PERIOD' | 'MEMBER_FROZEN' | null
  member?: { firstName: string; lastName: string; photoUrl?: string; medicalNotes?: string }
}
// Errores que puede devolver una reserva (mostrá un mensaje claro para cada uno):
export type BookingErrorCode = 'MEMBERSHIP_REQUIRED' | 'PAYMENT_PAST_DUE' | 'CLASS_FULL' | 'ALREADY_BOOKED'
  | 'EQUIPMENT_TAKEN' | 'PLAN_EXCLUDES_CLASS_TYPE' | 'NO_CREDITS_LEFT' | 'WEEKLY_LIMIT_REACHED'
  | 'BOOKING_CLOSED' | 'MEMBER_TIME_CONFLICT'
```

## Qué construir (Fase A), en este orden

1. **Pase QR dinámico real** (`MemberQrPass`)
   - Recibe `token: CheckinToken` y `onRefresh()`. Dibujá el QR REAL del texto `token.token` con la librería `qrcode` (nada de SVG decorativo).
   - Cuenta regresiva hasta `expiresAt`; al llegar a 0 llama a `onRefresh()`. Aclaración visible: "El código cambia cada 30 s. Las capturas de pantalla no sirven".
   - Si `membership.status` es `past_due` o `expired`, el pase se ve bloqueado y aparece un botón "Regularizar pago" (`onPay`).
   - Selector de familia (`FamilyMember[]`): si el usuario tiene dependientes, puede cambiar a "Pase de Tomás".

2. **Escáner de recepción con cámara** (`ReceptionScanner`)
   - Usa `html5-qrcode` con la cámara trasera o la webcam, con selector de cámara. Al leer un código llama a `onScan(text)` y muestra el `CheckinResult` que recibe por props.
   - Resultado a pantalla completa: VERDE (autorizado), ÁMBAR (en período de tolerancia) o ROJO (denegado + motivo). Foto grande y notas médicas destacadas. Pitido distinto para cada caso. Vuelve solo a "esperando" a los 3 s.
   - Tiene que funcionar también con lector USB (el lector "tipea" el código y después Enter): un input invisible que siempre tenga el foco.
   - Búsqueda manual por nombre/DNI (`onSearch`).

3. **Reserva de clases en 1 toque** (`ClassSchedule`)
   - Agenda por día (tira horizontal de 7 días) con tarjetas `ClassSession`: color, profe, sala, lugares libres ("3 lugares" / "Lista de espera: 2").
   - Botón principal según el estado: Reservar / En lista de espera (#N) / Reservado ✓ / Cancelar.
   - Si `usesEquipment`, antes de confirmar abrí un **mapa de la sala** con los `EquipmentSpot` en grilla (row/col): bicis libres, ocupadas y la tuya. Opción "Asignarme cualquiera".
   - Si falta menos de la ventana de cancelación, avisar "Si cancelás ahora no se devuelve el crédito".
   - Actualización optimista + mensaje de error mapeado a `BookingErrorCode`.
   - Selector "Reservar para: Yo / Tomás" (familia).

4. **Modo Entrenamiento Activo** (`ActiveWorkout`)
   - Pantalla completa, fondo negro, cifras GIGANTES (carga y reps legibles a 2 m).
   - Botón enorme "Serie completada" → registra el `LoggedSet` (`onLogSet`) y arranca solo el descanso, con cuenta regresiva y aviso sonoro + vibración (`navigator.vibrate`).
   - Selector rápido de RPE 1–10 y un +/- para ajustar peso y reps antes de confirmar.
   - Mantener la pantalla encendida (Wake Lock API, si está disponible).
   - Ver el video del ejercicio (`videoUrl`) en un modal.

5. **Calculadora de discos** (`PlateCalculator`)
   - Recibe `targetKg`, `barKg` (20 por defecto) y `availablePlates: number[]` (los discos que tiene el gimnasio). Dibujá la barra con los discos de cada lado, estilo negro mate con borde amarillo.
   - Si el peso no se puede armar exacto, mostrar el más cercano. Se abre tocando la carga en el Modo Entrenamiento.

6. **1RM y progreso** (`StrengthProgress`)
   - Calculá el 1RM estimado con Epley a partir de `LoggedSet[]` históricos, mostrá un gráfico de evolución por ejercicio (SVG propio o recharts) y una tabla de % (90/80/70) con el peso sugerido para 3, 5, 8, 10 y 12 reps.

7. **Horarios pico** (`PeakHours`)
   - Recibe `{ weekday: number; hour: number; avgCheckins: number }[]` y dibuja un mapa de calor (días × horas) + "Ahora: tranquilo / moderado / lleno" según `currentEstimate`. SIN porcentajes por zona.

8. **Banner de estado de cuenta** (`MembershipBanner`)
   - Plan, vencimiento, créditos restantes (packs). Si `past_due`: banner rojo "Tu pago falló — reservas suspendidas" + botón "Pagar con Mercado Pago" (`onPay`).

## Entrega
- Un archivo por componente en `src/components/<área>/`, con los tipos en `src/types/platform.ts` y los mocks en `src/mocks/demoData.ts`.
- Una página demo (`App.tsx`) que muestre cada componente con los mocks y con todos sus estados (cargando/vacío/error), para poder revisarlos.
- `npm run build` y `tsc --noEmit` tienen que pasar sin errores.
