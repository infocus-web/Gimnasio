-- Género del socio: lo elige en la inscripción (o lo carga recepción).
-- Se usa para el saludo del molinete ("¡Bienvenido, Juan!" / "¡Bienvenida, Ana!").
-- 'male' = hombre, 'female' = mujer, 'other' = prefiere no decirlo (saludo neutro). Vacío = no cargado.
alter table public.members
  add column if not exists gender text check (gender in ('male', 'female', 'other'));
