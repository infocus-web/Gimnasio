-- 0042 · Cuenta primero, pago después (registro libre con email + contraseña)
-- La cuenta se vincula con la ficha de socio / invitación de staff recién cuando el
-- email está CONFIRMADO. Antes se vinculaba al crear el usuario: con el registro
-- abierto, alguien podía registrarse con el email de otra persona y quedar
-- enganchado a su ficha antes de confirmar.
--  · Altas del panel con email_confirm=true → se vinculan al crearse.
--  · Invitaciones y registro propio → se vinculan al confirmar / aceptar.
-- (Aplicada en Supabase el 2026-11-04.)

create or replace function public.handle_user_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null then
    return new;  -- todavía no confirmó: no se vincula nada
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;  -- ya estaba confirmado
  end if;
  begin
    perform private.link_user_by_email(new.id, new.email);
  exception when others then
    raise warning 'link_user_by_email(%) failed: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.handle_user_link() from public, anon, authenticated;

drop trigger if exists on_auth_user_link on auth.users;
create trigger on_auth_user_link
  after insert on auth.users
  for each row execute function public.handle_user_link();

drop trigger if exists on_auth_user_confirmed_link on auth.users;
create trigger on_auth_user_confirmed_link
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_link();
