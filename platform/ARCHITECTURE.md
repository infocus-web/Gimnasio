# Evolution Platform v2 — Arquitectura (Fase 1)

SaaS multi-gimnasio sobre **Next.js 16 (App Router) + Supabase + Vercel**.
Evolution Fitness Gym es el primer tenant (`slug = evolution`).

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Tenancy | Una base, `org_id` en todas las tablas + FKs compuestas `(id, org_id)` | Es imposible, a nivel base de datos, vincular un socio de un gimnasio con la clase de otro. |
| Identidad vs. rol | `profiles` (persona global) ≠ `staff` (rol por gimnasio) ≠ `members` (cliente por gimnasio) | La misma persona puede ser trainer en un gym y socia en otro. Los socios sin login (hijos) existen igual. |
| RBAC | La app pregunta **permisos** (`private.has_permission(org, 'billing.write')`), no roles | Matriz `role_permissions` + excepciones por persona. Un owner tiene todo. |
| Familias | `billing_accounts` (1 pagador) → `memberships` → `membership_members` (N socios, tope `plan.max_members`) | El pagador reserva, ve pagos y saca el QR de sus dependientes. |
| Pagos | Enum `payment_provider` (`mercadopago`, `stripe`, `cash`…) + `provider_*_id` únicos + `webhook_events` | Mercado Pago para Argentina hoy, Stripe listo sin tocar el esquema. Webhooks idempotentes. |
| Reservas | Solo vía `public.book_class()` (SQL, transacción + `FOR UPDATE`) | Chequear cupo en TypeScript y después insertar es una condición de carrera. |
| Recursos | Constraints `EXCLUDE USING gist` sobre `tstzrange` | Sala, profe, equipo y socio no pueden superponerse **nunca**, ni por un bug. |
| Check-in | QR dinámico HMAC que rota cada 30 s (`get_checkin_token` / `checkin_scan`) | Una captura de pantalla vieja no sirve para entrar. |
| Automatizaciones | Outbox `domain_events` (triggers) → worker cron → `automation_runs` (dedupe) | Event-driven, reintentable, sin mandar dos veces el mismo email. |
| Montos | `bigint` en centavos + moneda | Nunca `float` para dinero. |

## Modelo de datos

```
organizations ─┬─ locations ─┬─ rooms ── equipment (bici #12)
               │             └─ checkins
               ├─ staff (owner/admin/staff/trainer) ── staff_permission_overrides
               │     └─ trainer_clients ──┐
               ├─ members ◄───────────────┘ (user_id opcional)
               │     └─ billing_accounts (pagador) ── memberships ── membership_members
               │                                        │   └─ invoices ── payments
               ├─ membership_plans ── plan_class_types ─┐
               ├─ class_types ── class_series ── class_sessions ── bookings
               ├─ exercises ── workout_programs ── program_workouts ── program_exercises
               │     program_assignments (trainer → socio) ── workout_logs ── set_logs
               │     body_metrics
               └─ automation_workflows ── automation_steps ── automation_runs ◄── domain_events
```

### Cruce de las 4 variables (anti-overbooking)

| Variable | Garantía |
|---|---|
| Horario | `class_sessions.during tstzrange` (generado) |
| Sala | `EXCLUDE (room_id =, during &&)` + cupo ≤ capacidad de la sala (trigger) |
| Staff | `EXCLUDE (instructor_id =, during &&)` |
| Equipo | `EXCLUDE (equipment_id =, during &&)` en `bookings` + cupo ≤ equipos activos (trigger) |
| Socio | `EXCLUDE (member_id =, during &&)` + `UNIQUE (session_id, member_id)` activo |
| Cupo | `book_class()` bloquea la fila de la sesión → las reservas concurrentes se hacen en fila |

Probado en local: 10 reservas simultáneas sobre una clase de 3 lugares → exactamente 3 confirmadas, 3 bicis distintas, 7 `CLASS_FULL`.

### Separación Entrenador / Cliente (RLS)

| Tabla | Cliente | Entrenador | Staff / Admin |
|---|---|---|---|
| `members` | Él y su grupo familiar | Solo sus alumnos + inscriptos en sus clases | `members.read` |
| `program_assignments` | Lee las suyas | Crea/edita solo para sus alumnos | `training.manage_all` |
| `workout_logs`, `set_logs`, `body_metrics` | **Escribe** | **Solo lee** (no puede inventar progreso) | `training.manage_all` |
| `bookings` | Las suyas (sin INSERT directo) | Lista de sus clases | `bookings.manage` |
| `payments` | Solo si es el pagador | ✗ | `billing.read` |

## Estructura de directorios

`●` = ya existe en esta entrega · `○` = próximas fases

```
Gimnasio/                          (repo infocus-web/Gimnasio)
├── src/, api/, index.html …       v1 (Vite) — sigue en producción hasta el corte
├── supabase/
│   ├── migrations/
│   │   ├── 0001…0004              ● v1
│   │   ├── 0005_platform_core.sql           ● tenancy, RBAC, socios, familias, pagos, outbox
│   │   ├── 0006_scheduling_bookings.sql     ● recursos, agenda, book_class, check-in QR
│   │   ├── 0007_training_automation.sql     ● two-sided training, workflows
│   │   ├── 0008_rls_policies.sql            ● RLS + grants
│   │   └── 0009_migrate_legacy_data.sql     ● Evolution como primer tenant
│   └── test/
│       ├── stub_supabase_v2.sql   ●
│       ├── scenario_v2.sql        ● pruebas de reglas y RLS
│       └── run_v2.sh              ●
└── platform/                      ● app Next.js (nuevo Root Directory en Vercel al cortar)
    ├── next.config.ts             ●
    ├── .env.example               ●
    └── src/
        ├── proxy.ts               ● refresh de sesión + tenant por subdominio
        ├── app/
        │   ├── layout.tsx         ●
        │   ├── (marketing)/       ○ landing del SaaS, precios
        │   ├── (auth)/            ○ login, signup, callback, invitación
        │   ├── [org]/
        │   │   ├── (public)/      ○ web del gimnasio (estilo Ales), horarios, planes
        │   │   ├── admin/         ○ layout exige staff con permisos
        │   │   │   ├── page.tsx               dashboard / KPIs
        │   │   │   ├── members/[memberId]/    ficha, familia, membresías
        │   │   │   ├── schedule/              agenda, salas, equipos, series
        │   │   │   ├── billing/               planes, facturas, pagos
        │   │   │   ├── reception/             escáner QR (checkin_scan)
        │   │   │   ├── automations/           editor de workflows
        │   │   │   └── settings/staff/        roles y permisos
        │   │   ├── coach/         ○ vista ENTRENADOR
        │   │   │   ├── clients/[memberId]/    progreso, logs, métricas
        │   │   │   ├── programs/[programId]/  constructor de rutinas
        │   │   │   └── classes/[sessionId]/   lista de asistentes
        │   │   └── app/           ○ vista CLIENTE (mobile-first, PWA)
        │   │       ├── page.tsx               próximas clases + reservar en 1 clic
        │   │       ├── checkin/               QR dinámico (se refresca cada 30 s)
        │   │       ├── workouts/[logId]/      registrar series, pesos, reps
        │   │       ├── progress/              métricas corporales
        │   │       ├── family/                dependientes
        │   │       └── billing/               pagos y membresía
        │   └── api/
        │       ├── bookings/route.ts                ● POST reservar
        │       ├── bookings/[bookingId]/route.ts    ● DELETE cancelar
        │       ├── checkin/route.ts                 ○ recepción / molinete
        │       ├── webhooks/mercadopago/route.ts    ○
        │       ├── webhooks/stripe/route.ts         ○
        │       └── cron/automations/route.ts        ○ worker del outbox
        ├── features/              lógica por dominio (schemas zod, queries, componentes)
        │   ├── bookings/schema.ts ●
        │   ├── billing/ ○  checkin/ ○  training/ ○  automations/ ○  members/ ○
        ├── lib/
        │   ├── supabase/{server,client,admin}.ts  ●
        │   ├── api/errors.ts      ● códigos SQL → HTTP
        │   └── payments/{mercadopago,stripe}.ts   ○ adaptadores del proveedor
        └── types/database.types.ts ● (reemplazar con `npm run db:types`)
```

## Cómo aplicarlo

1. **Probar local** (Postgres 15+): `PGHOST=localhost PGUSER=postgres supabase/test/run_v2.sh`
2. **Supabase**: aplicar `0005` a `0009` primero en un **branch** del proyecto, y después en producción.
   ⚠️ En el momento en que se aplica `0005`, la v1 deja de funcionar (sus tablas pasan al schema `legacy`).
   Hoy la v1 tiene 0 socios y 0 pagos, así que el corte no pierde datos.
3. `cd platform && npm install && npm run db:types && npm run dev`
4. **Vercel** (proyecto `evolution-fitness-gym`): Settings → Build → Root Directory = `platform`, Framework = Next.js,
   variables de `.env.example`.

## Próximas fases

- **Fase 2**: portal del socio (reservar en 1 clic, QR, pagos) + panel admin de agenda y socios.
- **Fase 3**: webhooks de Mercado Pago/Stripe + worker de automatizaciones (Resend para emails).
- **Fase 4**: vista entrenador + registro de entrenamiento del cliente.
- Pendientes de diseño: ausencias del staff, generador de sesiones desde `class_series`,
  rate limiting en `/api/bookings`, molinete/ZKTeco llamando a `checkin_scan`.
