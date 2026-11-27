-- =====================================================================
-- 0064 · Publicidad con videos (Panel → Pantallas)
--
-- Además de imágenes, la publicidad acepta videos cortos (MP4 / WebM, hasta 50 MB).
-- Las pantallas pasan el video completo (sin sonido) y siguen con la próxima.
--   kiosk_slides.media_type   image | video   (image_path guarda la ruta en los dos casos)
--   bucket `molinete`: <org_id>/<uuid>.jpg | .mp4 | .webm
-- =====================================================================

update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
 where id = 'molinete';

alter table public.kiosk_slides
  add column if not exists media_type text not null default 'image' check (media_type in ('image', 'video'));
