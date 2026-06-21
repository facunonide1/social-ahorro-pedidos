-- ============================================================================
-- 0062 · FIX CAJA — arqueo manual al cierre (modelo real del negocio)
-- ----------------------------------------------------------------------------
-- La caja es DECLARATIVA MANUAL: el cajero carga los totales que le da SIFACO
-- (efectivo, Mercado Pago, tarjetas) al cerrar, sube la captura del arqueo y el
-- cierre debe cuadrar en $0. El efectivo (menos el fondo fijo) suma al
-- consolidado (caja_general) para pagos. NO se recalcula desde ventas.
--
-- Conserva el modelo multinivel: apertura por turno (caja_turnos, ya funciona) →
-- arqueo de cierre (arqueos_caja, nuevo) → consolidado (caja_general) → retiros
-- con aprobación (caja_general_movimientos, ya existe). No rompe nada.
-- ============================================================================

do $$ begin create type public.arqueo_estado as enum ('abierta','cerrada','observada'); exception when duplicate_object then null; end $$;

create table if not exists public.arqueos_caja (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null references public.sucursales(id) on delete cascade,
  caja_turno_id     uuid references public.caja_turnos(id) on delete set null,
  cajero_id         uuid references auth.users(id),
  cajero_nombre     text,
  fecha             date not null default current_date,
  inicio_caja       numeric(14,2) not null default 0,
  total_efectivo    numeric(14,2) not null default 0,
  total_mercadopago numeric(14,2) not null default 0,
  total_tarjetas    numeric(14,2) not null default 0,
  -- suma de los tres medios (lo que el cajero declara)
  total_declarado   numeric(14,2) generated always as (total_efectivo + total_mercadopago + total_tarjetas) stored,
  -- lo que SIFACO dice que debería haber (referencia para el cuadre). 0 = sin referencia.
  total_sistema     numeric(14,2) not null default 0,
  -- declarado − sistema. 0 = cuadra ✓
  diferencia_cierre numeric(14,2) not null default 0,
  -- efectivo que va al consolidado (total_efectivo − fondo fijo retenido)
  efectivo_a_general numeric(14,2) not null default 0,
  captura_url       text,                       -- imagen del arqueo SIFACO (bucket arqueos-caja)
  estado            public.arqueo_estado not null default 'cerrada',
  observacion       text,
  es_demo           boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists arqueos_caja_suc_fecha_idx on public.arqueos_caja(sucursal_id, fecha desc);
create index if not exists arqueos_caja_cajero_idx on public.arqueos_caja(cajero_id, fecha desc);
create index if not exists arqueos_caja_estado_idx on public.arqueos_caja(estado) where estado = 'observada';

-- ===== RLS (lectura: admin activo · escritura: roles de caja; la API usa service role) =====
alter table public.arqueos_caja enable row level security;
drop policy if exists arqueos_caja_read on public.arqueos_caja;
create policy arqueos_caja_read on public.arqueos_caja for select
  using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo));
drop policy if exists arqueos_caja_write on public.arqueos_caja;
create policy arqueos_caja_write on public.arqueos_caja for all
  using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
    and ua.rol in ('super_admin','gerente','tesoreria','encargado_sucursal','cajero','sucursal','administrativo')))
  with check (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
    and ua.rol in ('super_admin','gerente','tesoreria','encargado_sucursal','cajero','sucursal','administrativo')));

-- ===== Bucket para las capturas de arqueo (privado) =====
insert into storage.buckets (id, name, public)
values ('arqueos-caja', 'arqueos-caja', false)
on conflict (id) do nothing;

-- Storage policies: el usuario admin activo sube y lee las capturas de arqueo.
drop policy if exists "arqueos_caja_upload" on storage.objects;
create policy "arqueos_caja_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'arqueos-caja' and exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo));
drop policy if exists "arqueos_caja_view" on storage.objects;
create policy "arqueos_caja_view" on storage.objects for select to authenticated
  using (bucket_id = 'arqueos-caja' and exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo));
