-- =====================================================================
-- 0027 · El socio no puede tocar su foto ni su apto físico
-- (los carga el gimnasio; recepción usa la foto para reconocerlo)
-- =====================================================================
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_setting('app.linking_user', true) = 'on'
     or current_setting('app.access_sync', true) = 'on'
     or private.has_permission(old.org_id, 'members.write') then
    return new;
  end if;
  -- Staff activo registrando una entrada/asistencia: solo puede mover last_checkin_at
  if private.staff_id(old.org_id) is not null
     and (to_jsonb(new) - 'last_checkin_at' - 'updated_at') = (to_jsonb(old) - 'last_checkin_at' - 'updated_at') then
    return new;
  end if;
  if new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id
     or new.billing_account_id is distinct from old.billing_account_id
     or new.status is distinct from old.status
     or new.tags is distinct from old.tags
     or new.medical_notes is distinct from old.medical_notes
     or new.document_id is distinct from old.document_id
     or new.last_checkin_at is distinct from old.last_checkin_at
     or new.access_pin is distinct from old.access_pin
     or new.biometric_consent_at is distinct from old.biometric_consent_at
     or new.photo_url is distinct from old.photo_url
     or new.medical_cert_path is distinct from old.medical_cert_path
     or new.medical_cert_uploaded_at is distinct from old.medical_cert_uploaded_at
     or new.medical_cert_expires_on is distinct from old.medical_cert_expires_on then
    raise exception 'FIELD_NOT_EDITABLE_BY_MEMBER';
  end if;
  return new;
end $$;
