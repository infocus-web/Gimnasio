-- =====================================================================
-- 0049 · Publicidad con textos animados (estilo redes) y orientación
--
-- Cada imagen de Panel → Pantallas puede llevar:
--   badge     etiqueta corta arriba del título ("PROMO", "NUEVO")
--   title     título grande (entre *asteriscos* = palabra resaltada en amarillo)
--   subtitle  bajada
--   style     animación de los textos: impacto | deslizar | suave
--   text_position  top | center | bottom
--   orientation    vertical (tablet) | horizontal (TVs) | both (las dos)
-- =====================================================================
alter table public.kiosk_slides
  add column if not exists badge text check (badge is null or length(badge) <= 30),
  add column if not exists title text check (title is null or length(title) <= 80),
  add column if not exists subtitle text check (subtitle is null or length(subtitle) <= 160),
  add column if not exists style text not null default 'impacto' check (style in ('impacto', 'deslizar', 'suave')),
  add column if not exists text_position text not null default 'bottom' check (text_position in ('top', 'center', 'bottom')),
  add column if not exists orientation text not null default 'both' check (orientation in ('vertical', 'horizontal', 'both'));
