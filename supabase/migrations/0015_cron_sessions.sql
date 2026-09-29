-- =====================================================================
-- Evolution Platform v2 · 0015 · Generación diaria de clases (pg_cron)
-- Todos los días 03:00 (Argentina) crea las clases de las próximas 4 semanas.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $c$select cron.schedule('generate-class-sessions', '0 6 * * *', 'select public.generate_sessions(null, 4)')$c$;
  end if;
end $$;
