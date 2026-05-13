-- ============================================================================
-- 0023_finanzas_conciliacion.sql · F2.3 Conciliación bancaria
-- Buffer de líneas de extracto cargadas para conciliar contra movimientos.
-- ============================================================================

create table if not exists public.extracto_lineas_pendientes (
  id                      uuid primary key default gen_random_uuid(),
  cuenta_bancaria_id      uuid not null references public.cuentas_bancarias_propias(id) on delete cascade,
  fecha                   date not null,
  monto                   numeric(14,2) not null,
  descripcion             text,
  referencia              text,
  ingresada_en_extracto   timestamptz not null default now(),
  matched_movimiento_id   uuid references public.movimientos_bancarios(id) on delete set null,
  estado                  text not null default 'pendiente' check (estado in ('pendiente','match_sugerido','conciliado','ignorado')),
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null
);

create index if not exists extracto_pendientes_cuenta_idx
  on public.extracto_lineas_pendientes(cuenta_bancaria_id, fecha desc)
  where estado in ('pendiente','match_sugerido');

alter table public.extracto_lineas_pendientes enable row level security;

drop policy if exists extracto_read on public.extracto_lineas_pendientes;
create policy extracto_read on public.extracto_lineas_pendientes
  for select using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
      and ua.rol in ('super_admin','gerente','tesoreria','administrativo','auditor'))
  );

drop policy if exists extracto_write on public.extracto_lineas_pendientes;
create policy extracto_write on public.extracto_lineas_pendientes
  for all using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
      and ua.rol in ('super_admin','gerente','tesoreria'))
  );
