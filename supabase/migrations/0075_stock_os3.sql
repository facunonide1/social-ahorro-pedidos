-- 0075 · Stock OS-3 (cascada de vencimientos + recartelado)
--
-- Aditiva y re-runnable. La ventana de devolución vive en el proveedor (default
-- + granularidad por rubro). NO hay link fiable producto→proveedor en los datos
-- hoy, así que `vencimientos.proveedor_id` (nullable) permite fijarlo en la
-- carga/devolución; sin proveedor la ventana es DESCONOCIDA (no se inventa).

-- ============ ENUM (standalone: solo ADD VALUE, sin uso en esta tx) =========
alter type public.tipo_alerta_stock add value if not exists 'ventana_devolucion_por_cerrar';

-- ============ A · VENTANA DE DEVOLUCIÓN =====================================
alter table public.proveedores
  add column if not exists dias_ventana_devolucion int;

create table if not exists public.proveedor_devolucion_rubros (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedores(id) on delete cascade,
  rubro         text not null,
  dias_ventana  int not null,
  condicion     text,
  created_at    timestamptz not null default now(),
  unique (proveedor_id, rubro)
);

-- ============ vencimientos: proveedor opcional (para resolver la ventana) ====
alter table public.vencimientos
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

-- ============ C · DEVOLUCIONES A DROGUERÍA (por vencimiento) =================
-- Registro dedicado (NO toca `devoluciones_proveedor` de Compras, que es
-- header-only y se usa en otro flujo). El stock se descuenta al confirmarse la
-- tarea de preparación, no al crear la devolución.
create table if not exists public.devoluciones_drogueria (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid references public.proveedores(id) on delete set null,
  sucursal_id    uuid references public.sucursales(id) on delete set null,
  producto_id    uuid references public.productos_catalogo(id) on delete set null,
  sku            text,
  cantidad       numeric not null,
  costo_unitario numeric,
  motivo         text not null default 'vencimiento',
  estado         text not null default 'pendiente',      -- pendiente | enviada | acreditada | cancelada
  vencimiento_id uuid,                                     -- fuente manual (tabla vencimientos)
  lote_id        uuid references public.lotes_productos(id) on delete set null,
  tarea_id       uuid references public.tareas(id) on delete set null,
  stock_descontado boolean not null default false,
  fecha_limite   date,
  created_by     uuid references auth.users(id) on delete set null,
  es_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists devoluciones_drogueria_estado_idx on public.devoluciones_drogueria(estado);
create index if not exists devoluciones_drogueria_tarea_idx on public.devoluciones_drogueria(tarea_id);

drop trigger if exists devoluciones_drogueria_set_updated_at on public.devoluciones_drogueria;
create trigger devoluciones_drogueria_set_updated_at
  before update on public.devoluciones_drogueria
  for each row execute function public.tg_set_updated_at();

-- ============ E · TRANSFERENCIAS × TAREAS ===================================
alter table public.transferencias_sucursal
  add column if not exists tarea_verificacion_id uuid references public.tareas(id) on delete set null,
  add column if not exists verificacion_resuelta_por uuid references auth.users(id) on delete set null,
  add column if not exists verificacion_resuelta_at timestamptz;

-- ============ D · RECARTELADO ===============================================
create table if not exists public.listas_recartelado (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid references public.sucursales(id) on delete cascade,
  fecha          date not null,
  import_job_id  uuid,
  estado         text not null default 'pendiente',       -- pendiente | hecho
  tarea_id       uuid references public.tareas(id) on delete set null,
  es_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (sucursal_id, import_job_id)
);
create index if not exists listas_recartelado_fecha_idx on public.listas_recartelado(fecha);

create table if not exists public.recartelado_items (
  id           uuid primary key default gen_random_uuid(),
  lista_id     uuid not null references public.listas_recartelado(id) on delete cascade,
  producto_id  uuid references public.productos_catalogo(id) on delete set null,
  sku          text,
  nombre       text,
  precio_viejo numeric,
  precio_nuevo numeric,
  zona_id      uuid references public.zonas(id) on delete set null,
  estado       text not null default 'pendiente',         -- pendiente | hecho
  created_at   timestamptz not null default now()
);
create index if not exists recartelado_items_lista_idx on public.recartelado_items(lista_id);

-- ============ RLS ===========================================================
alter table public.proveedor_devolucion_rubros enable row level security;
alter table public.devoluciones_drogueria enable row level security;
alter table public.listas_recartelado enable row level security;
alter table public.recartelado_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['proveedor_devolucion_rubros','devoluciones_drogueria','listas_recartelado','recartelado_items'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''sucursal'',''encargado_sucursal'',''administrativo'',''comprador''))) with check (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''sucursal'',''encargado_sucursal'',''administrativo'',''comprador'')))', t, t);
  end loop;
end $$;
