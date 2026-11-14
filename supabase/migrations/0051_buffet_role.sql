-- =====================================================================
-- 0051 · Rol "buffet" (concesionario del buffet)
-- Va en su propia migración: un valor nuevo de enum no se puede usar en la
-- misma transacción en la que se crea. El rol solo maneja el buffet (0052).
-- =====================================================================
alter type public.staff_role add value if not exists 'buffet';
