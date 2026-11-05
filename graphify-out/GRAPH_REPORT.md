# Graph Report - Gimnasio  (2026-11-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1893 nodes · 6373 edges · 93 communities (85 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `80a0cf9d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 89
- Community 90

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 247 edges
2. `getAdminContext` - 174 edges
3. `next` - 135 edges
4. `useActionForm()` - 99 edges
5. `SubmitButton()` - 95 edges
6. `Notice()` - 94 edges
7. `dbMessage()` - 80 edges
8. `Field()` - 60 edges
9. `errorText()` - 54 edges
10. `ActionState` - 52 edges

## Surprising Connections (you probably didn't know these)
- `SignupInfo` --calls--> `createAdminClient()`  [EXTRACTED]
  platform/src/features/payments/signup.ts → platform/src/lib/supabase/admin.ts
- `assignRoutine()` --calls--> `errorText()`  [EXTRACTED]
  src/pages/admin/MemberDetail.tsx → src/components/ui.tsx
- `manualCheckin()` --calls--> `errorText()`  [EXTRACTED]
  src/pages/admin/MemberDetail.tsx → src/components/ui.tsx
- `toggleActive()` --calls--> `errorText()`  [EXTRACTED]
  src/pages/admin/MemberDetail.tsx → src/components/ui.tsx
- `submit()` --calls--> `errorText()`  [EXTRACTED]
  src/pages/admin/MemberForm.tsx → src/components/ui.tsx

## Import Cycles
- None detected.

## Communities (93 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (35): Aperturas, cargar_json(), ciclo(), conectar(), ejecutar_cola(), guardar_estado(), huella_hash(), kv() (+27 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (53): BusinessPage(), DashboardBody(), metadata, n(), TABS, dynamic, ExerciseCard(), fmtDay() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (34): F(), PadronForm(), Submit(), DAYS, EMPTY, PlanHoursForm(), ScaleImportState, Action (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (47): dynamic, json(), maxDuration, POST(), ASSESSMENT_COLUMNS, AssessmentRow, AssessmentView(), BAR (+39 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (37): GridPage(), metadata, addDays(), AgendaWeek(), metadata, mondayOf(), AssessmentPage(), metadata (+29 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (43): AccessPage(), RoomsPage(), MemberDetailPage(), InfoTip(), AgentPanel(), Bare, CopyValue(), DeviceButtons() (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (40): GuestPass, GuestsScreen(), Quota, ymd(), metadata, TurnstilePage(), viewport, call() (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (35): metadata, SessionPage(), STATUS, metadata, StudentsPage(), metadata, RANGES, TrainerMembersPage() (+27 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (35): metadata, PlansPage(), metadata, VenderPage(), emptyToUndef(), METHODS, planSchema, recordPayment() (+27 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (32): QrImage(), cx(), Spinner(), VideoPlayer(), videoThumb(), WeekSchedule(), fmtDateLong(), fmtTime() (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (38): Badge(), confirmDelete(), errorText(), Field(), Loading(), uploadMedia(), RoutineItem, Activities() (+30 more)

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (32): GET, POST, Member, METHOD, sendBirthday(), sendExpired(), sendReceipt(), sendReminder() (+24 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (34): metadata, metadata, GET(), saveAccessSettings(), adjustMembershipEnd(), assignPlan(), cancelInvitation(), setTrainerScheduleAccess() (+26 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (30): addScaleReading(), assessmentSchema, coach(), deleteAssessment(), importScaleCsv(), int(), opt(), saveAssessment() (+22 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (28): metadata, WebPage(), issueDayPass(), METHODS, PassActionState, revokeDayPass(), savePlanHours(), toCents() (+20 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (30): ActivitiesPage(), metadata, metadata, EQUIPMENT_KINDS, equipmentLabel(), LABELS, formObject(), addEquipment() (+22 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (27): Modal(), fmtDate(), fmtDateTime(), fmtMoney(), METHOD_LABEL, todayISO(), callApi(), Checkin (+19 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (28): ProgramsPage(), ProgramBuilder(), Action, AddDayForm(), AddExerciseFields(), AddExerciseForm(), AssignableStudent, AssignToStudentsForm() (+20 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (22): Avatar(), Empty(), StatusBadge(), statusStyles, Toast, ToastCtx, useToast(), Variant (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (27): metadata, NewMemberPage(), createMember(), DELETE_MESSAGES, deleteMember(), emailAccessLink(), fieldErrors(), inviteMemberToApp() (+19 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (21): EntrenarPage(), metadata, WorkoutScreen(), ActiveWorkout(), ActiveWorkoutProps, fmtClock(), fmtKg(), kgFormatter (+13 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (21): CierrePage(), metadata, Totals, addDays(), fmtDay(), GananciasPage(), metadata, asPrice() (+13 more)

### Community 22 - "Community 22"
Cohesion: 0.19
Nodes (23): metadata, METHOD, metadata, TemplatesPage(), createAgentToken(), createKioskToken(), deviceAction(), DeviceOp (+15 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (20): ClassesScreen(), KNOWN_ERRORS, ClasesPage(), metadata, capitalize(), ClassSchedule(), ClassScheduleProps, equipmentNoun() (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (19): metadata, PasePage(), PassScreen(), wait(), MembershipBanner(), MembershipBannerProps, formatPeriodEnd(), getPassStatus() (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (19): react-router-dom, Button(), AdminLayout(), NAV, PendingAccess(), AuthCtx, AuthState, SettingsCtx (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.17
Nodes (18): metadata, StudentPage(), FILTERS, metadata, PassesPage(), PAY, AccessSettingsForm(), IssuePassForm() (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (21): devDependencies, oxlint@^1.81.0, tailwindcss@^4.3.3, @tailwindcss/vite@^4.3.3, @types/qrcode@^1.5.6, vite@^8.3.0, @vitejs/plugin-react@^6.1.1, engines (+13 more)

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (19): HorariosPage(), metadata, PeakHoursScreen(), BAR_CLASS, DAY_LABELS, fmtAvg(), hourOf(), hoursForDay() (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (17): metadata, ProgresoPage(), ProgressScreen(), dayKeyFormatter, localDayKey(), StrengthProgress(), StrengthProgressProps, Ctx (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (17): GymHome(), Heading(), NAV, revalidate, IosInstallButton(), Step(), REVEAL_BOOT, RevealObserver() (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.16
Nodes (18): Activities, AdminLayout, App(), Dashboard, Exercises, MemberDetail, Members, Payments (+10 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (21): @types/node@^24.13.6, @types/react@^19.2.18, @types/react-dom@^19.2.7, typescript@~6.0.2, @types/node, @types/react, @types/react-dom, typescript (+13 more)

### Community 33 - "Community 33"
Cohesion: 0.13
Nodes (18): metadata, RecepcionPage(), DENIED, Entry, fmtDay(), fmtTime(), GuestEntry, METHOD (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.10
Nodes (20): jobs, windows-exe, name, on, push, workflow_dispatch, branches, paths (+12 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (16): DELETE(), dynamic, runtime, dynamic, POST(), runtime, BookingResult, bookingResultSchema (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (18): Ctx, deviceIp(), dynamic, GET, handle(), POST, same(), text() (+10 more)

### Community 37 - "Community 37"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 38 - "Community 38"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (16): dynamic, ERR, esc(), GET(), getOffer(), Offer, page(), POST() (+8 more)

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (15): metadata, ScaleImportPage(), metadata, ReglasPage(), ScaleImportForm(), Card(), compress(), DAYS (+7 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (15): metadata, PHASE, RetosPage(), ChallengesScreen(), toggle(), metadata, RetosPage(), AdminChallenge (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (12): AdminLayout(), MemberAppLayout(), Wordmark(), AdminNav(), ICONS, NavItem, ROLE_LABELS, MemberNav() (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.19
Nodes (16): dynamic, generateMetadata(), SignupPage(), generateMetadata(), getPublicGym, FriendPromo, ReferralInfo, SignupState (+8 more)

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (13): GET(), ConfirmPage(), confirm(), metadata, safeNext(), TYPES, LoginForm(), safeNext() (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.19
Nodes (16): EncuestasPage(), metadata, npsTone(), PERIODS, scoreTone(), NpsToggle(), cancelChallenge(), challengeSchema (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.21
Nodes (15): metadata, applyReferral(), ctxFor(), endFriendPair(), errorText(), FORBIDDEN, KINDS, markContacted() (+7 more)

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (12): MachinePage(), metadata, metadata, PostersPage(), approveStaffRequest(), generatePassword(), origin(), PUBLIC_ERRORS (+4 more)

### Community 48 - "Community 48"
Cohesion: 0.12
Nodes (4): nextConfig, SITE, SITE, next

### Community 49 - "Community 49"
Cohesion: 0.23
Nodes (14): dynamic, json(), POST(), dynamic, json(), POST(), createSchema, deleteStaff() (+6 more)

### Community 50 - "Community 50"
Cohesion: 0.20
Nodes (13): dynamic, GET(), json(), POST(), mpWebhookConfigured(), mpManifest(), MpSignatureInput, parseMpSignature() (+5 more)

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (12): dynamic, metadata, Options, PagarPage(), getPayment(), otp(), sendSignupAccessOnce(), SignupInfo (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (14): metadata, YoPage(), AchievementsCard(), addDays(), fmtTs(), fmtYmd(), FreezeCard(), ReferralCard() (+6 more)

### Community 54 - "Community 54"
Cohesion: 0.24
Nodes (12): Claimed, dynamic, GET(), json(), maxDuration, ComunicacionLayout(), buildEmail(), emailConfigured() (+4 more)

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (13): FILTERS, HistorialPage(), metadata, Badge, ENGAGEMENT_ERRORS, HistoryRow, NewMemberOption, Notice (+5 more)

### Community 56 - "Community 56"
Cohesion: 0.31
Nodes (12): metadata, TeamPage(), InviteButton(), RequestCard(), RequestRow, ShareLink(), CreateStaffAccountForm(), InviteStaffForm() (+4 more)

### Community 57 - "Community 57"
Cohesion: 0.14
Nodes (14): react-dom@^19.2.8, @supabase/supabase-js@^2.117.1, react-dom, @supabase/supabase-js, dependencies, next@^16.3.6, react@^19.3.0, react-dom@^19.3.0 (+6 more)

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (13): dependencies, html5-qrcode@^2.3.8, lucide-react@^1.47.0, qrcode@^1.5.4, react@^19.2.8, react-router-dom@^7.18.4, html5-qrcode, lucide-react (+5 more)

### Community 59 - "Community 59"
Cohesion: 0.31
Nodes (8): metadata, StaffLoginPage(), safeNext(), StaffLoginForm(), MfaScreen(), Props, SignOutButton(), createClient()

### Community 60 - "Community 60"
Cohesion: 0.27
Nodes (8): GET(), getPublicToday(), PublicToday, PublicTodayClass, hhmm(), LEVEL, spotsLabel(), TodayLive()

### Community 61 - "Community 61"
Cohesion: 0.25
Nodes (6): metadata, SITE, viewport, metadata, display, text

### Community 62 - "Community 62"
Cohesion: 0.31
Nodes (9): MachinesPage(), metadata, Bare, ExerciseOption, MachineForm(), TvLinkPanel(), TvSettingsForm(), TvSteps() (+1 more)

### Community 63 - "Community 63"
Cohesion: 0.36
Nodes (10): approveDraft(), FLOOR_ERRORS, floorCtx(), linkTv(), machineSchema, msg(), saveMachine(), saveTvSettings() (+2 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (10): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 65 - "Community 65"
Cohesion: 0.27
Nodes (9): ComunicacionPage(), metadata, sendTestEmail(), ActionButton(), NoticeEditor(), AdminData, NOTICE_ORDER, renderTemplate() (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.36
Nodes (8): metadata, RiesgoPage(), fmt(), message(), RiskList(), Row(), firstName(), RiskRow

### Community 68 - "Community 68"
Cohesion: 0.38
Nodes (8): BarChart(), Card(), PageHeader(), daysLeftText(), PayMethod, Dashboard(), Stat(), Stats

### Community 69 - "Community 69"
Cohesion: 0.39
Nodes (7): dynamic, esc(), GET(), DayPassInfo, dayPassInfo(), esc(), sendDayPassEmailOnce()

### Community 70 - "Community 70"
Cohesion: 0.31
Nodes (7): metadata, OnlinePage(), RefundInfo, refundText(), SOURCE, STATUS, MpNotice()

### Community 71 - "Community 71"
Cohesion: 0.22
Nodes (7): metadata, PadronPage(), submitStaffRequest(), DAY_NAMES, PERIOD, PublicGym, PublicPlan

### Community 72 - "Community 72"
Cohesion: 0.31
Nodes (8): FREQS, FreqSelect(), Period, PERIODS, PeriodSelect(), PriceInput(), RateOption, RatesForm()

### Community 73 - "Community 73"
Cohesion: 0.46
Nodes (4): AgendaLayout(), MyClassesLayout(), PagosLayout(), SubNav()

### Community 74 - "Community 74"
Cohesion: 0.39
Nodes (6): GuestsPage(), metadata, getMemberContext, OrgInfo, photoSrc(), requireUser

### Community 75 - "Community 75"
Cohesion: 0.33
Nodes (6): recharts@^3.10.1, DAYS, monthLabel(), MonthlyBars(), MONTHS, recharts

### Community 76 - "Community 76"
Cohesion: 0.38
Nodes (6): ReferidosPage(), FriendPromoForm(), Pct(), Promo(), norm(), ReferralForm()

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 78 - "Community 78"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, typecheck

### Community 79 - "Community 79"
Cohesion: 0.40
Nodes (5): @supabase/ssr@^0.12.7, config, proxy(), tenantFromHost(), @supabase/ssr

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (6): scripts, build, db:types, dev, start, typecheck

### Community 81 - "Community 81"
Cohesion: 0.53
Nodes (4): ChangePasswordForm(), ChangePasswordPage(), metadata, safeNext()

### Community 82 - "Community 82"
Cohesion: 0.40
Nodes (5): ACTIVITY_IMAGES, activityImage(), BRAND, norm(), WEB_MEDIA

### Community 83 - "Community 83"
Cohesion: 0.50
Nodes (4): ACTIONS, dynamic, json(), POST()

### Community 84 - "Community 84"
Cohesion: 0.40
Nodes (4): crons, framework, rewrites, $schema

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (3): crons, framework, $schema

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Community 48` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 8`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 32`, `Community 33`, `Community 35`, `Community 36`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 49`, `Community 50`, `Community 51`, `Community 53`, `Community 54`, `Community 55`, `Community 56`, `Community 57`, `Community 59`, `Community 60`, `Community 61`, `Community 62`, `Community 63`, `Community 65`, `Community 66`, `Community 69`, `Community 70`, `Community 71`, `Community 73`, `Community 74`, `Community 79`, `Community 81`, `Community 83`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05365686944634313 - nodes in this community are weakly interconnected._
- **Why does `createClient()` connect `Community 12` to `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 19`, `Community 21`, `Community 22`, `Community 26`, `Community 33`, `Community 35`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 47`, `Community 49`, `Community 51`, `Community 55`, `Community 56`, `Community 60`, `Community 62`, `Community 63`, `Community 65`, `Community 66`, `Community 70`, `Community 71`, `Community 74`, `Community 76`, `Community 81`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06440677966101695 - nodes in this community are weakly interconnected._
- **Why does `errorText()` connect `Community 10` to `Community 68`, `Community 9`, `Community 16`, `Community 18`, `Community 25`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._