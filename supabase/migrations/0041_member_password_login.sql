-- 0041 · Acceso de socios con usuario (DNI o email) y contraseña
--  · La contraseña se elige en la inscripción online. Como la cuenta se crea recién
--    cuando Mercado Pago aprueba el pago, mientras tanto se guarda SOLO el hash bcrypt
--    (nunca el texto) en una tabla privada, y se usa al crear el usuario.
--  · Login con DNI: el servidor verifica DNI + contraseña acá y recién ahí devuelve el
--    email, así nadie puede averiguar el email de otro socio con su DNI.
--  · Todas las funciones son solo para el servidor (service_role).
-- (Ya aplicada en Supabase el 2026-11-04.)

create table if not exists private.signup_passwords (
  intent_id     uuid primary key references public.payment_intents (id) on delete cascade,
  password_hash text not null,
  created_at    timestamptz not null default now()
);
alter table private.signup_passwords enable row level security;
revoke all on private.signup_passwords from public, anon, authenticated;

create or replace function public.signup_set_password(p_intent uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_password is null or length(p_password) < 8 or length(p_password) > 72 then
    raise exception 'PASSWORD_INVALID';
  end if;
  delete from private.signup_passwords where created_at < now() - interval '3 days';
  insert into private.signup_passwords (intent_id, password_hash)
  values (p_intent, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  on conflict (intent_id) do update set password_hash = excluded.password_hash, created_at = now();
end $$;

create or replace function public.signup_password_hash(p_intent uuid)
returns text language sql stable security definer set search_path = '' as $$
  select password_hash from private.signup_passwords where intent_id = p_intent
$$;

create or replace function public.signup_clear_password(p_intent uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.signup_passwords where intent_id = p_intent
$$;

-- Freno a la fuerza bruta del login por DNI: 10 intentos fallidos cada 15 minutos por DNI
create table if not exists private.login_attempts (
  document     text primary key,
  fails        int not null default 0,
  window_start timestamptz not null default now()
);
alter table private.login_attempts enable row level security;
revoke all on private.login_attempts from public, anon, authenticated;

-- Email del socio con ese DNI que tiene cuenta (para mandar el código de recuperación)
create or replace function public.member_email_by_document(p_document text)
returns text language sql stable security definer set search_path = '' as $$
  select u.email
    from public.members m
    join auth.users u on u.id = m.user_id
   where m.document_id = regexp_replace(coalesce(p_document, ''), '\D', '', 'g')
     and length(regexp_replace(coalesce(p_document, ''), '\D', '', 'g')) >= 6
     and u.deleted_at is null
   order by (m.status = 'active') desc, m.created_at desc
   limit 1
$$;

-- DNI + contraseña correctos → email de la cuenta (para que el celular inicie sesión). Si no, null.
create or replace function public.member_login_email(p_document text, p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_doc   text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_email text;
  v_hash  text;
  v_a     private.login_attempts;
begin
  if length(v_doc) < 6 or coalesce(p_password, '') = '' then return null; end if;

  select * into v_a from private.login_attempts where document = v_doc;
  if found and v_a.window_start > now() - interval '15 minutes' and v_a.fails >= 10 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select u.email, u.encrypted_password into v_email, v_hash
    from public.members m
    join auth.users u on u.id = m.user_id
   where m.document_id = v_doc and u.deleted_at is null
   order by (m.status = 'active') desc, m.created_at desc
   limit 1;

  if coalesce(v_hash, '') <> '' and extensions.crypt(p_password, v_hash) = v_hash then
    delete from private.login_attempts where document = v_doc;
    return v_email;
  end if;

  insert into private.login_attempts as a (document, fails, window_start) values (v_doc, 1, now())
  on conflict (document) do update set
    fails        = case when a.window_start < now() - interval '15 minutes' then 1 else a.fails + 1 end,
    window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end;
  return null;
end $$;

revoke all on function public.signup_set_password(uuid, text)       from public, anon, authenticated;
revoke all on function public.signup_password_hash(uuid)            from public, anon, authenticated;
revoke all on function public.signup_clear_password(uuid)           from public, anon, authenticated;
revoke all on function public.member_email_by_document(text)        from public, anon, authenticated;
revoke all on function public.member_login_email(text, text)        from public, anon, authenticated;
grant execute on function public.signup_set_password(uuid, text)    to service_role;
grant execute on function public.signup_password_hash(uuid)         to service_role;
grant execute on function public.signup_clear_password(uuid)        to service_role;
grant execute on function public.member_email_by_document(text)     to service_role;
grant execute on function public.member_login_email(text, text)     to service_role;
