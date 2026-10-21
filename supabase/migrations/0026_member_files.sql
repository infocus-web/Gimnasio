-- =====================================================================
-- 0026 · Ficha de socio: foto (webcam) y apto físico, en almacenamiento PRIVADO
--
-- Bucket `socios` (privado, no se puede ver por link público):
--   <org_id>/<member_id>/foto-<n>.jpg
--   <org_id>/<member_id>/apto-<n>.<pdf|jpg|png|webp>
-- Se ven con links firmados que vencen (los genera el panel con la sesión del staff).
--   ver:     staff con members.read de esa org (y el propio socio, su carpeta)
--   subir:   staff con members.write
--   borrar:  staff con members.write
-- members.photo_url guarda la ruta dentro del bucket (antes: URL pública, sin uso).
-- El número de socio único ya existe: members.access_pin (100001, 100002…),
-- se asigna solo al inscribir (trigger members_assign_pin).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('socios', 'socios', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.members add column if not exists medical_cert_path text;
alter table public.members add column if not exists medical_cert_uploaded_at timestamptz;
alter table public.members add column if not exists medical_cert_expires_on date;

-- ¿Este usuario puede <permiso> sobre el archivo? (la carpeta 1 es la org, la 2 el socio)
create or replace function private.member_file_allowed(p_name text, p_perm text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_org   uuid;
  v_mem   uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) < 2
     or v_parts[1] !~ '^[0-9a-f-]{36}$' or v_parts[2] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_org := v_parts[1]::uuid;
  v_mem := v_parts[2]::uuid;
  if not exists (select 1 from public.members where id = v_mem and org_id = v_org) then return false; end if;
  if private.has_permission(v_org, p_perm) then return true; end if;
  -- el socio (o el titular de su familia) puede VER sus propios archivos
  return p_perm = 'members.read' and v_mem in (select private.actable_member_ids());
end $$;
revoke execute on function private.member_file_allowed(text, text) from public, anon;
grant execute on function private.member_file_allowed(text, text) to authenticated;

drop policy if exists "socios: ver" on storage.objects;
drop policy if exists "socios: subir" on storage.objects;
drop policy if exists "socios: reemplazar" on storage.objects;
drop policy if exists "socios: borrar" on storage.objects;
create policy "socios: ver" on storage.objects for select to authenticated
  using (bucket_id = 'socios' and private.member_file_allowed(name, 'members.read'));
create policy "socios: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'socios' and private.member_file_allowed(name, 'members.write'));
create policy "socios: reemplazar" on storage.objects for update to authenticated
  using (bucket_id = 'socios' and private.member_file_allowed(name, 'members.write'));
create policy "socios: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'socios' and private.member_file_allowed(name, 'members.write'));

-- El directorio suma: número de socio y estado del apto físico (columnas nuevas al final)
create or replace view public.member_directory with (security_invoker = true) as
select m.id, m.org_id, m.first_name, m.last_name, m.email, m.phone, m.document_id, m.birth_date,
       m.status, m.photo_url, m.medical_notes, m.last_checkin_at, m.created_at,
       m.user_id is not null                          as has_app,
       m.billing_account_id,
       ba.payer_member_id,
       coalesce(ba.payer_member_id = m.id, false)     as is_payer,
       cur.membership_id, cur.plan_id, cur.plan_name, cur.membership_status,
       cur.current_period_end, cur.credits_remaining,
       m.access_pin                                   as member_number,
       m.medical_cert_path is not null                as has_medical_cert,
       m.medical_cert_expires_on
  from public.members m
  left join public.billing_accounts ba on ba.id = m.billing_account_id
  left join lateral (
    select ms.id as membership_id, p.id as plan_id, p.name as plan_name, ms.status as membership_status,
           ms.current_period_end, ms.credits_remaining
      from public.membership_members mm
      join public.memberships ms on ms.id = mm.membership_id
      join public.membership_plans p on p.id = ms.plan_id
     where mm.member_id = m.id and ms.status <> 'canceled'
     order by (ms.status = 'expired'), ms.current_period_end desc
     limit 1
  ) cur on true;
