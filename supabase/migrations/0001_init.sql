-- =====================================================================
-- Gimnasio · esquema inicial
-- Socios, planes, pagos, ingresos (QR), ejercicios con video, rutinas,
-- actividades con horarios, configuración y registro de emails.
-- =====================================================================

-- ---------- utilidades ----------
create or replace function public.today_ar() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- configuración (una sola fila) ----------
create table public.settings (
  id            smallint primary key default 1 check (id = 1),
  gym_name      text not null default 'Mi Gimnasio',
  tagline       text default 'Entrená con nosotros',
  address       text,
  phone         text,
  whatsapp      text,
  email         text,
  instagram     text,
  logo_url      text,
  hero_url      text,
  opening_hours text default 'Lunes a viernes 7 a 23 · Sábados 9 a 14',
  grace_days    int not null default 3,      -- días de tolerancia después del vencimiento
  reminder_days int not null default 3,      -- aviso por email X días antes de vencer
  updated_at    timestamptz not null default now()
);
insert into public.settings (id) values (1);
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------- usuarios del sistema (admin / staff) ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'pending' check (role in ('admin', 'staff', 'pending')),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  )
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.is_service() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- El primer usuario que se registra queda como admin; los siguientes
-- quedan "pendientes" hasta que un admin los habilite.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'admin')
         then 'pending' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un admin no puede quitarse a sí mismo el rol (evita quedarse sin admins)
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Solo un administrador puede cambiar roles';
    end if;
    if old.id = auth.uid() and old.role = 'admin' and new.role <> 'admin' then
      raise exception 'No podés quitarte tu propio rol de administrador';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------- planes ----------
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price         numeric(12, 2) not null default 0,
  duration_days int not null default 30 check (duration_days > 0),
  active        boolean not null default true,
  show_public   boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------- socios ----------
create table public.members (
  id                uuid primary key default gen_random_uuid(),
  first_name        text not null,
  last_name         text not null default '',
  dni               text,
  email             text,
  phone             text,
  birth_date        date,
  address           text,
  emergency_contact text,
  medical_notes     text,
  notes             text,
  photo_url         text,
  plan_id           uuid references public.plans (id) on delete set null,
  paid_until        date,
  joined_at         date not null default public.today_ar(),
  active            boolean not null default true,
  qr_token          text not null unique default public.new_token(),
  portal_token      text not null unique default public.new_token(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index members_dni_unique on public.members (dni) where dni is not null and dni <> '';
create index members_name_idx on public.members (lower(last_name), lower(first_name));
create index members_paid_until_idx on public.members (paid_until);
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- Estado calculado del socio
create or replace function public.member_status(p_active boolean, p_paid_until date)
returns text language sql stable set search_path = '' as $$
  select case
    when not p_active then 'inactivo'
    when p_paid_until is null or p_paid_until < public.today_ar() then 'vencido'
    when p_paid_until < public.today_ar() + (select reminder_days from public.settings where id = 1) then 'por_vencer'
    else 'al_dia'
  end
$$;

create view public.members_view with (security_invoker = true) as
select
  m.*,
  p.name  as plan_name,
  p.price as plan_price,
  public.member_status(m.active, m.paid_until) as status,
  case when m.paid_until is null then null else m.paid_until - public.today_ar() end as days_left
from public.members m
left join public.plans p on p.id = m.plan_id;

-- ---------- pagos ----------
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id) on delete cascade,
  plan_id       uuid references public.plans (id) on delete set null,
  amount        numeric(12, 2) not null check (amount >= 0),
  method        text not null default 'efectivo'
                check (method in ('efectivo', 'transferencia', 'debito', 'credito', 'mercadopago', 'otro')),
  period_from   date not null,
  period_to     date not null,
  paid_at       timestamptz not null default now(),
  notes         text,
  mp_payment_id text unique,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index payments_member_idx on public.payments (member_id, paid_at desc);
create index payments_paid_at_idx on public.payments (paid_at desc);

-- Registrar un pago: calcula el período y extiende el vencimiento del socio.
create or replace function public.record_payment(
  p_member uuid,
  p_plan uuid default null,
  p_amount numeric default null,
  p_method text default 'efectivo',
  p_notes text default null,
  p_mp_id text default null,
  p_months int default 1
) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_plan   public.plans;
  v_from   date;
  v_to     date;
  v_row    public.payments;
begin
  if not (public.is_staff() or public.is_service()) then
    raise exception 'No autorizado';
  end if;

  if p_mp_id is not null then
    select * into v_row from public.payments where mp_payment_id = p_mp_id;
    if found then return v_row; end if;  -- idempotente para webhooks
  end if;

  select * into v_member from public.members where id = p_member for update;
  if not found then raise exception 'Socio inexistente'; end if;

  select * into v_plan from public.plans where id = coalesce(p_plan, v_member.plan_id);
  if not found then raise exception 'El socio no tiene plan asignado'; end if;

  v_from := greatest(public.today_ar(), coalesce(v_member.paid_until + 1, public.today_ar()));
  v_to   := v_from + (v_plan.duration_days * greatest(p_months, 1)) - 1;

  insert into public.payments (member_id, plan_id, amount, method, period_from, period_to, notes, mp_payment_id)
  values (
    v_member.id, v_plan.id,
    coalesce(p_amount, v_plan.price * greatest(p_months, 1)),
    coalesce(p_method, 'efectivo'), v_from, v_to, p_notes, p_mp_id
  )
  returning * into v_row;

  update public.members
     set paid_until = v_to, plan_id = v_plan.id, active = true
   where id = v_member.id;

  return v_row;
end $$;

-- Si se borra un pago, el vencimiento vuelve al último pago que queda.
create or replace function public.after_payment_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members
     set paid_until = (select max(period_to) from public.payments where member_id = old.member_id)
   where id = old.member_id;
  return old;
end $$;
create trigger payments_after_delete after delete on public.payments
  for each row execute function public.after_payment_delete();

-- ---------- ingresos (check-ins) ----------
create table public.checkins (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references public.members (id) on delete cascade,
  checked_at timestamptz not null default now(),
  allowed    boolean not null,
  reason     text,
  method     text not null default 'qr' check (method in ('qr', 'manual', 'dni', 'facial', 'huella')),
  created_by uuid default auth.uid()
);
create index checkins_member_idx on public.checkins (member_id, checked_at desc);
create index checkins_at_idx on public.checkins (checked_at desc);

-- Registrar un ingreso por QR o manual. Devuelve todo lo que la recepción necesita mostrar.
create or replace function public.check_in(
  p_token text default null,
  p_member uuid default null,
  p_method text default 'qr'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m       public.members;
  v_grace   int;
  v_allowed boolean;
  v_reason  text;
  v_last    public.checkins;
  v_dup     boolean := false;
  v_plan    text;
  v_month   int;
begin
  if not (public.is_staff() or public.is_service()) then
    raise exception 'No autorizado';
  end if;

  if p_member is not null then
    select * into v_m from public.members where id = p_member;
  elsif p_token is not null then
    select * into v_m from public.members where qr_token = trim(p_token);
  end if;
  if not found or v_m.id is null then
    return jsonb_build_object('found', false);
  end if;

  select grace_days into v_grace from public.settings where id = 1;

  if not v_m.active then
    v_allowed := false; v_reason := 'Socio dado de baja';
  elsif v_m.paid_until is null then
    v_allowed := false; v_reason := 'Sin pagos registrados';
  elsif v_m.paid_until >= public.today_ar() then
    v_allowed := true; v_reason := null;
  elsif v_m.paid_until >= public.today_ar() - v_grace then
    v_allowed := true; v_reason := 'Cuota vencida · en período de tolerancia';
  else
    v_allowed := false; v_reason := 'Cuota vencida';
  end if;

  -- evita duplicados si el escáner lee el mismo QR varias veces seguidas
  select * into v_last from public.checkins
   where member_id = v_m.id order by checked_at desc limit 1;
  if found and v_last.checked_at > now() - interval '2 minutes' and v_last.allowed = v_allowed then
    v_dup := true;
  else
    insert into public.checkins (member_id, allowed, reason, method)
    values (v_m.id, v_allowed, v_reason, coalesce(p_method, 'qr'));
  end if;

  select name into v_plan from public.plans where id = v_m.plan_id;
  select count(*) into v_month from public.checkins
   where member_id = v_m.id and allowed
     and checked_at >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';

  return jsonb_build_object(
    'found', true,
    'duplicate', v_dup,
    'allowed', v_allowed,
    'reason', v_reason,
    'member', jsonb_build_object(
      'id', v_m.id,
      'first_name', v_m.first_name,
      'last_name', v_m.last_name,
      'photo_url', v_m.photo_url,
      'plan_name', v_plan,
      'paid_until', v_m.paid_until,
      'days_left', case when v_m.paid_until is null then null else v_m.paid_until - public.today_ar() end,
      'medical_notes', v_m.medical_notes
    ),
    'visits_this_month', v_month
  );
end $$;

-- ---------- ejercicios, rutinas ----------
create table public.exercises (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  muscle_group  text,
  equipment     text,
  description   text,
  video_url     text,     -- link de YouTube/Vimeo o archivo subido al storage
  thumbnail_url text,
  created_at    timestamptz not null default now()
);
create index exercises_group_idx on public.exercises (muscle_group, name);

create table public.routines (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  goal          text,
  level         text default 'principiante' check (level in ('principiante', 'intermedio', 'avanzado')),
  days_per_week int default 3,
  created_at    timestamptz not null default now()
);

create table public.routine_items (
  id           uuid primary key default gen_random_uuid(),
  routine_id   uuid not null references public.routines (id) on delete cascade,
  day          int not null default 1 check (day between 1 and 7),
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  sets         int default 3,
  reps         text default '10',
  rest_seconds int default 60,
  notes        text,
  position     int not null default 0
);
create index routine_items_routine_idx on public.routine_items (routine_id, day, position);

create table public.member_routines (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members (id) on delete cascade,
  routine_id  uuid not null references public.routines (id) on delete cascade,
  assigned_at date not null default public.today_ar(),
  active      boolean not null default true,
  notes       text
);
create index member_routines_member_idx on public.member_routines (member_id, active);

-- ---------- actividades ----------
create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  instructor  text,
  color       text default '#84cc16',
  image_url   text,
  capacity    int,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.activity_schedule (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- 1 = lunes
  start_time  time not null,
  end_time    time not null,
  room        text
);
create index activity_schedule_idx on public.activity_schedule (weekday, start_time);

-- ---------- registro de emails (evita mandar dos veces el mismo aviso) ----------
create table public.email_log (
  id        bigint generated always as identity primary key,
  member_id uuid references public.members (id) on delete cascade,
  kind      text not null,
  ref       text not null default '',
  to_email  text,
  ok        boolean not null default true,
  error     text,
  sent_at   timestamptz not null default now()
);
create unique index email_log_dedupe on public.email_log (member_id, kind, ref) where ok;

-- ---------- portal del socio (acceso por link personal, sin contraseña) ----------
create or replace function public.member_portal(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_m public.members;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;
  select * into v_m from public.members where portal_token = p_token;
  if not found then return null; end if;

  select jsonb_build_object(
    'member', jsonb_build_object(
      'first_name', v_m.first_name,
      'last_name', v_m.last_name,
      'photo_url', v_m.photo_url,
      'qr_token', v_m.qr_token,
      'paid_until', v_m.paid_until,
      'days_left', case when v_m.paid_until is null then null else v_m.paid_until - public.today_ar() end,
      'status', public.member_status(v_m.active, v_m.paid_until),
      'plan', (select jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'duration_days', p.duration_days)
                 from public.plans p where p.id = v_m.plan_id)
    ),
    'routines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', r.name, 'description', r.description, 'goal', r.goal, 'level', r.level,
        'notes', mr.notes,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'day', ri.day, 'sets', ri.sets, 'reps', ri.reps, 'rest_seconds', ri.rest_seconds, 'notes', ri.notes,
            'exercise', jsonb_build_object('name', e.name, 'muscle_group', e.muscle_group,
                                           'description', e.description, 'video_url', e.video_url,
                                           'thumbnail_url', e.thumbnail_url)
          ) order by ri.day, ri.position)
          from public.routine_items ri join public.exercises e on e.id = ri.exercise_id
          where ri.routine_id = r.id), '[]'::jsonb)
      ) order by mr.assigned_at desc)
      from public.member_routines mr join public.routines r on r.id = mr.routine_id
      where mr.member_id = v_m.id and mr.active), '[]'::jsonb),
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('checked_at', c.checked_at, 'allowed', c.allowed) order by c.checked_at desc)
      from (select * from public.checkins where member_id = v_m.id order by checked_at desc limit 12) c), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('paid_at', p.paid_at, 'amount', p.amount, 'method', p.method,
                                          'period_from', p.period_from, 'period_to', p.period_to) order by p.paid_at desc)
      from (select * from public.payments where member_id = v_m.id order by paid_at desc limit 6) p), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

-- ---------- estadísticas del panel ----------
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.today_ar();
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
  v_prev_start  timestamptz := (date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') - interval '1 month') at time zone 'America/Argentina/Buenos_Aires';
  v_day_start   timestamptz := v_today::timestamp at time zone 'America/Argentina/Buenos_Aires';
begin
  if not public.is_staff() then raise exception 'No autorizado'; end if;

  return jsonb_build_object(
    'status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                 select public.member_status(active, paid_until) as status, count(*) as n
                 from public.members group by 1) s),
    'income_month', (select coalesce(sum(amount), 0) from public.payments where paid_at >= v_month_start),
    'income_prev_month', (select coalesce(sum(amount), 0) from public.payments
                           where paid_at >= v_prev_start and paid_at < v_month_start),
    'income_by_method', (select coalesce(jsonb_object_agg(method, total), '{}'::jsonb) from (
                           select method, sum(amount) as total from public.payments
                           where paid_at >= v_month_start group by method) x),
    'payments_month', (select count(*) from public.payments where paid_at >= v_month_start),
    'checkins_today', (select count(*) from public.checkins where allowed and checked_at >= v_day_start),
    'denied_today', (select count(*) from public.checkins where not allowed and checked_at >= v_day_start),
    'new_members_month', (select count(*) from public.members where created_at >= v_month_start),
    'checkins_series', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n, 0)) order by d)
                          from generate_series(v_today - 13, v_today, interval '1 day') d
                          left join (
                            select (checked_at at time zone 'America/Argentina/Buenos_Aires')::date as day, count(*) as n
                            from public.checkins where allowed and checked_at >= v_day_start - interval '14 days'
                            group by 1) c on c.day = d::date),
    'hours_series', (select jsonb_agg(jsonb_build_object('hour', h, 'n', coalesce(c.n, 0)) order by h)
                       from generate_series(6, 23) h
                       left join (
                         select extract(hour from checked_at at time zone 'America/Argentina/Buenos_Aires')::int as hour, count(*) as n
                         from public.checkins where allowed and checked_at >= now() - interval '30 days'
                         group by 1) c on c.hour = h),
    'expiring', (select coalesce(jsonb_agg(x order by x.paid_until), '[]'::jsonb) from (
                   select m.id, m.first_name, m.last_name, m.phone, m.paid_until, m.paid_until - v_today as days_left
                   from public.members m
                   where m.active and m.paid_until between v_today - 7 and v_today + 7
                   order by m.paid_until limit 15) x)
  );
end $$;

-- =====================================================================
-- Seguridad (RLS)
-- =====================================================================
alter table public.settings          enable row level security;
alter table public.profiles          enable row level security;
alter table public.plans             enable row level security;
alter table public.members           enable row level security;
alter table public.payments          enable row level security;
alter table public.checkins          enable row level security;
alter table public.exercises         enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_items     enable row level security;
alter table public.member_routines   enable row level security;
alter table public.activities        enable row level security;
alter table public.activity_schedule enable row level security;
alter table public.email_log         enable row level security;

-- Lectura pública (web del gimnasio)
create policy "settings: lectura pública" on public.settings for select using (true);
create policy "settings: admin edita" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "plans: públicos visibles" on public.plans for select
  using ((active and show_public) or public.is_staff());
create policy "activities: visibles" on public.activities for select
  using (active or public.is_staff());
create policy "schedule: visible" on public.activity_schedule for select using (true);

-- Perfiles
create policy "profiles: ver el propio o admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy "profiles: admin edita" on public.profiles for update to authenticated
  using (public.is_admin() or id = auth.uid()) with check (public.is_admin() or id = auth.uid());
create policy "profiles: admin borra" on public.profiles for delete to authenticated
  using (public.is_admin() and id <> auth.uid());

-- Staff: acceso completo a la operación diaria
do $$
declare t text;
begin
  foreach t in array array['members', 'payments', 'checkins', 'exercises', 'routines',
                           'routine_items', 'member_routines', 'email_log'] loop
    execute format('create policy "%1$s: staff" on public.%1$I for all to authenticated
                    using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
  foreach t in array array['plans', 'activities', 'activity_schedule'] loop
    execute format('create policy "%1$s: staff escribe" on public.%1$I for insert to authenticated
                    with check (public.is_staff())', t);
    execute format('create policy "%1$s: staff actualiza" on public.%1$I for update to authenticated
                    using (public.is_staff()) with check (public.is_staff())', t);
    execute format('create policy "%1$s: staff borra" on public.%1$I for delete to authenticated
                    using (public.is_staff())', t);
  end loop;
end $$;

-- Solo el admin puede borrar pagos
drop policy "payments: staff" on public.payments;
create policy "payments: staff ve" on public.payments for select to authenticated using (public.is_staff());
create policy "payments: staff crea" on public.payments for insert to authenticated with check (public.is_staff());
create policy "payments: staff edita" on public.payments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "payments: admin borra" on public.payments for delete to authenticated using (public.is_admin());

-- Permisos explícitos para la API
grant usage on schema public to anon, authenticated, service_role;
grant select on public.settings, public.plans, public.activities, public.activity_schedule to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant select on public.members_view to authenticated, service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.member_portal(text) to anon, authenticated, service_role;
grant execute on function public.today_ar(), public.member_status(boolean, date),
                          public.is_staff(), public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_staff(), public.is_admin(), public.is_service(), public.new_token(),
                          public.record_payment(uuid, uuid, numeric, text, text, text, int),
                          public.check_in(text, uuid, text), public.dashboard_stats()
  to authenticated, service_role;

-- =====================================================================
-- Storage: fotos de socios, videos de ejercicios, imágenes de la web
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media: staff sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_staff());
create policy "media: staff actualiza" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_staff());
create policy "media: staff borra" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_staff());
