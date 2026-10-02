-- 0022 · Mensajes de los profes a sus alumnos (WhatsApp)
-- Hoy: el profe arma el mensaje en el panel y lo abre en su WhatsApp (status 'manual').
-- Después: cuando se conecte la API de WhatsApp, el panel inserta con status 'queued'
-- y un proceso del servidor los envía y marca 'sent' / 'failed'.

create table if not exists public.message_outbox (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  sender_staff_id uuid not null references public.staff(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  channel         text not null default 'whatsapp' check (channel in ('whatsapp')),
  phone           text not null check (phone ~ '^[0-9]{8,15}$'),
  body            text not null check (length(body) between 1 and 2000),
  template_key    text check (template_key is null or length(template_key) <= 40),
  status          text not null default 'manual' check (status in ('manual', 'queued', 'sent', 'failed')),
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists message_outbox_org_created on public.message_outbox (org_id, created_at desc);
create index if not exists message_outbox_member on public.message_outbox (member_id, created_at desc);
create index if not exists message_outbox_queued on public.message_outbox (created_at) where status = 'queued';

alter table public.message_outbox enable row level security;

-- Ve los mensajes que mandó él; administración/recepción ve todos los del gimnasio
create policy message_outbox_select on public.message_outbox for select to authenticated
  using (
    sender_staff_id in (select s.id from public.staff s where s.user_id = (select auth.uid()))
    or (select private.has_permission(org_id, 'members.read'))
  );

-- Solo a sus alumnos (o a cualquiera si gestiona todos / administra socios), firmando como sí mismo.
-- Por ahora solo 'manual': 'queued' se habilita cuando exista el envío por API.
create policy message_outbox_insert on public.message_outbox for insert to authenticated
  with check (
    status = 'manual'
    and sender_staff_id in (
      select s.id from public.staff s
       where s.user_id = (select auth.uid()) and s.org_id = message_outbox.org_id and s.active
    )
    and exists (select 1 from public.members m where m.id = member_id and m.org_id = message_outbox.org_id)
    and (
      member_id in (select private.my_client_ids())
      or (select private.has_permission(org_id, 'training.manage_all'))
      or (select private.has_permission(org_id, 'members.write'))
    )
  );

grant select, insert on public.message_outbox to authenticated;
