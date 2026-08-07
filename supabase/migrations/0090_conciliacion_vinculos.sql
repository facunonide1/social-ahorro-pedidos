-- ============================================================================
-- 0090 · Vínculos de conciliación: muchos a muchos de verdad (v0.57)
-- ============================================================================
-- doc_conciliaciones nació en 0082 con orden_id, remito_id y factura_id: una
-- columna por documento, o sea uno a uno. La realidad de una compra no es esa:
--
--   · una orden se entrega en VARIOS remitos (entrega parcial)
--   · una factura cubre VARIOS remitos (facturación quincenal)
--   · un remito se factura en VARIAS facturas
--   · hay factura sin remito y remito sin factura
--   · un documento puede cubrir VARIAS órdenes
--
-- Con tres columnas singulares, todo eso o no entra o entra mal. Como la tabla
-- estaba vacía (0 filas, nunca se usó), se corrigen las columnas en vez de
-- arrastrar un modelo que no aguanta el caso real.
-- ============================================================================

alter table public.doc_conciliaciones
  drop column if exists orden_id,
  drop column if exists remito_id,
  drop column if exists factura_id;

alter table public.doc_conciliaciones
  -- Denormalizados a propósito: la bandeja filtra y agrupa por estos dos en
  -- cada consulta, y sacarlos por join de las puentes cuesta caro.
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null,
  add column if not exists sucursal_id uuid references public.sucursales(id) on delete set null,
  -- Cerrar a mano sin decir por qué es perder la razón para siempre.
  add column if not exists motivo_cierre text,
  add column if not exists evaluada_at timestamptz;

create index if not exists doc_conciliaciones_prov_idx on public.doc_conciliaciones(proveedor_id);
create index if not exists doc_conciliaciones_monto_idx on public.doc_conciliaciones(monto_diferencia desc nulls last);

comment on column public.doc_conciliaciones.motivo_cierre is
  'Obligatorio al cerrar a mano. Es lo que explica, seis meses después, por qué se dejó pasar una diferencia.';

-- ── Puentes ──────────────────────────────────────────────────────────────────

create table if not exists public.doc_conciliacion_ordenes (
  conciliacion_id uuid not null references public.doc_conciliaciones(id) on delete cascade,
  orden_id        uuid not null references public.ordenes_compra(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (conciliacion_id, orden_id)
);

create index if not exists doc_conc_ordenes_orden_idx on public.doc_conciliacion_ordenes(orden_id);

create table if not exists public.doc_conciliacion_documentos (
  conciliacion_id uuid not null references public.doc_conciliaciones(id) on delete cascade,
  documento_id    uuid not null references public.doc_documentos(id) on delete cascade,
  -- El rol lo fija quien vincula: un mismo tipo de papel puede cumplir
  -- funciones distintas según cómo trabaje el proveedor.
  rol             text not null check (rol in ('remito','factura','nota_credito')),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  primary key (conciliacion_id, documento_id)
);

create index if not exists doc_conc_docs_doc_idx on public.doc_conciliacion_documentos(documento_id);
create index if not exists doc_conc_docs_rol_idx on public.doc_conciliacion_documentos(conciliacion_id, rol);

-- ── Factores de conversión de unidad ────────────────────────────────────────
-- La orden puede estar en CAJAS y el remito en UNIDADES. Comparados sin
-- convertir, todo da diferencia y el módulo se vuelve ruido que nadie mira.
--
-- El factor NO se adivina: lo carga una persona la primera vez y queda
-- aprendido por producto y proveedor, porque la caja de un proveedor no tiene
-- por qué traer lo mismo que la del otro.
create table if not exists public.doc_factores_unidad (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  item_id          uuid not null references public.productos_catalogo(id) on delete cascade,
  tercero_id       uuid references public.proveedores(id) on delete cascade,
  /** Cómo lo nombra el papel: "caja", "bulto", "display". */
  unidad_documento text not null,
  /** Cuántas unidades de venta trae esa unidad del documento. */
  factor           numeric(14,4) not null check (factor > 0),
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null,
  unique (tenant_id, item_id, tercero_id, unidad_documento)
);

create index if not exists doc_factores_item_idx on public.doc_factores_unidad(tenant_id, item_id);

comment on table public.doc_factores_unidad is
  'Cuántas unidades trae una caja/bulto de este producto en este proveedor. Se carga a mano: adivinarlo desbalancea toda la conciliación.';

-- ── Vínculo con el módulo de reclamos que YA existe ──────────────────────────
-- Los reclamos de conciliación viven en devoluciones_proveedor, que ya tiene
-- estados, recordatorios y el flujo de nota de crédito. No se construye un
-- módulo paralelo.
alter table public.devoluciones_proveedor
  add column if not exists conciliacion_id uuid references public.doc_conciliaciones(id) on delete set null,
  add column if not exists monto_esperado numeric(14,2);

create index if not exists devoluciones_conciliacion_idx
  on public.devoluciones_proveedor(conciliacion_id) where conciliacion_id is not null;

comment on column public.devoluciones_proveedor.monto_esperado is
  'Plata que se espera recuperar. Permite cerrar el seguimiento cuando entra una nota de crédito por ese monto.';

-- ── RLS de las tablas nuevas ────────────────────────────────────────────────
alter table public.doc_conciliacion_ordenes    enable row level security;
alter table public.doc_conciliacion_documentos enable row level security;
alter table public.doc_factores_unidad         enable row level security;

do $$
declare
  t text;
  tablas text[] := array['doc_conciliacion_ordenes','doc_conciliacion_documentos','doc_factores_unidad'];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);

    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo))$f$, t || '_select', t);

    execute format($f$
      create policy %I on public.%I for all to authenticated
      using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
        and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])))
      with check (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
        and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])))$f$, t || '_write', t);
  end loop;
end $$;
