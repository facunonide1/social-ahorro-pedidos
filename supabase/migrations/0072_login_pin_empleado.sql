-- 0072 · Login simple por N° de empleado + PIN (v0.35-login-vista-rol)
--
-- Agrega un método de acceso ADICIONAL para empleados operativos: número de
-- empleado + PIN de 4 dígitos (como fichar). NO reemplaza el login por email
-- del dueño/admins; lo suma. El PIN se guarda SIEMPRE hasheado (scrypt) y nunca
-- en texto plano. Las columnas viven en `users_admin` porque:
--   · `users_admin.id` = `auth.users.id` → el login mapea N°→auth user directo.
--   · `users_admin` ya gobierna el acceso al panel (rol + permisos).
-- Todas las lecturas/escrituras de estas columnas pasan por service_role
-- (server actions): con RLS activo y sin policy amplia, el `pin_hash` no es
-- legible por clientes anon/authenticated.

alter table public.users_admin
  add column if not exists numero_empleado     text,
  add column if not exists pin_hash            text,
  add column if not exists pin_intentos        integer     not null default 0,
  add column if not exists pin_bloqueado_hasta timestamptz;

comment on column public.users_admin.numero_empleado is
  'Legajo/N° de empleado para login numérico (único, opcional). Solo roles operativos.';
comment on column public.users_admin.pin_hash is
  'PIN de 4 dígitos hasheado con scrypt (formato scrypt$N$r$p$salt$hash). Nunca texto plano.';
comment on column public.users_admin.pin_intentos is
  'Intentos fallidos consecutivos de PIN. Se resetea a 0 al ingresar bien.';
comment on column public.users_admin.pin_bloqueado_hasta is
  'Si está en el futuro, el login por PIN está bloqueado hasta esa hora.';

-- N° de empleado único (solo cuando está seteado).
create unique index if not exists users_admin_numero_empleado_uq
  on public.users_admin (numero_empleado)
  where numero_empleado is not null;
