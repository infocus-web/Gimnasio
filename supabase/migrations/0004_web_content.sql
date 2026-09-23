-- Contenido editable de la web pública (estilo "Ales"): sección nosotros, galería y horarios
alter table public.settings
  add column if not exists hero_kicker    text default 'Gimnasio y centro de fitness',
  add column if not exists hero_text      text default 'Musculación, clases grupales y profes que te acompañan en cada entrenamiento.',
  add column if not exists about_title    text default 'Estamos para que entrenes mejor, con técnica y constancia',
  add column if not exists about_text     text default 'Somos un gimnasio de barrio con equipamiento completo, clases todos los días y seguimiento personalizado. Cada socio tiene su rutina con videos de cada ejercicio en el celular.',
  add column if not exists about_image_url  text,
  add column if not exists about_image2_url text,
  add column if not exists gallery        text[] not null default '{}';

update public.activities set color = '#edcc36' where color = '#84cc16';
