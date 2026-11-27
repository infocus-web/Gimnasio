# Graph Report - Gimnasio  (2026-11-27)

## Corpus Check
- 521 files · ~5,595,842 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3566 nodes · 9506 edges · 240 communities (153 shown, 34 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `039c7dd2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- app/buffet/page.tsx
- payments/actions.ts
- agente.py
- 0028_engagement.sql
- [org]/page.tsx
- 0005_platform_core.sql
- react
- buffet/actions.ts
- admin/layout.tsx
- pizarra/page.tsx
- 0031_floor_owner.sql
- TeamForms.tsx
- Portal.tsx
- createClient
- camaras.py
- MemberProvider.tsx
- useActionForm
- negocio/page.tsx
- errorText
- getAdminContext
- _lib.ts
- socios/[memberId]/page.tsx
- formObject
- robots.ts
- expo
- 0001_init.sql
- 0029_access_plus.sql
- 0030_payments_mp.sql
- 0040_trainer_panel.sql
- MemberDetail.tsx
- ReceptionScreen.tsx
- 0039_friend_promos.sql
- 0036_retention_assessments.sql
- src/components/ui.tsx
- 0006_scheduling_bookings.sql
- ActiveWorkout.tsx
- 0014_payments_schedule_mfa.sql
- 0052_buffet.sql
- accesos/page.tsx
- next
- [machineId]/page.tsx
- pagar/page.tsx
- VideoRTC
- app-ios/package.json
- public.payment_ledger
- public.payment_ledger
- labels.ts
- Button
- dependencies
- index.tsx
- retention.ts
- pases/page.tsx
- engagement/actions.ts
- intermediario.py
- platform.ts
- admin/format.ts
- 0007_training_automation.sql
- App.tsx
- app-ios/src/components/ui.tsx
- AuthProvider.tsx
- public.org_report
- platform/package.json
- steps
- database.types.ts
- PassScreen.tsx
- 0013_admin_panel.sql
- 0020_access_devices.sql
- package.json
- bookings/route.ts
- compilerOptions
- compilerOptions
- routine/route.ts
- StaffLoginForm.tsx
- admin/errors.ts
- 0018_audit_fixes.sql
- subscriptions.ts
- dependencies
- scoring.ts
- public.turnstile_scan
- compilerOptions
- main
- StrengthProgress.tsx
- Portero
- pantallas/page.tsx
- ConfirmAction.tsx
- RiskList.tsx
- [...path]/route.ts
- 0050_tv_pair_and_class_boards.sql
- dependencies
- useMember
- aplicar_0032_0033.sql
- 0038_public_signup.sql
- clases.tsx
- HelpVideoButton.tsx
- createClient
- public.class_sessions_availability
- 0033_product_costs.sql
- login/page.tsx
- TodayLive.tsx
- public.access_devices
- 0041_member_password_login.sql
- compilerOptions
- CLAUDE.md
- SoundEngine
- private.link_user_by_email
- Dashboard.tsx
- public.floor_tv_settings
- social.ts
- _claude_tmp/YoScreen.tsx
- safeInternalPath
- ScheduleForms.tsx
- test.check
- public.agent_call
- scenario_engagement.sql
- (tabs)/_layout.tsx
- ref_lucide_react
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
- platform/vercel.json
- 0044_kiosk_pair_code.sql
- 0048_kiosk_slides.sql
- maquina/[code]/page.tsx
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
- ProductForm.tsx
- Hijo
- sys
- AssessmentView.tsx
- private.mp_surcharge
- Cámaras (PC del gimnasio)
- public.rename_room
- progression.test.ts
- WebEditor.tsx
- public.rename_room
- createAdminClient
- scale-csv.ts
- period.ts
- server.ts
- login/actions.ts
- access-plus/actions.ts
- admin/ui.tsx
- inscripcion/page.tsx
- access/agent/route.ts
- tailwindcss

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 301 edges
2. `getAdminContext` - 205 edges
3. `next` - 150 edges
4. `react` - 132 edges
5. `useActionForm()` - 117 edges
6. `dbMessage()` - 105 edges
7. `ActionState` - 68 edges
8. `createAdminClient()` - 68 edges
9. `Notice()` - 65 edges
10. `SubmitButton()` - 61 edges

## Surprising Connections (you probably didn't know these)
- `@supabase/supabase-js@^2.117.2` --declares--> `@supabase/supabase-js`  [EXTRACTED]
  platform/package.json → package.json
- `typescript@~6.0.2` --declares--> `typescript`  [EXTRACTED]
  platform/package.json → package.json
- `@types/react@^19.2.18` --declares--> `@types/react`  [EXTRACTED]
  platform/package.json → package.json
- `confirm()` --calls--> `createClient()`  [EXTRACTED]
  platform/src/app/auth/confirm/page.tsx → platform/src/lib/supabase/server.ts
- `PublicPassPage()` --calls--> `createClient()`  [EXTRACTED]
  platform/src/app/[org]/pase/[code]/page.tsx → platform/src/lib/supabase/server.ts

## Import Cycles
- None detected.

## Communities (240 total, 34 thin omitted)

### Community 0 - "app/buffet/page.tsx"
Cohesion: 0.10
Nodes (33): BuffetPage(), dynamic, metadata, metadata, BuffetPublicPage(), generateMetadata(), revalidate, Props (+25 more)

### Community 1 - "payments/actions.ts"
Cohesion: 0.07
Nodes (58): dynamic, ERR, esc(), GET(), getOffer(), Offer, page(), POST() (+50 more)

### Community 2 - "agente.py"
Cohesion: 0.11
Nodes (29): base64, datetime, hashlib, logging_handlers, socket, time, ciclo(), ejecutar_cola() (+21 more)

### Community 3 - "0028_engagement.sql"
Cohesion: 0.05
Nodes (42): isl, lateral, private.engagement_on_membership_member, private.engagement_on_org, private.engagement_on_payment, runs, membership_members_engagement, organizations_engagement_seed (+34 more)

### Community 4 - "[org]/page.tsx"
Cohesion: 0.13
Nodes (15): NAV, revalidate, IosInstallButton(), Step(), REVEAL_BOOT, RevealObserver(), SplitWords(), Extra (+7 more)

### Community 5 - "0005_platform_core.sql"
Cohesion: 0.07
Nodes (46): public.members_create_secret, public.members_guard, public.membership_members_guard, public.memberships_emit_events, public.staff_guard, members_create_secret, members_guard, members_touch (+38 more)

### Community 6 - "react"
Cohesion: 0.14
Nodes (10): LoginForm(), Mode, safeNext(), EXT, MemberForm(), MemberValues, Props, toJpeg() (+2 more)

### Community 7 - "buffet/actions.ts"
Cohesion: 0.10
Nodes (49): BuffetSettingsPage(), metadata, asInput(), BuffetCartaPage(), Item, metadata, asInput(), BuffetMenuPage() (+41 more)

### Community 8 - "admin/layout.tsx"
Cohesion: 0.21
Nodes (13): AdminLayout(), Wordmark(), AdminNav(), ICONS, SectionTabs(), Permission, ROLE_LABELS, AdminSection (+5 more)

### Community 9 - "pizarra/page.tsx"
Cohesion: 0.06
Nodes (73): BoardPage(), metadata, metadata, dynamic, json(), POST(), durationOf(), kindOf() (+65 more)

### Community 10 - "0031_floor_owner.sql"
Cohesion: 0.06
Nodes (31): public.program_exercises, public.program_workouts, machines_touch, private.can_manage_floor(), private.machine_code(), public.ai_routine_create_draft(), public.ai_routine_usage(), public.ai_usage_log (+23 more)

### Community 11 - "TeamForms.tsx"
Cohesion: 0.15
Nodes (7): RequestCard(), CreateStaffAccountForm(), InviteStaffForm(), ROLE_OPTIONS, SecretBox(), StaffAccountActions(), StaffRowForm()

### Community 12 - "Portal.tsx"
Cohesion: 0.11
Nodes (32): QrImage(), cx(), Spinner(), VideoPlayer(), videoThumb(), WeekSchedule(), fmtDateLong(), fmtTime() (+24 more)

### Community 13 - "createClient"
Cohesion: 0.11
Nodes (38): MachinesPage(), metadata, ProgramsPage(), metadata, GET(), addProgramExercise(), addWorkoutDay(), assignProgram() (+30 more)

### Community 14 - "camaras.py"
Cohesion: 0.14
Nodes (26): ctypes, aqui(), asistente(), configurar(), copiar_programas(), desinstalar(), detener_todo(), es_admin() (+18 more)

### Community 15 - "MemberProvider.tsx"
Cohesion: 0.17
Nodes (15): MemberAppLayout(), MemberNav(), TABS, Ctx, MemberProvider(), MemberState, SurveyPrompt(), getMemberContext (+7 more)

### Community 16 - "useActionForm"
Cohesion: 0.07
Nodes (35): AgentPanel(), Bare, CopyValue(), DeviceButtons(), EnrollForm(), KioskPanel(), OpenTurnstileButton(), RegisterDeviceForm() (+27 more)

### Community 17 - "negocio/page.tsx"
Cohesion: 0.22
Nodes (13): DashboardBody(), metadata, n(), TABS, Delta(), Heatmap(), Kpi(), PeakVsClasses() (+5 more)

### Community 18 - "errorText"
Cohesion: 0.12
Nodes (38): Badge(), confirmDelete(), errorText(), Field(), Loading(), uploadMedia(), RoutineItem, Activities() (+30 more)

### Community 19 - "getAdminContext"
Cohesion: 0.07
Nodes (59): AccessPage(), metadata, TeamPage(), PagosLayout(), metadata, NewMemberPage(), saveAccessSettings(), adjustMembershipEnd() (+51 more)

### Community 20 - "_lib.ts"
Cohesion: 0.10
Nodes (51): GET, POST, Member, METHOD, sendBirthday(), sendExpired(), sendReceipt(), sendReminder() (+43 more)

### Community 21 - "socios/[memberId]/page.tsx"
Cohesion: 0.11
Nodes (35): metadata, InfoTip(), Action, AssessmentForm(), Num(), ScaleImportForm(), ScaleReadingForm(), Action (+27 more)

### Community 22 - "formObject"
Cohesion: 0.16
Nodes (32): GridPage(), metadata, metadata, formObject(), WEEKDAYS, addEquipment(), bookForMember(), cancelBookingDesk() (+24 more)

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

### Community 30 - "ReceptionScreen.tsx"
Cohesion: 0.18
Nodes (14): DENIED, Entry, fmtDay(), fmtTime(), GuestEntry, METHOD, Quick, RawResult (+6 more)

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
Cohesion: 0.19
Nodes (20): EntrenarPage(), metadata, WorkoutScreen(), ActiveWorkout(), fmtClock(), fmtKg(), kgFormatter, PlateCalculator() (+12 more)

### Community 36 - "0014_payments_schedule_mfa.sql"
Cohesion: 0.11
Nodes (26): public.role_permissions, public.staff_permission_overrides, private.has_permission(), private.org_midnight(), public.admin_assign_plan(), public.apply_series_to_future(), public.cancel_session(), public.end_series() (+18 more)

### Community 37 - "0052_buffet.sql"
Cohesion: 0.09
Nodes (16): buffet_items_touch, buffet_orders_touch, buffet_settings_touch, public.buffet_items, public.buffet_menu, public.buffet_order_items, public.buffet_orders, public.buffet_payouts (+8 more)

### Community 38 - "accesos/page.tsx"
Cohesion: 0.27
Nodes (15): metadata, METHOD, createAgentToken(), createKioskToken(), deviceAction(), DeviceOp, enrollMember(), forgetDeviceUser() (+7 more)

### Community 39 - "next"
Cohesion: 0.06
Nodes (24): nextConfig, addDays(), AgendaWeek(), metadata, mondayOf(), metadata, MyClassesPage(), Stat() (+16 more)

### Community 40 - "[machineId]/page.tsx"
Cohesion: 0.30
Nodes (8): MachinePage(), metadata, metadata, PostersPage(), MachineForm(), PrintButton(), machineUrl(), qrSvg()

### Community 41 - "pagar/page.tsx"
Cohesion: 0.09
Nodes (32): metadata, PlansPage(), dynamic, metadata, Options, PagarPage(), GymHome(), PaymentFormInner() (+24 more)

### Community 42 - "VideoRTC"
Cohesion: 0.15
Nodes (5): CameraPlayer(), defineElement(), PlayerEl, CamerasView(), VideoRTC

### Community 43 - "app-ios/package.json"
Cohesion: 0.09
Nodes (21): devDependencies, @types/react, typescript, main, name, private, version, Loading() (+13 more)

### Community 44 - "public.payment_ledger"
Cohesion: 0.17
Nodes (11): payments_force_recorder, public.payment_ledger, public.void_payment(), private.payments_force_recorder, public.billing_accounts, public.invoices, public.members, public.membership_plans (+3 more)

### Community 45 - "public.payment_ledger"
Cohesion: 0.17
Nodes (11): payments_force_recorder, public.payment_ledger, public.void_payment(), private.payments_force_recorder, public.billing_accounts, public.invoices, public.members, public.membership_plans (+3 more)

### Community 46 - "labels.ts"
Cohesion: 0.11
Nodes (21): GuestPass, GuestsScreen(), Quota, ymd(), GuestsPage(), metadata, dynamic, metadata (+13 more)

### Community 47 - "Button"
Cohesion: 0.17
Nodes (19): react-router-dom, Button(), AdminLayout(), NAV, PendingAccess(), AuthCtx, AuthState, SettingsCtx (+11 more)

### Community 48 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, expo, expo-apple-authentication, expo-brightness, expo-constants, expo-crypto, expo-font, @expo-google-fonts/dm-sans (+16 more)

### Community 49 - "index.tsx"
Cohesion: 0.15
Nodes (18): RootNavigator(), SinPlan(), CuentaScreen(), PaseScreen(), useScannerMode(), FamilyPicker(), useAuth(), formatDate() (+10 more)

### Community 50 - "retention.ts"
Cohesion: 0.22
Nodes (13): ChallengesScreen(), toggle(), metadata, RetosPage(), AdminChallenge, ChallengeMetric, fmtAmount(), fmtDay() (+5 more)

### Community 51 - "pases/page.tsx"
Cohesion: 0.35
Nodes (9): FILTERS, metadata, PassesPage(), PAY, AccessSettingsForm(), IssuePassForm(), PassShare(), passShareText() (+1 more)

### Community 52 - "engagement/actions.ts"
Cohesion: 0.06
Nodes (48): FILTERS, metadata, ComunicacionPage(), metadata, metadata, YoPage(), AchievementsCard(), addDays() (+40 more)

### Community 53 - "intermediario.py"
Cohesion: 0.21
Nodes (22): json, os, shutil, subprocess, guardar_estado(), asistente(), config_path(), configurar() (+14 more)

### Community 54 - "platform.ts"
Cohesion: 0.14
Nodes (21): ClassesScreen(), KNOWN_ERRORS, ClasesPage(), metadata, capitalize(), ClassSchedule(), ClassScheduleProps, equipmentNoun() (+13 more)

### Community 55 - "admin/format.ts"
Cohesion: 0.07
Nodes (56): metadata, SessionPage(), STATUS, metadata, StudentsPage(), EncuestasPage(), metadata, npsTone() (+48 more)

### Community 56 - "0007_training_automation.sql"
Cohesion: 0.16
Nodes (21): public.domain_events, public.seed_default_workflows, organizations_seed_workflows, public.automation_runs, public.automation_steps, public.automation_workflows, public.body_metrics, public.enqueue_inactivity_events() (+13 more)

### Community 57 - "App.tsx"
Cohesion: 0.16
Nodes (19): Activities, AdminLayout, App(), Dashboard, Exercises, MemberDetail, Members, Payments (+11 more)

### Community 58 - "app-ios/src/components/ui.tsx"
Cohesion: 0.29
Nodes (12): Button(), Card(), Field(), LinkText(), Notice(), Screen(), styles, Title() (+4 more)

### Community 59 - "AuthProvider.tsx"
Cohesion: 0.12
Nodes (18): AuthProvider(), AuthState, Ctx, FamilyMember, MemberState, Org, CheckinToken, useCheckinToken() (+10 more)

### Community 60 - "public.org_report"
Cohesion: 0.10
Nodes (21): lapsed, revenue, signups, public.coach_client_overview, public.mark_attendance(), public.org_report(), months, public.bookings (+13 more)

### Community 61 - "platform/package.json"
Cohesion: 0.11
Nodes (21): @types/node@^24.13.6, @types/qrcode@^1.5.6, @types/react-dom@^19.2.7, typescript@~6.0.2, @types/node, @types/qrcode, @types/react-dom, typescript (+13 more)

### Community 62 - "steps"
Cohesion: 0.10
Nodes (20): jobs, windows-exe, name, on, push, workflow_dispatch, branches, paths (+12 more)

### Community 63 - "database.types.ts"
Cohesion: 0.22
Nodes (8): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Tables, TablesInsert, TablesUpdate

### Community 64 - "PassScreen.tsx"
Cohesion: 0.17
Nodes (19): PassScreen(), wait(), MembershipBanner(), MembershipBannerProps, formatPeriodEnd(), getPassStatus(), isNoMembership(), NO_MEMBERSHIP (+11 more)

### Community 65 - "0013_admin_panel.sql"
Cohesion: 0.12
Nodes (16): public.permissions, public.staff_invitations_guard, on_auth_user_link, private.link_user_by_email(), public.admin_create_member(), public.link_existing_user(), public.staff_guard(), public.staff_invitations (+8 more)

### Community 66 - "0020_access_devices.sql"
Cohesion: 0.10
Nodes (3): public.access_commands, public.access_device_log, public.adms_poll()

### Community 67 - "package.json"
Cohesion: 0.14
Nodes (18): devDependencies, oxlint@^1.81.0, @tailwindcss/vite@^4.3.3, @types/react@^19.2.18, vite@^8.3.0, @vitejs/plugin-react@^6.1.1, engines, node (+10 more)

### Community 68 - "bookings/route.ts"
Cohesion: 0.17
Nodes (16): DELETE(), dynamic, runtime, dynamic, POST(), runtime, BookingResult, bookingResultSchema (+8 more)

### Community 69 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 70 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 71 - "routine/route.ts"
Cohesion: 0.18
Nodes (16): dynamic, json(), maxDuration, POST(), assessmentPromptText(), aiExercise, aiRoutine, buildPrompt() (+8 more)

### Community 72 - "StaffLoginForm.tsx"
Cohesion: 0.53
Nodes (4): metadata, StaffLoginPage(), safeNext(), StaffLoginForm()

### Community 74 - "admin/errors.ts"
Cohesion: 0.23
Nodes (10): ScaleImportState, ActionState, formatMoney(), Action, AutoDebitForm(), PayPlanForm(), PayPlanOption, METHODS (+2 more)

### Community 75 - "0018_audit_fixes.sql"
Cohesion: 0.12
Nodes (17): public.end_series(), public.expire_memberships(), public.member_directory, public.record_payment(), public.staff_contacts(), public.billing_accounts, public.bookings, public.class_series (+9 more)

### Community 76 - "subscriptions.ts"
Cohesion: 0.13
Nodes (26): Claimed, dynamic, GET(), json(), maxDuration, dynamic, GET(), json() (+18 more)

### Community 77 - "dependencies"
Cohesion: 0.17
Nodes (12): html5-qrcode@^2.3.8, html5-qrcode, dependencies, html5-qrcode@^2.3.8, next@^16.3.6, react@^19.3.0, react-is@^19.3.0, server-only@^0.0.1 (+4 more)

### Community 78 - "scoring.ts"
Cohesion: 0.16
Nodes (17): AreaScore, AssessmentScores, avg(), BALANCE, BODY_FAT, byAge(), clamp(), Level (+9 more)

### Community 79 - "public.turnstile_scan"
Cohesion: 0.18
Nodes (15): private.member_gym_allowed(), public.adms_poll(), public.agent_call(), public.turnstile_scan(), public.access_commands, public.access_device_users, public.access_devices, public.billing_accounts (+7 more)

### Community 80 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 81 - "main"
Cohesion: 0.17
Nodes (9): logging, Aperturas, cargar_json(), conectar(), leer_config(), main(), Plataforma, Aperturas pedidas por la tablet del molinete (QR). Se ejecutan al instante; no… (+1 more)

### Community 82 - "StrengthProgress.tsx"
Cohesion: 0.22
Nodes (13): metadata, ProgresoPage(), ProgressScreen(), ActiveWorkoutProps, dayKeyFormatter, localDayKey(), StrengthProgress(), StrengthProgressProps (+5 more)

### Community 83 - "Portero"
Cohesion: 0.24
Nodes (5): b64url(), b64url_decode(), pase_valido(), Portero, Pase = base64url(json {"s": stream, "e": vence}) . base64url(hmac_sha256(clave,…

### Community 84 - "pantallas/page.tsx"
Cohesion: 0.05
Nodes (66): dynamic, GET(), metadata, ScreensPage(), AD_SLIDES, call(), cookieName(), deniedText() (+58 more)

### Community 85 - "ConfirmAction.tsx"
Cohesion: 0.13
Nodes (22): metadata, ReferidosPage(), ActionButton(), Bare, ConfirmAction(), InlineError(), PendingButton(), TRIGGER (+14 more)

### Community 86 - "RiskList.tsx"
Cohesion: 0.60
Nodes (5): fmt(), message(), RiskList(), Row(), firstName()

### Community 87 - "[...path]/route.ts"
Cohesion: 0.20
Nodes (18): Ctx, deviceIp(), dynamic, GET, handle(), POST, same(), text() (+10 more)

### Community 88 - "0050_tv_pair_and_class_boards.sql"
Cohesion: 0.16
Nodes (8): public.class_boards, public.floor_tv_pair_claim(), public.tv_board_hide(), public.tv_board_timer(), public.tv_pair_requests, public.tv_pair_start(), public.floor_settings, public.organizations

### Community 89 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, lucide-react@^1.47.0, qrcode@^1.5.4, react@^19.2.8, react-dom@^19.2.8, react-router-dom@^7.18.4, @supabase/supabase-js@^2.117.1, lucide-react (+6 more)

### Community 90 - "useMember"
Cohesion: 0.18
Nodes (18): HorariosPage(), metadata, PeakHoursScreen(), BAR_CLASS, DAY_LABELS, fmtAvg(), hourOf(), hoursForDay() (+10 more)

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
Cohesion: 0.31
Nodes (8): ChangePasswordForm(), ChangePasswordPage(), metadata, safeNext(), MfaScreen(), Props, SignOutButton(), createClient()

### Community 96 - "public.class_sessions_availability"
Cohesion: 0.20
Nodes (10): public.class_sessions_availability, public.peak_hours(), public.session_equipment_map(), public.bookings, public.checkins, public.class_sessions, public.class_types, public.equipment (+2 more)

### Community 97 - "0033_product_costs.sql"
Cohesion: 0.17
Nodes (9): private.is_org_admin(), product_costs_touch, public.product_costs, public.sale_item_costs, public.organizations, public.products, public.sale_items, public.staff (+1 more)

### Community 98 - "login/page.tsx"
Cohesion: 0.10
Nodes (23): platform_src_app_globals, metadata, SITE, viewport, LoginForm(), Mode, safeNext(), metadata (+15 more)

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

### Community 111 - "safeInternalPath"
Cohesion: 0.16
Nodes (14): GET(), ConfirmPage(), confirm(), metadata, safeNext(), TYPES, MemberPasswordForm(), MemberPasswordPage() (+6 more)

### Community 113 - "ScheduleForms.tsx"
Cohesion: 0.18
Nodes (16): ActivitiesPage(), metadata, metadata, RoomsPage(), EQUIPMENT_KINDS, equipmentLabel(), isKnownEquipmentKind(), LABELS (+8 more)

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

### Community 118 - "ref_lucide_react"
Cohesion: 0.11
Nodes (17): metadata, ProgramBuilder(), Action, AddDayForm(), AddExerciseForm(), AssignableStudent, AssignToStudentsForm(), ExerciseInitial (+9 more)

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

### Community 141 - "platform/vercel.json"
Cohesion: 0.50
Nodes (3): crons, framework, $schema

### Community 146 - "maquina/[code]/page.tsx"
Cohesion: 0.16
Nodes (15): dynamic, ExerciseCard(), fmtDay(), fmtSets(), MachineQrPage(), metadata, AI_DAILY_LIMIT, DashboardTotals (+7 more)

### Community 218 - "ProductForm.tsx"
Cohesion: 0.24
Nodes (13): asPrice(), metadata, ProductosPage(), PRODUCT_BUCKET, productImageUrl(), asInput(), ProductForm(), ProductValues (+5 more)

### Community 220 - "sys"
Cohesion: 0.40
Nodes (4): sys, Prueba: ¿el lector abre el molinete a pedido desde la red? Le manda al lector…, Prueba de SOLO LECTURA del lector ZKTeco MB360 por la red local (puerto 4370).…, zk

### Community 221 - "AssessmentView.tsx"
Cohesion: 0.23
Nodes (13): ASSESSMENT_COLUMNS, AssessmentRow, AssessmentView(), BAR, fmtDate(), toAssessmentRow(), AreaKey, AREAS (+5 more)

### Community 223 - "Cámaras (PC del gimnasio)"
Cohesion: 0.33
Nodes (5): Calidad y conexión, Cámaras (PC del gimnasio), El .exe, Instalación, Qué hace

### Community 224 - "public.rename_room"
Cohesion: 0.40
Nodes (4): public.rename_room(), public.class_series, public.class_sessions, public.rooms

### Community 225 - "progression.test.ts"
Cohesion: 0.20
Nodes (11): fmt(), LastSet, LoadSuggestion, parseRepRange(), roundLoad(), suggestLoad(), down, fit (+3 more)

### Community 226 - "WebEditor.tsx"
Cohesion: 0.39
Nodes (8): compress(), DAYS, Gallery(), ImageSlot(), TextField(), TextFieldProps, useUploader(), WebEditor()

### Community 227 - "public.rename_room"
Cohesion: 0.40
Nodes (4): public.rename_room(), public.class_series, public.class_sessions, public.rooms

### Community 228 - "createAdminClient"
Cohesion: 0.08
Nodes (39): @supabase/supabase-js, dynamic, json(), POST(), dynamic, json(), POST(), dynamic (+31 more)

### Community 229 - "scale-csv.ts"
Cohesion: 0.31
Nodes (9): MATCHERS, norm(), ParsedScale, parseScaleCsv(), parseScaleDate(), ScaleRow, splitLine(), toNumber() (+1 more)

### Community 230 - "period.ts"
Cohesion: 0.47
Nodes (9): addDays(), d(), daysBetween(), firstOfMonth(), lastOfMonth(), Period, PeriodKey, resolvePeriod() (+1 more)

### Community 234 - "server.ts"
Cohesion: 0.05
Nodes (61): metadata, ScaleImportPage(), AssessmentPage(), metadata, metadata, StudentPage(), CamerasPage(), dynamic (+53 more)

### Community 235 - "login/actions.ts"
Cohesion: 0.46
Nodes (7): emailForDniLogin(), isEmail(), onlyDigits(), resetPasswordWithCode(), resolveEmail(), Result, sendPasswordResetCode()

### Community 238 - "access-plus/actions.ts"
Cohesion: 0.12
Nodes (17): metadata, WebPage(), issueDayPass(), METHODS, PassActionState, revokeDayPass(), savePlanHours(), toCents() (+9 more)

### Community 239 - "admin/ui.tsx"
Cohesion: 0.14
Nodes (17): F(), PadronForm(), Submit(), metadata, PadronPage(), DAYS, EMPTY, PlanHoursForm() (+9 more)

### Community 240 - "inscripcion/page.tsx"
Cohesion: 0.09
Nodes (30): dynamic, generateMetadata(), SignupPage(), metadata, TurnstilePage(), viewport, generateMetadata(), dynamic (+22 more)

### Community 243 - "access/agent/route.ts"
Cohesion: 0.50
Nodes (4): ACTIONS, dynamic, json(), POST()

### Community 246 - "tailwindcss"
Cohesion: 0.67
Nodes (3): tailwindcss@^4.3.3, tailwindcss, tailwindcss@^4.3.3

## Knowledge Gaps
- **633 isolated node(s):** `metadata`, `metadata`, `metadata`, `TYPES`, `Action` (+628 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1256 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `app/buffet/page.tsx`, `[org]/page.tsx`, `pizarra/page.tsx`, `TeamForms.tsx`, `Portal.tsx`, `MemberProvider.tsx`, `useActionForm`, `errorText`, `socios/[memberId]/page.tsx`, `MemberDetail.tsx`, `ReceptionScreen.tsx`, `src/components/ui.tsx`, `ActiveWorkout.tsx`, `pagar/page.tsx`, `VideoRTC`, `app-ios/package.json`, `labels.ts`, `Button`, `index.tsx`, `retention.ts`, `pases/page.tsx`, `engagement/actions.ts`, `platform.ts`, `admin/format.ts`, `App.tsx`, `app-ios/src/components/ui.tsx`, `AuthProvider.tsx`, `PassScreen.tsx`, `StaffLoginForm.tsx`, `admin/errors.ts`, `StrengthProgress.tsx`, `pantallas/page.tsx`, `ConfirmAction.tsx`, `RiskList.tsx`, `useMember`, `ProductForm.tsx`, `clases.tsx`, `HelpVideoButton.tsx`, `createClient`, `AssessmentView.tsx`, `login/page.tsx`, `WebEditor.tsx`, `TodayLive.tsx`, `server.ts`, `Dashboard.tsx`, `_claude_tmp/YoScreen.tsx`, `safeInternalPath`, `admin/ui.tsx`, `ScheduleForms.tsx`, `inscripcion/page.tsx`, `ref_lucide_react`, `pantalla-tv-descartada/page.tsx`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `next` connect `next` to `app/buffet/page.tsx`, `payments/actions.ts`, `[org]/page.tsx`, `react`, `buffet/actions.ts`, `admin/layout.tsx`, `pizarra/page.tsx`, `createClient`, `MemberProvider.tsx`, `negocio/page.tsx`, `maquina/[code]/page.tsx`, `getAdminContext`, `socios/[memberId]/page.tsx`, `formObject`, `robots.ts`, `ReceptionScreen.tsx`, `ActiveWorkout.tsx`, `accesos/page.tsx`, `[machineId]/page.tsx`, `pagar/page.tsx`, `labels.ts`, `retention.ts`, `pases/page.tsx`, `engagement/actions.ts`, `platform.ts`, `admin/format.ts`, `platform/package.json`, `PassScreen.tsx`, `bookings/route.ts`, `routine/route.ts`, `StaffLoginForm.tsx`, `subscriptions.ts`, `dependencies`, `StrengthProgress.tsx`, `pantallas/page.tsx`, `ConfirmAction.tsx`, `RiskList.tsx`, `[...path]/route.ts`, `ProductForm.tsx`, `useMember`, `createClient`, `login/page.tsx`, `createAdminClient`, `server.ts`, `_claude_tmp/YoScreen.tsx`, `safeInternalPath`, `access-plus/actions.ts`, `ScheduleForms.tsx`, `inscripcion/page.tsx`, `access/agent/route.ts`, `admin/ui.tsx`, `ref_lucide_react`, `pantalla-tv-descartada/page.tsx`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `payments/actions.ts`, `[org]/page.tsx`, `buffet/actions.ts`, `admin/layout.tsx`, `pizarra/page.tsx`, `MemberProvider.tsx`, `negocio/page.tsx`, `maquina/[code]/page.tsx`, `getAdminContext`, `socios/[memberId]/page.tsx`, `formObject`, `accesos/page.tsx`, `next`, `[machineId]/page.tsx`, `pagar/page.tsx`, `labels.ts`, `pases/page.tsx`, `engagement/actions.ts`, `admin/format.ts`, `bookings/route.ts`, `routine/route.ts`, `pantallas/page.tsx`, `ConfirmAction.tsx`, `ProductForm.tsx`, `createClient`, `login/page.tsx`, `TodayLive.tsx`, `server.ts`, `login/actions.ts`, `access-plus/actions.ts`, `safeInternalPath`, `inscripcion/page.tsx`, `ScheduleForms.tsx`, `ref_lucide_react`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `metadata`, `metadata`, `metadata` to the rest of the system?**
  _633 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app/buffet/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10220673635307782 - nodes in this community are weakly interconnected._
- **Should `payments/actions.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `agente.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10967741935483871 - nodes in this community are weakly interconnected._