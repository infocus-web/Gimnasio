-- Molinete por QR: un socio (o pase de invitado) puede volver a pasar después de 1 minuto (antes 3).
-- Reescribe turnstile_scan tal como está en la base, cambiando solo ese intervalo.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.turnstile_scan(text,text,bigint)'::regprocedure) into v_def;
  if v_def not like '%interval ''3 minutes''%' then
    raise exception 'turnstile_scan no tiene el intervalo de 3 minutos esperado';
  end if;
  execute replace(v_def, 'interval ''3 minutes''', 'interval ''1 minute''');
end $$;
