-- 0035 · Permisos granulares por usuario admin (F6.5.T5)
--
-- Agrega overrides de permisos por módulo/acción sobre el preset del rol.
-- {} (default) = el usuario usa el preset de su rol. Cualquier clave presente
-- overridea ese módulo/acción puntual.
--
-- Forma esperada del jsonb:
--   { "finanzas": { "ver": true, "aprobar": false }, "compras": { "crear": true } }

alter table public.users_admin
  add column if not exists permisos_custom jsonb not null default '{}'::jsonb;

comment on column public.users_admin.permisos_custom is
  'Overrides granulares de permisos por módulo/acción sobre el preset del rol. {} = usar preset del rol.';
