# Graph Report - Gimnasio  (2026-11-19)

## Corpus Check
- 510 files · ~5,584,790 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3504 nodes · 9315 edges · 230 communities (148 shown, 33 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6ca276b2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- TurnstileKiosk.tsx
- createClient
- agente.py
- 0028_engagement.sql
- encuestas/page.tsx
- 0005_platform_core.sql
- StaffLoginForm.tsx
- buffet/actions.ts
- billing-actions.ts
- board-actions.ts
- 0031_floor_owner.sql
- online/page.tsx
- Portal.tsx
- dbMessage
- camaras.py
- createAdminClient
- [sessionId]/page.tsx
- negocio/page.tsx
- errorText
- admin/actions.ts
- _lib.ts
- react
- formObject
- next
- expo
- 0001_init.sql
- 0029_access_plus.sql
- 0030_payments_mp.sql
- 0040_trainer_panel.sql
- MemberDetail.tsx
- pases/page.tsx
- 0039_friend_promos.sql
- 0036_retention_assessments.sql
- src/components/ui.tsx
- 0006_scheduling_bookings.sql
- ActiveWorkout.tsx
- 0014_payments_schedule_mfa.sql
- 0052_buffet.sql
- accesos/page.tsx
- context.ts
- server.ts
- RatesForm.tsx
- VideoRTC
- app-ios/package.json
- public.payment_ledger
- public.payment_ledger
- labels.ts
- Button
- dependencies
- index.tsx
- retention.ts
- admin/layout.tsx
- engagement/actions.ts
- intermediario.py
- platform.ts
- payments/actions.ts
- 0007_training_automation.sql
- App.tsx
- app-ios/src/components/ui.tsx
- AuthProvider.tsx
- public.org_report
- platform/package.json
- steps
- padron-actions.ts
- PassScreen.tsx
- 0013_admin_panel.sql
- 0020_access_devices.sql
- package.json
- zod
- compilerOptions
- compilerOptions
- routine/route.ts
- assessment-actions.ts
- ReceptionScreen.tsx
- referidos/page.tsx
- 0018_audit_fixes.sql
- mercadopago.ts
- dependencies
- scoring.ts
- public.turnstile_scan
- compilerOptions
- main
- useMember
- Portero
- admin/staff-account-actions.ts
- ref_lucide_react
- @types/react
- [...path]/route.ts
- 0050_tv_pair_and_class_boards.sql
- dependencies
- PeakHours.tsx
- aplicar_0032_0033.sql
- 0038_public_signup.sql
- clases.tsx
- HelpVideoButton.tsx
- createClient
- public.class_sessions_availability
- 0033_product_costs.sql
- getPublicGym
- TodayLive.tsx
- public.access_devices
- 0041_member_password_login.sql
- compilerOptions
- @types/react-dom
- CLAUDE.md
- SoundEngine
- private.link_user_by_email
- Dashboard.tsx
- public.floor_tv_settings
- social.ts
- _claude_tmp/YoScreen.tsx
- [org]/page.tsx
- MemberProvider.tsx
- _claude_tmp/LoginForm.tsx
- test.check
- public.agent_call
- scenario_engagement.sql
- (tabs)/_layout.tsx
- [programId]/page.tsx
- 0034_trainer_tools.sql
- public.public_gym_profile
- public.members
- private.member_access_allowed
- public.public_today
- app-ios/tsconfig.json
- pantalla-tv-descartada/page.tsx
- scripts
- .oxlintrc.json
- scripts
- ReportCharts.tsx
- @supabase/ssr
- scripts
- public.message_outbox
- public.member_delete
- stub_supabase.sql
- 0056_mp_subscriptions.sql
- 0042_signup_link_on_confirm.sql
- vercel.json
- public.access_device_query_users
- floor/actions.ts
- platform/vercel.json
- 0044_kiosk_pair_code.sql
- 0048_kiosk_slides.sql
- private.member_file_allowed
- test.qr
- tsconfig.json
- access_forget_member_bio
- access_on_billing
- access_on_member
- access_on_membership
- access_on_membership_member
- members_assign_pin
- 0009_migrate_legacy_data.sql
- run_v2.sh
- scenario_product_costs.sql
- public.floor_settings
- public.buffet_items
- public.members
- public.engagement_settings
- public.kiosk_slides
- public.settings
- storage.buckets
- public.organizations
- public.workout_programs
- public.products
- public.workout_programs
- public.floor_settings
- public.members
- public.floor_settings
- public.buffet_items
- formatMoney
- Hijo
- sys
- private.mp_surcharge
- Cámaras (PC del gimnasio)
- public.rename_room
- Card
- public.rename_room
- equipo/clave/page.tsx
- retention-actions.ts
- login/actions.ts

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 292 edges
2. `getAdminContext` - 201 edges
3. `next` - 150 edges
4. `react` - 130 edges
5. `useActionForm()` - 117 edges
6. `dbMessage()` - 102 edges
7. `createAdminClient()` - 66 edges
8. `ActionState` - 65 edges
9. `Notice()` - 65 edges
10. `SubmitButton()` - 61 edges

## Surprising Connections (you probably didn't know these)
- `@supabase/supabase-js@^2.117.2` --declares--> `@supabase/supabase-js`  [EXTRACTED]
  platform/package.json → package.json
- `typescript@~6.0.2` --declares--> `typescript`  [EXTRACTED]
  platform/package.json → package.json
- `@types/react@^19.2.18` --declares--> `@types/react`  [EXTRACTED]
  platform/package.json → package.json
- `MiniForm()` --calls--> `useActionForm()`  [EXTRACTED]
  platform/src/features/buffet/AdminForms.tsx → platform/src/features/admin/ui.tsx
- `confirm()` --calls--> `createClient()`  [EXTRACTED]
  platform/src/app/auth/confirm/page.tsx → platform/src/lib/supabase/server.ts

## Import Cycles
- None detected.

## Communities (230 total, 33 thin omitted)

### Community 0 - "TurnstileKiosk.tsx"
Cohesion: 0.05
Nodes (66): dynamic, GET(), metadata, ScreensPage(), AD_SLIDES, call(), cookieName(), deniedText() (+58 more)

### Community 1 - "createClient"
Cohesion: 0.08
Nodes (45): AccessPage(), CamerasPage(), HistorialPage(), ComunicacionPage(), AdminLayout(), MachinesPage(), metadata, TemplatesPage() (+37 more)

### Community 2 - "agente.py"
Cohesion: 0.11
Nodes (29): base64, datetime, hashlib, logging_handlers, socket, time, ciclo(), ejecutar_cola() (+21 more)

### Community 3 - "0028_engagement.sql"
Cohesion: 0.05
Nodes (42): isl, lateral, private.engagement_on_membership_member, private.engagement_on_org, private.engagement_on_payment, runs, membership_members_engagement, organizations_engagement_seed (+34 more)

### Community 4 - "encuestas/page.tsx"
Cohesion: 0.11
Nodes (33): metadata, StudentsPage(), EncuestasPage(), metadata, npsTone(), PERIODS, scoreTone(), metadata (+25 more)

### Community 5 - "0005_platform_core.sql"
Cohesion: 0.07
Nodes (46): public.members_create_secret, public.members_guard, public.membership_members_guard, public.memberships_emit_events, public.staff_guard, members_create_secret, members_guard, members_touch (+38 more)

### Community 6 - "StaffLoginForm.tsx"
Cohesion: 0.53
Nodes (4): metadata, StaffLoginPage(), safeNext(), StaffLoginForm()

### Community 7 - "buffet/actions.ts"
Cohesion: 0.05
Nodes (93): BuffetSettingsPage(), metadata, asInput(), BuffetCartaPage(), Item, metadata, asInput(), BuffetMenuPage() (+85 more)

### Community 8 - "billing-actions.ts"
Cohesion: 0.07
Nodes (34): metadata, issueDayPass(), METHODS, PassActionState, savePlanHours(), toCents(), passError(), isValidTime() (+26 more)

### Community 9 - "board-actions.ts"
Cohesion: 0.13
Nodes (37): BoardPage(), metadata, dynamic, json(), POST(), BOARD_ERRORS, boardCtx(), BoardInput (+29 more)

### Community 10 - "0031_floor_owner.sql"
Cohesion: 0.06
Nodes (31): public.program_exercises, public.program_workouts, machines_touch, private.can_manage_floor(), private.machine_code(), public.ai_routine_create_draft(), public.ai_routine_usage(), public.ai_usage_log (+23 more)

### Community 11 - "online/page.tsx"
Cohesion: 0.11
Nodes (19): dynamic, metadata, Site, CierrePage(), metadata, Totals, metadata, OnlinePage() (+11 more)

### Community 12 - "Portal.tsx"
Cohesion: 0.11
Nodes (32): QrImage(), cx(), Spinner(), VideoPlayer(), videoThumb(), WeekSchedule(), fmtDateLong(), fmtTime() (+24 more)

### Community 13 - "dbMessage"
Cohesion: 0.19
Nodes (22): addProgramExercise(), addWorkoutDay(), assignProgram(), assignProgramToMany(), assignTrainer(), ATTENDANCE_ERRORS, coach(), createExercise() (+14 more)

### Community 14 - "camaras.py"
Cohesion: 0.14
Nodes (26): ctypes, aqui(), asistente(), configurar(), copiar_programas(), desinstalar(), detener_todo(), es_admin() (+18 more)

### Community 15 - "createAdminClient"
Cohesion: 0.09
Nodes (30): ACTIONS, dynamic, json(), POST(), dynamic, json(), POST(), dynamic (+22 more)

### Community 16 - "[sessionId]/page.tsx"
Cohesion: 0.15
Nodes (21): ActivitiesPage(), metadata, metadata, RoomsPage(), metadata, SessionPage(), STATUS, EQUIPMENT_KINDS (+13 more)

### Community 17 - "negocio/page.tsx"
Cohesion: 0.16
Nodes (22): DashboardBody(), metadata, n(), TABS, Delta(), Heatmap(), Kpi(), PeakVsClasses() (+14 more)

### Community 18 - "errorText"
Cohesion: 0.12
Nodes (38): Badge(), confirmDelete(), errorText(), Field(), Loading(), uploadMedia(), RoutineItem, Activities() (+30 more)

### Community 19 - "admin/actions.ts"
Cohesion: 0.15
Nodes (22): BILLING_PERMS, createMember(), DELETE_MESSAGES, deleteMember(), emailAccessLink(), fieldErrors(), inviteSchema, inviteStaff() (+14 more)

### Community 20 - "_lib.ts"
Cohesion: 0.21
Nodes (32): GET, POST, Member, METHOD, sendBirthday(), sendExpired(), sendReceipt(), sendReminder() (+24 more)

### Community 21 - "react"
Cohesion: 0.07
Nodes (71): DAYS, EMPTY, PlanHoursForm(), formatWindows(), parseWindows(), AgentPanel(), Bare, CopyValue() (+63 more)

### Community 22 - "formObject"
Cohesion: 0.22
Nodes (26): formObject(), addEquipment(), bookForMember(), cancelBookingDesk(), cancelSession(), classGuard(), createSeries(), createSeriesRpc() (+18 more)

### Community 23 - "next"
Cohesion: 0.07
Nodes (12): nextConfig, platform_src_app_globals, metadata, SITE, viewport, metadata, GET(), SITE (+4 more)

### Community 24 - "expo"
Cohesion: 0.06
Nodes (35): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, predictiveBackGestureEnabled, usesNonExemptEncryption (+27 more)

### Community 25 - "0001_init.sql"
Cohesion: 0.08
Nodes (27): public.after_payment_delete, public.member_routines, public.protect_profile_role, public.routine_items, public.routines, members_touch, on_auth_user_created, payments_after_delete (+19 more)

### Community 26 - "0029_access_plus.sql"
Cohesion: 0.06
Nodes (15): private.day_pass_refresh(), private.gym_occupancy_calc(), public.member_issue_guest_pass(), public.turnstile_scan(), anon, authenticated, public, public.access_commands (+7 more)

### Community 27 - "0030_payments_mp.sql"
Cohesion: 0.10
Nodes (31): public.online_sale_settings, payment_intents_touch, private.assign_plan_core(), private.cash_shift_start(), private.cash_shift_totals(), private.record_payment_core(), private.settle_day_pass(), products_touch (+23 more)

### Community 28 - "0040_trainer_panel.sql"
Cohesion: 0.09
Nodes (29): message_templates_touch, private.can_edit_class(), private.my_staff_id(), private.notify_session_change(), private.series_conflict(), private.series_validate(), public.apply_series_to_future(), public.book_class() (+21 more)

### Community 29 - "MemberDetail.tsx"
Cohesion: 0.14
Nodes (27): Modal(), fmtDate(), fmtDateTime(), fmtMoney(), METHOD_LABEL, todayISO(), callApi(), Checkin (+19 more)

### Community 30 - "pases/page.tsx"
Cohesion: 0.20
Nodes (12): metadata, FILTERS, metadata, PassesPage(), PAY, InfoTip(), AccessSettingsForm(), IssuePassForm() (+4 more)

### Community 31 - "0039_friend_promos.sql"
Cohesion: 0.11
Nodes (28): public.member_referral_codes, public.plan_class_types, public.referrals, private.cross_allows(), private.friend_partner(), private.friend_promo(), private.member_plan_ok(), private.resolve_membership_for_class() (+20 more)

### Community 32 - "0036_retention_assessments.sql"
Cohesion: 0.09
Nodes (21): public.challenge_participants, public.challenges, private.challenge_board(), private.challenge_settle_one(), private.is_coach(), private.survey_pending(), public.challenge_admin_list(), public.challenge_settle() (+13 more)

### Community 33 - "src/components/ui.tsx"
Cohesion: 0.12
Nodes (22): Avatar(), Empty(), StatusBadge(), statusStyles, Toast, ToastCtx, useToast(), Variant (+14 more)

### Community 34 - "0006_scheduling_bookings.sql"
Cohesion: 0.16
Nodes (27): public.class_sessions_guard, public.member_secrets, class_sessions_guard, private.promote_waitlist(), private.resolve_membership_for_class(), public.book_class(), public.bookings, public.cancel_booking() (+19 more)

### Community 35 - "ActiveWorkout.tsx"
Cohesion: 0.15
Nodes (26): EntrenarPage(), metadata, WorkoutScreen(), ActiveWorkout(), ActiveWorkoutProps, fmtClock(), fmtKg(), kgFormatter (+18 more)

### Community 36 - "0014_payments_schedule_mfa.sql"
Cohesion: 0.11
Nodes (26): public.role_permissions, public.staff_permission_overrides, private.has_permission(), private.org_midnight(), public.admin_assign_plan(), public.apply_series_to_future(), public.cancel_session(), public.end_series() (+18 more)

### Community 37 - "0052_buffet.sql"
Cohesion: 0.09
Nodes (16): buffet_items_touch, buffet_orders_touch, buffet_settings_touch, public.buffet_items, public.buffet_menu, public.buffet_order_items, public.buffet_orders, public.buffet_payouts (+8 more)

### Community 38 - "accesos/page.tsx"
Cohesion: 0.21
Nodes (18): metadata, METHOD, metadata, RecepcionPage(), createAgentToken(), createKioskToken(), deviceAction(), DeviceOp (+10 more)

### Community 39 - "context.ts"
Cohesion: 0.11
Nodes (13): metadata, metadata, Report, ROLE_LABELS, RequestCard(), RequestRow, ShareLink(), CreateStaffAccountForm() (+5 more)

### Community 40 - "server.ts"
Cohesion: 0.13
Nodes (18): dynamic, dynamic, ExistingMemberPage(), signedUrl(), BRAND, checkSignupDuplicate(), DB_ERRORS, DuplicateNotice (+10 more)

### Community 41 - "RatesForm.tsx"
Cohesion: 0.10
Nodes (25): metadata, PaymentFormInner(), FREQS, money(), OnlineCtx, Period, PERIODS, PriceInput() (+17 more)

### Community 42 - "VideoRTC"
Cohesion: 0.17
Nodes (4): CameraPlayer(), defineElement(), PlayerEl, VideoRTC

### Community 43 - "app-ios/package.json"
Cohesion: 0.09
Nodes (22): devDependencies, @types/react, typescript, main, name, private, version, Loading() (+14 more)

### Community 44 - "public.payment_ledger"
Cohesion: 0.17
Nodes (11): payments_force_recorder, public.payment_ledger, public.void_payment(), private.payments_force_recorder, public.billing_accounts, public.invoices, public.members, public.membership_plans (+3 more)

### Community 45 - "public.payment_ledger"
Cohesion: 0.17
Nodes (11): payments_force_recorder, public.payment_ledger, public.void_payment(), private.payments_force_recorder, public.billing_accounts, public.invoices, public.members, public.membership_plans (+3 more)

### Community 46 - "labels.ts"
Cohesion: 0.11
Nodes (22): GuestPass, GuestsScreen(), Quota, ymd(), GuestsPage(), metadata, dynamic, metadata (+14 more)

### Community 47 - "Button"
Cohesion: 0.17
Nodes (19): react-router-dom, Button(), AdminLayout(), NAV, PendingAccess(), AuthCtx, AuthState, SettingsCtx (+11 more)

### Community 48 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, expo, expo-apple-authentication, expo-brightness, expo-constants, expo-crypto, expo-font, @expo-google-fonts/dm-sans (+16 more)

### Community 49 - "index.tsx"
Cohesion: 0.13
Nodes (21): RootNavigator(), SinPlan(), CuentaScreen(), PaseScreen(), useScannerMode(), FamilyPicker(), useAuth(), formatDate() (+13 more)

### Community 50 - "retention.ts"
Cohesion: 0.23
Nodes (12): ChallengesScreen(), toggle(), metadata, RetosPage(), AdminChallenge, ChallengeMetric, fmtAmount(), fmtDay() (+4 more)

### Community 51 - "admin/layout.tsx"
Cohesion: 0.24
Nodes (11): Wordmark(), AdminNav(), ICONS, SectionTabs(), Permission, AdminSection, buildAdminSections(), findActiveTab() (+3 more)

### Community 52 - "engagement/actions.ts"
Cohesion: 0.05
Nodes (58): Claimed, dynamic, GET(), json(), maxDuration, FILTERS, metadata, ComunicacionLayout() (+50 more)

### Community 53 - "intermediario.py"
Cohesion: 0.21
Nodes (22): json, os, shutil, subprocess, guardar_estado(), asistente(), config_path(), configurar() (+14 more)

### Community 54 - "platform.ts"
Cohesion: 0.16
Nodes (19): ClassesScreen(), KNOWN_ERRORS, ClasesPage(), metadata, capitalize(), ClassSchedule(), ClassScheduleProps, equipmentNoun() (+11 more)

### Community 55 - "payments/actions.ts"
Cohesion: 0.12
Nodes (32): dynamic, ERR, esc(), GET(), getOffer(), Offer, page(), POST() (+24 more)

### Community 56 - "0007_training_automation.sql"
Cohesion: 0.16
Nodes (21): public.domain_events, public.seed_default_workflows, organizations_seed_workflows, public.automation_runs, public.automation_steps, public.automation_workflows, public.body_metrics, public.enqueue_inactivity_events() (+13 more)

### Community 57 - "App.tsx"
Cohesion: 0.16
Nodes (19): Activities, AdminLayout, App(), Dashboard, Exercises, MemberDetail, Members, Payments (+11 more)

### Community 58 - "app-ios/src/components/ui.tsx"
Cohesion: 0.26
Nodes (14): Button(), Card(), Field(), LinkText(), Notice(), Screen(), styles, Title() (+6 more)

### Community 59 - "AuthProvider.tsx"
Cohesion: 0.17
Nodes (13): AuthState, Ctx, FamilyMember, MemberState, Org, extra, ORG_SLUG, SUPABASE_PUBLISHABLE_KEY (+5 more)

### Community 60 - "public.org_report"
Cohesion: 0.10
Nodes (21): lapsed, revenue, signups, public.coach_client_overview, public.mark_attendance(), public.org_report(), months, public.bookings (+13 more)

### Community 61 - "platform/package.json"
Cohesion: 0.13
Nodes (18): tailwindcss@^4.3.3, @types/node@^24.13.6, typescript@~6.0.2, tailwindcss, @types/node, typescript, devDependencies, tailwindcss@^4.3.3 (+10 more)

### Community 62 - "steps"
Cohesion: 0.10
Nodes (20): jobs, windows-exe, name, on, push, workflow_dispatch, branches, paths (+12 more)

### Community 63 - "padron-actions.ts"
Cohesion: 0.23
Nodes (11): metadata, PostersPage(), approveStaffRequest(), generatePassword(), origin(), PUBLIC_ERRORS, submitStaffRequest(), PrintButton() (+3 more)

### Community 64 - "PassScreen.tsx"
Cohesion: 0.18
Nodes (17): metadata, PassScreen(), wait(), MembershipBanner(), MembershipBannerProps, formatPeriodEnd(), getPassStatus(), isNoMembership() (+9 more)

### Community 65 - "0013_admin_panel.sql"
Cohesion: 0.12
Nodes (16): public.permissions, public.staff_invitations_guard, on_auth_user_link, private.link_user_by_email(), public.admin_create_member(), public.link_existing_user(), public.staff_guard(), public.staff_invitations (+8 more)

### Community 66 - "0020_access_devices.sql"
Cohesion: 0.10
Nodes (3): public.access_commands, public.access_device_log, public.adms_poll()

### Community 67 - "package.json"
Cohesion: 0.14
Nodes (18): devDependencies, oxlint@^1.81.0, @tailwindcss/vite@^4.3.3, @types/qrcode@^1.5.6, vite@^8.3.0, @vitejs/plugin-react@^6.1.1, engines, node (+10 more)

### Community 68 - "zod"
Cohesion: 0.16
Nodes (17): DELETE(), dynamic, runtime, dynamic, POST(), runtime, BookingResult, bookingResultSchema (+9 more)

### Community 69 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 70 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 71 - "routine/route.ts"
Cohesion: 0.09
Nodes (31): dynamic, json(), maxDuration, POST(), dynamic, ExerciseCard(), fmtDay(), fmtSets() (+23 more)

### Community 72 - "assessment-actions.ts"
Cohesion: 0.27
Nodes (10): addScaleReading(), assessmentSchema, coach(), deleteAssessment(), importScaleCsv(), int(), opt(), saveAssessment() (+2 more)

### Community 73 - "ReceptionScreen.tsx"
Cohesion: 0.16
Nodes (16): DENIED, Entry, fmtDay(), fmtTime(), GuestEntry, METHOD, Quick, RawResult (+8 more)

### Community 74 - "referidos/page.tsx"
Cohesion: 0.23
Nodes (10): metadata, ReferidosPage(), metadata, FriendPromoForm(), FriendPromoSettings, Pct(), Promo(), norm() (+2 more)

### Community 75 - "0018_audit_fixes.sql"
Cohesion: 0.12
Nodes (17): public.end_series(), public.expire_memberships(), public.member_directory, public.record_payment(), public.staff_contacts(), public.billing_accounts, public.bookings, public.class_series (+9 more)

### Community 76 - "mercadopago.ts"
Cohesion: 0.10
Nodes (36): dynamic, esc(), GET(), dynamic, GET(), json(), POST(), dynamic (+28 more)

### Community 77 - "dependencies"
Cohesion: 0.17
Nodes (12): qrcode@^1.5.4, qrcode, dependencies, next@^16.3.6, qrcode@^1.5.4, react@^19.3.0, react-is@^19.3.0, server-only@^0.0.1 (+4 more)

### Community 78 - "scoring.ts"
Cohesion: 0.10
Nodes (30): ASSESSMENT_COLUMNS, AssessmentRow, AssessmentView(), BAR, fmtDate(), toAssessmentRow(), AreaKey, AREAS (+22 more)

### Community 79 - "public.turnstile_scan"
Cohesion: 0.18
Nodes (15): private.member_gym_allowed(), public.adms_poll(), public.agent_call(), public.turnstile_scan(), public.access_commands, public.access_device_users, public.access_devices, public.billing_accounts (+7 more)

### Community 80 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 81 - "main"
Cohesion: 0.17
Nodes (9): logging, Aperturas, cargar_json(), conectar(), leer_config(), main(), Plataforma, Aperturas pedidas por la tablet del molinete (QR). Se ejecutan al instante; no… (+1 more)

### Community 82 - "useMember"
Cohesion: 0.26
Nodes (10): metadata, ProgresoPage(), ProgressScreen(), useMember(), ActiveProgram, ProgramDay, useProgram(), onlinePaymentsEnabled() (+2 more)

### Community 83 - "Portero"
Cohesion: 0.24
Nodes (5): b64url(), b64url_decode(), pase_valido(), Portero, Pase = base64url(json {"s": stream, "e": vence}) . base64url(hmac_sha256(clave,…

### Community 84 - "admin/staff-account-actions.ts"
Cohesion: 0.38
Nodes (9): createSchema, createStaffAccount(), deleteStaff(), generatePassword(), isExclusiveStaffAccount(), isThisGymOnlyAccount(), loadTarget(), resetStaffPassword() (+1 more)

### Community 85 - "ref_lucide_react"
Cohesion: 0.07
Nodes (46): GridPage(), metadata, addDays(), AgendaWeek(), metadata, mondayOf(), TeamPage(), metadata (+38 more)

### Community 86 - "@types/react"
Cohesion: 0.67
Nodes (3): @types/react@^19.2.18, @types/react, @types/react@^19.2.18

### Community 87 - "[...path]/route.ts"
Cohesion: 0.05
Nodes (57): createSchema, createStaffAccount(), deleteStaff(), generatePassword(), isExclusiveStaffAccount(), isThisGymOnlyAccount(), loadTarget(), resetStaffPassword() (+49 more)

### Community 88 - "0050_tv_pair_and_class_boards.sql"
Cohesion: 0.16
Nodes (8): public.class_boards, public.floor_tv_pair_claim(), public.tv_board_hide(), public.tv_board_timer(), public.tv_pair_requests, public.tv_pair_start(), public.floor_settings, public.organizations

### Community 89 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, html5-qrcode@^2.3.8, lucide-react@^1.47.0, react@^19.2.8, react-dom@^19.2.8, react-router-dom@^7.18.4, @supabase/supabase-js@^2.117.1, html5-qrcode (+6 more)

### Community 90 - "PeakHours.tsx"
Cohesion: 0.18
Nodes (17): HorariosPage(), metadata, PeakHoursScreen(), BAR_CLASS, DAY_LABELS, fmtAvg(), hourOf(), hoursForDay() (+9 more)

### Community 91 - "aplicar_0032_0033.sql"
Cohesion: 0.15
Nodes (9): private.is_org_admin(), product_costs_touch, public.product_costs, public.sale_item_costs, public.organizations, public.products, public.sale_items, public.staff (+1 more)

### Community 92 - "0038_public_signup.sql"
Cohesion: 0.19
Nodes (12): private.settle_signup(), public.payment_intent_create_signup(), public.payment_intent_settle(), public.public_signup_plans(), auth.users, public.locations, public.members, public.membership_plans (+4 more)

### Community 93 - "clases.tsx"
Cohesion: 0.26
Nodes (10): BookingStatus, ClasesScreen(), ClassCard(), dayKey(), dayLabel(), formatWindow(), Session, timeLabel() (+2 more)

### Community 94 - "HelpVideoButton.tsx"
Cohesion: 0.44
Nodes (7): HELP_VIDEOS, HelpVideo, helpVideoFor(), helpVideoPoster(), helpVideoSrc(), ROUTES, HelpVideoButton()

### Community 95 - "createClient"
Cohesion: 0.12
Nodes (21): GET(), ConfirmPage(), confirm(), metadata, safeNext(), TYPES, MemberPasswordForm(), MemberPasswordPage() (+13 more)

### Community 96 - "public.class_sessions_availability"
Cohesion: 0.20
Nodes (10): public.class_sessions_availability, public.peak_hours(), public.session_equipment_map(), public.bookings, public.checkins, public.class_sessions, public.class_types, public.equipment (+2 more)

### Community 97 - "0033_product_costs.sql"
Cohesion: 0.17
Nodes (9): private.is_org_admin(), product_costs_touch, public.product_costs, public.sale_item_costs, public.organizations, public.products, public.sale_items, public.staff (+1 more)

### Community 98 - "getPublicGym"
Cohesion: 0.11
Nodes (23): generateMetadata(), metadata, TurnstilePage(), viewport, F(), PadronForm(), Submit(), metadata (+15 more)

### Community 99 - "TodayLive.tsx"
Cohesion: 0.29
Nodes (8): getPublicToday(), PublicToday, PublicTodayClass, classHref(), hhmm(), LEVEL, spotsLabel(), TodayLive()

### Community 100 - "public.access_devices"
Cohesion: 0.24
Nodes (11): private.access_device_for_admin(), private.access_push_user(), private.access_reconcile(), private.access_touch(), public.access_device_users, public.access_devices, public.access_templates, public.adms_push() (+3 more)

### Community 101 - "0041_member_password_login.sql"
Cohesion: 0.20
Nodes (7): private.login_attempts, private.signup_passwords, public.member_email_by_document(), public.signup_password_hash(), auth.users, public.members, public.payment_intents

### Community 102 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 103 - "@types/react-dom"
Cohesion: 0.67
Nodes (3): @types/react-dom@^19.2.7, @types/react-dom, @types/react-dom@^19.2.7

### Community 106 - "private.link_user_by_email"
Cohesion: 0.29
Nodes (9): public.staff_invitations, private.link_user_by_email(), public.staff_requests, public.submit_staff_request(), auth.users, public.billing_accounts, public.members, public.organizations (+1 more)

### Community 107 - "Dashboard.tsx"
Cohesion: 0.38
Nodes (8): BarChart(), Card(), PageHeader(), daysLeftText(), PayMethod, Dashboard(), Stat(), Stats

### Community 108 - "public.floor_tv_settings"
Cohesion: 0.20
Nodes (7): public.floor_tv_settings(), public.bookings, public.class_sessions, public.class_types, public.organizations, public.rooms, public.staff

### Community 109 - "social.ts"
Cohesion: 0.25
Nodes (8): Ingresar(), signInWithApple(), signInWithGoogle(), SocialResult, AUTH_REDIRECT, expo-apple-authentication, expo-crypto, expo-web-browser

### Community 110 - "_claude_tmp/YoScreen.tsx"
Cohesion: 0.33
Nodes (5): addDays(), fmtTs(), fmtYmd(), FreezeCard(), tsYmd()

### Community 111 - "[org]/page.tsx"
Cohesion: 0.13
Nodes (17): generateMetadata(), GymHome(), NAV, revalidate, IosInstallButton(), Step(), REVEAL_BOOT, RevealObserver() (+9 more)

### Community 112 - "MemberProvider.tsx"
Cohesion: 0.17
Nodes (15): MemberAppLayout(), MemberNav(), TABS, Ctx, MemberProvider(), MemberState, SurveyPrompt(), getMemberContext (+7 more)

### Community 113 - "_claude_tmp/LoginForm.tsx"
Cohesion: 0.50
Nodes (3): LoginForm(), Mode, safeNext()

### Community 114 - "test.check"
Cohesion: 0.22
Nodes (8): public.access_templates, public.access_commands, public.access_device_users, public.access_devices, public.checkins, public.members, public.organizations, test.check()

### Community 115 - "public.agent_call"
Cohesion: 0.22
Nodes (7): public.adms_poll(), public.agent_call(), public.access_commands, public.access_device_users, public.access_devices, public.members, v_pin

### Community 116 - "scenario_engagement.sql"
Cohesion: 0.22
Nodes (8): public.membership_members, public.membership_plans, public.memberships, public.message_outbox, public.organizations, test.eng_end(), test.eng_member(), test.eng_msgs()

### Community 117 - "(tabs)/_layout.tsx"
Cohesion: 0.36
Nodes (5): CalendarIcon(), P, QrIcon(), UserIcon(), react-native-svg

### Community 118 - "[programId]/page.tsx"
Cohesion: 0.10
Nodes (28): metadata, PHASE, RetosPage(), metadata, metadata, ProgramBuilder(), Action, AddDayForm() (+20 more)

### Community 119 - "0034_trainer_tools.sql"
Cohesion: 0.25
Nodes (6): private.assignment_not_draft, private.program_draft_guard, private.assignment_not_draft(), program_assignments_not_draft, public.workout_programs, workout_programs_draft_guard

### Community 120 - "public.public_gym_profile"
Cohesion: 0.25
Nodes (7): public.public_gym_profile(), public.class_series, public.class_types, public.locations, public.membership_plans, public.organizations, public.rooms

### Community 121 - "public.members"
Cohesion: 0.25
Nodes (8): private.access_on_billing(), private.access_punch(), private.members_assign_pin(), public.access_enroll(), public.access_forget_pin(), public.access_link_pin(), public.checkins, public.members

### Community 122 - "private.member_access_allowed"
Cohesion: 0.25
Nodes (8): private.access_on_membership(), private.member_access_allowed(), public.billing_accounts, public.bookings, public.class_sessions, public.membership_members, public.membership_plans, public.memberships

### Community 123 - "public.public_today"
Cohesion: 0.25
Nodes (7): public.public_today(), public.bookings, public.class_sessions, public.class_types, public.organizations, public.rooms, public.staff

### Community 124 - "app-ios/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, paths, strict, extends, include, expo/tsconfig.base

### Community 125 - "pantalla-tv-descartada/page.tsx"
Cohesion: 0.33
Nodes (4): metadata, viewport, FALLBACK, SignageScreen()

### Community 126 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, android, ios, start, typecheck, web

### Community 127 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 128 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, typecheck

### Community 129 - "ReportCharts.tsx"
Cohesion: 0.40
Nodes (5): recharts@^3.10.1, monthLabel(), MonthlyBars(), MONTHS, recharts

### Community 130 - "@supabase/ssr"
Cohesion: 0.40
Nodes (5): @supabase/ssr@^0.12.7, config, proxy(), tenantFromHost(), @supabase/ssr

### Community 131 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, db:types, dev, start, typecheck

### Community 132 - "public.message_outbox"
Cohesion: 0.33
Nodes (5): public.message_outbox, public, public.members, public.organizations, public.staff

### Community 133 - "public.member_delete"
Cohesion: 0.33
Nodes (4): public.member_delete(), public.access_device_users, public.members, public.staff

### Community 134 - "stub_supabase.sql"
Cohesion: 0.33
Nodes (3): auth.users, storage.buckets, storage.objects

### Community 135 - "0056_mp_subscriptions.sql"
Cohesion: 0.09
Nodes (18): anon, authenticated, public, public.billing_accounts, public.members, public.membership_plans, public.organizations, public.payments (+10 more)

### Community 136 - "0042_signup_link_on_confirm.sql"
Cohesion: 0.50
Nodes (3): on_auth_user_confirmed_link, on_auth_user_link, public.handle_user_link

### Community 137 - "vercel.json"
Cohesion: 0.40
Nodes (4): crons, framework, rewrites, $schema

### Community 139 - "public.access_device_query_users"
Cohesion: 0.50
Nodes (4): pg_extension, public.access_device_query_users(), public.access_unknown_devices, public.access_unknown_nearby()

### Community 140 - "floor/actions.ts"
Cohesion: 0.35
Nodes (11): approveDraft(), claimTvCode(), FLOOR_ERRORS, floorCtx(), linkTv(), machineSchema, msg(), saveMachine() (+3 more)

### Community 141 - "platform/vercel.json"
Cohesion: 0.50
Nodes (3): crons, framework, $schema

### Community 218 - "formatMoney"
Cohesion: 0.11
Nodes (27): addDays(), fmtDay(), GananciasPage(), metadata, asPrice(), metadata, ProductosPage(), metadata (+19 more)

### Community 220 - "sys"
Cohesion: 0.40
Nodes (4): sys, Prueba: ¿el lector abre el molinete a pedido desde la red? Le manda al lector…, Prueba de SOLO LECTURA del lector ZKTeco MB360 por la red local (puerto 4370).…, zk

### Community 223 - "Cámaras (PC del gimnasio)"
Cohesion: 0.33
Nodes (5): Calidad y conexión, Cámaras (PC del gimnasio), El .exe, Instalación, Qué hace

### Community 224 - "public.rename_room"
Cohesion: 0.40
Nodes (4): public.rename_room(), public.class_series, public.class_sessions, public.rooms

### Community 226 - "Card"
Cohesion: 0.11
Nodes (27): metadata, ScaleImportPage(), AssessmentPage(), metadata, metadata, StudentPage(), MachinePage(), metadata (+19 more)

### Community 227 - "public.rename_room"
Cohesion: 0.40
Nodes (4): public.rename_room(), public.class_series, public.class_sessions, public.rooms

### Community 228 - "equipo/clave/page.tsx"
Cohesion: 0.53
Nodes (4): ChangePasswordForm(), ChangePasswordPage(), metadata, safeNext()

### Community 234 - "retention-actions.ts"
Cohesion: 0.38
Nodes (9): cancelChallenge(), challengeSchema, errorText(), FORBIDDEN, manager(), saveChallenge(), setNpsEnabled(), settleChallenge() (+1 more)

### Community 235 - "login/actions.ts"
Cohesion: 0.46
Nodes (7): emailForDniLogin(), isEmail(), onlyDigits(), resetPasswordWithCode(), resolveEmail(), Result, sendPasswordResetCode()

## Knowledge Gaps
- **625 isolated node(s):** `metadata`, `DatabaseWithoutInternals`, `DefaultSchema`, `Tables`, `TablesInsert` (+620 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1237 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `TurnstileKiosk.tsx`, `encuestas/page.tsx`, `StaffLoginForm.tsx`, `buffet/actions.ts`, `board-actions.ts`, `online/page.tsx`, `Portal.tsx`, `[sessionId]/page.tsx`, `errorText`, `next`, `MemberDetail.tsx`, `pases/page.tsx`, `src/components/ui.tsx`, `ActiveWorkout.tsx`, `context.ts`, `server.ts`, `RatesForm.tsx`, `VideoRTC`, `app-ios/package.json`, `labels.ts`, `Button`, `index.tsx`, `retention.ts`, `engagement/actions.ts`, `platform.ts`, `App.tsx`, `app-ios/src/components/ui.tsx`, `AuthProvider.tsx`, `PassScreen.tsx`, `ReceptionScreen.tsx`, `scoring.ts`, `useMember`, `ref_lucide_react`, `PeakHours.tsx`, `formatMoney`, `clases.tsx`, `HelpVideoButton.tsx`, `createClient`, `Card`, `getPublicGym`, `equipo/clave/page.tsx`, `TodayLive.tsx`, `Dashboard.tsx`, `_claude_tmp/YoScreen.tsx`, `[org]/page.tsx`, `MemberProvider.tsx`, `_claude_tmp/LoginForm.tsx`, `[programId]/page.tsx`, `pantalla-tv-descartada/page.tsx`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `TurnstileKiosk.tsx`, `createClient`, `encuestas/page.tsx`, `StaffLoginForm.tsx`, `buffet/actions.ts`, `billing-actions.ts`, `board-actions.ts`, `online/page.tsx`, `floor/actions.ts`, `dbMessage`, `createAdminClient`, `[sessionId]/page.tsx`, `negocio/page.tsx`, `admin/actions.ts`, `react`, `pases/page.tsx`, `ActiveWorkout.tsx`, `accesos/page.tsx`, `context.ts`, `server.ts`, `RatesForm.tsx`, `labels.ts`, `retention.ts`, `admin/layout.tsx`, `engagement/actions.ts`, `platform.ts`, `payments/actions.ts`, `platform/package.json`, `padron-actions.ts`, `PassScreen.tsx`, `zod`, `routine/route.ts`, `assessment-actions.ts`, `ReceptionScreen.tsx`, `referidos/page.tsx`, `mercadopago.ts`, `dependencies`, `useMember`, `ref_lucide_react`, `[...path]/route.ts`, `formatMoney`, `PeakHours.tsx`, `createClient`, `Card`, `getPublicGym`, `equipo/clave/page.tsx`, `retention-actions.ts`, `_claude_tmp/YoScreen.tsx`, `[org]/page.tsx`, `MemberProvider.tsx`, `_claude_tmp/LoginForm.tsx`, `[programId]/page.tsx`, `pantalla-tv-descartada/page.tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `TurnstileKiosk.tsx`, `encuestas/page.tsx`, `buffet/actions.ts`, `billing-actions.ts`, `board-actions.ts`, `online/page.tsx`, `floor/actions.ts`, `dbMessage`, `[sessionId]/page.tsx`, `negocio/page.tsx`, `admin/actions.ts`, `formObject`, `next`, `pases/page.tsx`, `accesos/page.tsx`, `context.ts`, `server.ts`, `RatesForm.tsx`, `labels.ts`, `admin/layout.tsx`, `engagement/actions.ts`, `payments/actions.ts`, `padron-actions.ts`, `zod`, `routine/route.ts`, `assessment-actions.ts`, `referidos/page.tsx`, `mercadopago.ts`, `admin/staff-account-actions.ts`, `ref_lucide_react`, `formatMoney`, `createClient`, `Card`, `getPublicGym`, `equipo/clave/page.tsx`, `TodayLive.tsx`, `retention-actions.ts`, `login/actions.ts`, `MemberProvider.tsx`, `[programId]/page.tsx`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `metadata`, `DatabaseWithoutInternals`, `DefaultSchema` to the rest of the system?**
  _625 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TurnstileKiosk.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05198358413132695 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.08408163265306122 - nodes in this community are weakly interconnected._
- **Should `agente.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10967741935483871 - nodes in this community are weakly interconnected._