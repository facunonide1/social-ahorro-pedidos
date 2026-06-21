-- ============================================================================
-- 0061 · USUARIOS + PERMISOS — unificación empleados ↔ usuarios (conservador)
-- ----------------------------------------------------------------------------
-- El enlace YA existe: empleados.user_id → auth.users.id (= users_admin.id).
-- Esta migración: (1) respalda ambas tablas, (2) agrega acceso multi-sucursal a
-- users_admin, (3) indexa el enlace. NO borra ni transforma datos.
-- ============================================================================

-- (1) Backups (red de seguridad)
create table if not exists public.backup_users_admin_v26 as table public.users_admin;
create table if not exists public.backup_empleados_v26 as table public.empleados;

-- (2) Acceso multi-sucursal para usuarios del panel (un encargado puede tener
-- acceso a 1+ sucursales; se cruza con el selector de sucursal global).
-- sucursal_id sigue siendo la sucursal "principal"; sucursales_acceso amplía.
alter table public.users_admin
  add column if not exists sucursales_acceso uuid[] not null default '{}';

-- (3) Índice del enlace empleado→usuario
create index if not exists empleados_user_id_idx on public.empleados(user_id) where user_id is not null;

-- RLS de los backups (solo service role / super; no exponer)
alter table public.backup_users_admin_v26 enable row level security;
alter table public.backup_empleados_v26 enable row level security;
