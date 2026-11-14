-- =====================================================================
-- Evolution Platform v2 · 0053 · Lo de la TV de la sala NO se ve en la web
--   El mensaje, la gente ahora y las clases de hoy quedan solo para la TV.
--   La web pública ya no muestra "Hoy en Evolution".
-- =====================================================================

update public.floor_settings set web_enabled = false;
alter table public.floor_settings alter column web_enabled set default false;

revoke execute on function public.public_today(text) from anon, authenticated;
