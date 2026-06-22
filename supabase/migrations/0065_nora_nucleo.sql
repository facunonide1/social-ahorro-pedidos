-- ============================================================================
-- 0065 · NÚCLEO NORA UNIFICADO — 3 capas (explica / sugiere / hace)
-- ----------------------------------------------------------------------------
-- NORA presente en todo el sistema. Esta migración agrega:
--  - nora_acciones: auditoría de TODO lo que NORA hace (capa "hace").
--  - nora_config: qué acciones puede hacer SOLA vs requieren confirmación
--    (por defecto: todo pide confirmación; el dueño suelta de a poco).
--  - nora_avisos: feed unificado de sugerencias + avisos del auditor proactivo.
-- ============================================================================

do $$ begin create type public.nora_accion_estado as enum ('propuesta','ejecutada','revertida','rechazada'); exception when duplicate_object then null; end $$;
do $$ begin create type public.nora_aviso_tipo as enum ('caja_descuadre','cliente_vip_inactivo','stock_por_agotarse','oferta_por_vencer','documento_por_pagar','stock_dormido','cajero_descuadre','datos_sin_actualizar','sugerencia_compra','sugerencia_general'); exception when duplicate_object then null; end $$;
do $$ begin create type public.nora_aviso_severidad as enum ('info','sugerencia','alerta','critico'); exception when duplicate_object then null; end $$;

-- ===== Auditoría de acciones (capa "hace") =====
create table if not exists public.nora_acciones (
  id           uuid primary key default gen_random_uuid(),
  tool         text not null,                 -- nombre de la tool/acción
  descripcion  text not null,                 -- qué hizo, en lenguaje claro
  modulo       text,                          -- sector (compras/caja/clientes/...)
  parametros   jsonb not null default '{}',
  resultado    jsonb not null default '{}',
  reversible   boolean not null default false,
  estado       public.nora_accion_estado not null default 'ejecutada',
  -- para revertir: referencia a lo creado (tabla + id)
  revert_ref   jsonb,
  por_usuario  uuid references auth.users(id),
  por_usuario_nombre text,
  autonoma     boolean not null default false, -- la hizo NORA sola (sin confirmación)
  es_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  revertida_at timestamptz
);
create index if not exists nora_acciones_created_idx on public.nora_acciones(created_at desc);

-- ===== Config: qué puede hacer NORA sola =====
create table if not exists public.nora_config (
  id            uuid primary key default gen_random_uuid(),
  accion        text not null unique,          -- nombre de la acción/tool
  descripcion   text,
  -- 'confirmar' = pide OK del usuario · 'auto' = NORA la hace sola
  modo          text not null default 'confirmar',
  habilitada    boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ===== Feed de NORA (sugerencias + avisos del auditor) =====
create table if not exists public.nora_avisos (
  id           uuid primary key default gen_random_uuid(),
  tipo         public.nora_aviso_tipo not null,
  severidad    public.nora_aviso_severidad not null default 'sugerencia',
  titulo       text not null,
  detalle      text,
  modulo       text,
  sucursal_id  uuid references public.sucursales(id) on delete cascade,
  -- acción sugerida (link o tool a ejecutar)
  accion_label text,
  accion_href  text,
  accion_tool  text,
  accion_params jsonb,
  entidad_ref  jsonb,                          -- {tabla,id} de lo que disparó el aviso
  estado       text not null default 'pendiente', -- pendiente/aprobado/descartado/resuelto
  -- dedup: clave estable para no repetir el mismo aviso
  clave_dedup  text,
  es_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  resuelto_at  timestamptz
);
create index if not exists nora_avisos_estado_idx on public.nora_avisos(estado, created_at desc);
create unique index if not exists nora_avisos_dedup_idx on public.nora_avisos(clave_dedup) where estado = 'pendiente' and clave_dedup is not null;

-- ===== RLS (lectura: admin activo · escritura: super_admin/gerente) =====
do $$ declare t text; begin
  foreach t in array array['nora_acciones','nora_config','nora_avisos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente''))) with check (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'')))', t, t);
  end loop;
end $$;

-- Seed de config: las acciones reversibles arrancan en 'confirmar' (conservador)
insert into public.nora_config (accion, descripcion, modo, habilitada) values
  ('generar_csv_sifaco', 'Generar el CSV de ofertas/dif. de stock para SIFACO', 'confirmar', true),
  ('borrador_orden_compra', 'Armar un borrador de orden de compra con las recomendaciones', 'confirmar', true),
  ('borrador_campania', 'Armar un borrador de campaña para un segmento', 'confirmar', true),
  ('borrador_oferta', 'Armar un borrador de oferta', 'confirmar', true),
  ('crear_tarea', 'Crear una tarea', 'confirmar', true),
  ('reponer_gondola', 'Mover stock de depósito a góndola', 'confirmar', true)
on conflict (accion) do nothing;
