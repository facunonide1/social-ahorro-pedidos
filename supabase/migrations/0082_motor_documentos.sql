-- ============================================================================
-- 0082 · MOTOR DE DOCUMENTOS — esquema (v0.53)
-- ============================================================================
-- Motor genérico de captura de documentos comerciales. Vocabulario NEUTRO a
-- propósito: se reutiliza en otros rubros (gastronomía, obra, servicios).
--
--   tercero          = quien emite el documento   (aquí: proveedores)
--   item             = renglón del catálogo       (aquí: productos_catalogo)
--   unidad de negocio= quién compra               (aquí: sucursales)
--
-- El motor NO sabe qué es un psicotrópico, un lote, una ventana de devolución
-- ni una receta. Esa lógica se conecta ENCIMA, vía las FK opcionales.
--
-- REGLA DE ORO: acá se registra precio de COMPRA (costo). SIFACO sigue siendo
-- la autoridad del precio de VENTA. Este motor nunca lo escribe.
--
-- NUMERACIÓN: el prompt de la sesión pedía 0032. Ese número está ocupado desde
-- 2026-05 por 0032_inventario_cerrar.sql y el repo va por 0081. Se usa 0082.
-- ============================================================================

-- pg_trgm: ya instalada en el schema public de este proyecto. Idempotente.
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Tenant. Hoy hay un solo cliente y no hace falta multitenancy funcional, pero
-- la COLUMNA tiene que existir desde el día uno: agregarla después sobre 7
-- tablas con RLS ya escrita es inviable.
--
-- Esta función es el ÚNICO punto de cambio para volverse multitenant de verdad:
-- cuando exista tabla de tenants, se resuelve acá desde el JWT y ninguna
-- política necesita tocarse.
-- ----------------------------------------------------------------------------
create or replace function public.doc_tenant_actual()
returns uuid
language sql
stable
set search_path = ''
as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

comment on function public.doc_tenant_actual() is
  'Tenant del usuario actual. Hoy constante (Social Ahorro = tenant 1). Único punto a cambiar para multitenancy real.';

-- Trigger genérico de updated_at para las tablas doc_*.
create or replace function public.doc_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

-- ============================================================================
-- 1 · doc_documentos — un documento comercial recibido de un tercero
-- ============================================================================
create table if not exists public.doc_documentos (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  tipo                 text not null
                         check (tipo in ('factura','remito','nota_credito','nota_debito','presupuesto','orden')),
  estado               text not null default 'borrador'
                         check (estado in ('borrador','en_revision','confirmado','rechazado','anulado')),

  -- El tercero se identifica por CUIT, nunca por nombre. Se guarda además lo
  -- que se leyó en el papel, aunque no matchee: es la evidencia.
  tercero_id           uuid references public.proveedores(id) on delete set null,
  tercero_ident_fiscal text,
  tercero_nombre_leido text,

  numero               text,
  punto_venta          text,
  fecha_emision        date,
  fecha_vencimiento    date,

  -- Unidad de negocio COMPRADORA. Explícita siempre: tiene impacto fiscal.
  unidad_negocio_id    uuid references public.sucursales(id) on delete set null,

  moneda               text not null default 'ARS',
  subtotal             numeric(14,2),
  descuentos           numeric(14,2),
  impuestos            numeric(14,2),
  percepciones         numeric(14,2),
  total                numeric(14,2),
  observaciones        text,

  -- Nota de crédito → su factura.
  documento_padre_id   uuid references public.doc_documentos(id) on delete set null,

  confirmado_por       uuid references auth.users(id) on delete set null,
  confirmado_at        timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null
);

create index if not exists doc_documentos_tenant_idx        on public.doc_documentos(tenant_id);
create index if not exists doc_documentos_tercero_idx       on public.doc_documentos(tercero_id);
create index if not exists doc_documentos_estado_idx        on public.doc_documentos(estado);
create index if not exists doc_documentos_fecha_idx         on public.doc_documentos(fecha_emision desc);
create index if not exists doc_documentos_ident_num_idx     on public.doc_documentos(tercero_ident_fiscal, numero, punto_venta);
create index if not exists doc_documentos_unidad_idx        on public.doc_documentos(unidad_negocio_id);

-- Anti-duplicados: la misma factura confirmada no entra dos veces.
-- Va con coalesce() porque un UNIQUE común NO bloquea duplicados cuando hay
-- NULLs, y punto_venta/numero pueden venir vacíos de una lectura pobre.
create unique index if not exists doc_documentos_unico_confirmado_idx
  on public.doc_documentos (
    tenant_id,
    coalesce(tercero_ident_fiscal,''),
    tipo,
    coalesce(punto_venta,''),
    coalesce(numero,'')
  )
  where estado = 'confirmado';

drop trigger if exists doc_documentos_touch on public.doc_documentos;
create trigger doc_documentos_touch before update on public.doc_documentos
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- 2 · doc_lineas — cada renglón del documento
-- ============================================================================
create table if not exists public.doc_lineas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  documento_id        uuid not null references public.doc_documentos(id) on delete cascade,
  nro_linea           int not null,

  codigo_tercero      text,
  descripcion_leida   text not null,        -- tal cual figura en el papel

  cantidad            numeric(14,4),
  unidad              text,

  precio_unitario     numeric(14,4),        -- bruto de la línea
  descuento_pct       numeric(6,3),
  descuento_monto     numeric(14,2),

  -- Se guardan los DOS precios a propósito: no se puede reconstruir después
  -- (la alícuota puede faltar o venir mal leída) y todavía no está definido
  -- cuál se usa para comparar. Que el esquema no tome esa decisión por el negocio.
  precio_neto         numeric(14,4),        -- sin IVA
  alicuota_iva        numeric(5,2),
  precio_con_iva      numeric(14,4),

  total_linea         numeric(14,2),

  item_id             uuid references public.productos_catalogo(id) on delete set null,
  match_estado        text not null default 'pendiente'
                        check (match_estado in ('pendiente','automatico','manual','sin_match','ignorado')),
  match_confianza     numeric(4,3) check (match_confianza is null or (match_confianza >= 0 and match_confianza <= 1)),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,

  unique (documento_id, nro_linea)
);

create index if not exists doc_lineas_documento_idx on public.doc_lineas(documento_id);
create index if not exists doc_lineas_item_idx      on public.doc_lineas(item_id);
create index if not exists doc_lineas_match_idx     on public.doc_lineas(match_estado);
create index if not exists doc_lineas_tenant_idx    on public.doc_lineas(tenant_id);

drop trigger if exists doc_lineas_touch on public.doc_lineas;
create trigger doc_lineas_touch before update on public.doc_lineas
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- 3 · doc_extracciones — lo que devolvió el modelo, crudo. Una fila por intento.
-- ============================================================================
-- Existe para poder REPROCESAR lo ya cargado cuando el prompt mejore, sin
-- pedirle las fotos de nuevo a nadie. Y porque la imagen original es la prueba
-- ante el tercero.
create table if not exists public.doc_extracciones (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  documento_id        uuid references public.doc_documentos(id) on delete cascade,

  archivo_path        text not null,        -- bucket documentos-comerciales
  archivo_hash        text,                 -- anti-duplicados por imagen
  mime_type           text,

  modelo              text,                 -- qué modelo lo leyó
  prompt_version      text,                 -- versión del prompt usado
  respuesta_cruda     jsonb not null,       -- salida completa, sin recortar
  confianza_global    numeric(4,3),
  campos_dudosos      jsonb,                -- {campo: confianza}
  error               text,
  procesado_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

create index if not exists doc_extracciones_documento_idx on public.doc_extracciones(documento_id);
create index if not exists doc_extracciones_hash_idx      on public.doc_extracciones(tenant_id, archivo_hash) where archivo_hash is not null;
create index if not exists doc_extracciones_tenant_idx    on public.doc_extracciones(tenant_id);

drop trigger if exists doc_extracciones_touch on public.doc_extracciones;
create trigger doc_extracciones_touch before update on public.doc_extracciones
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- 4 · doc_terceros_alias — cómo se escribe el mismo tercero en distintos papeles
-- ============================================================================
-- El tercero se identifica por identificación fiscal, NUNCA por nombre. El
-- nombre cambia y se escribe distinto; el CUIT no. Si no hay CUIT legible o no
-- matchea, se pregunta — no se crea un tercero duplicado.
create table if not exists public.doc_terceros_alias (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  ident_fiscal        text not null,        -- la clave real
  nombre_variante     text not null,        -- razón social o fantasía leída
  tercero_id          uuid references public.proveedores(id) on delete set null,
  origen              text check (origen is null or origen in ('manual','automatico')),
  veces_visto         int not null default 1,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,

  unique (tenant_id, ident_fiscal, nombre_variante)
);

create index if not exists doc_terceros_alias_ident_idx   on public.doc_terceros_alias(tenant_id, ident_fiscal);
create index if not exists doc_terceros_alias_tercero_idx on public.doc_terceros_alias(tercero_id);

drop trigger if exists doc_terceros_alias_touch on public.doc_terceros_alias;
create trigger doc_terceros_alias_touch before update on public.doc_terceros_alias
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- 5 · doc_items_alias — EL ACTIVO DEL MOTOR
-- ============================================================================
-- Mapea cómo cada tercero nombra un item → item del catálogo propio.
-- El OCR es fácil; saber que "MUZZ. LA SERENISIMA 1KG" es el SKU 4471 no lo es.
-- Cada tercero lo escribe distinto. La primera vez se matchea a mano; a partir
-- de la tercera factura del mismo tercero reconoce casi todo solo.
-- Esta tabla es lo que hace que el motor mejore con el uso.
create table if not exists public.doc_items_alias (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  tercero_id          uuid references public.proveedores(id) on delete cascade,
  ident_fiscal        text,                 -- redundante a propósito: sobrevive
                                            -- al alta/baja del tercero
  codigo_tercero      text,
  descripcion_tercero text not null,
  descripcion_norm    text not null,        -- normalizada para búsqueda

  item_id             uuid not null references public.productos_catalogo(id) on delete cascade,
  origen              text not null default 'manual'
                        check (origen in ('manual','automatico','sugerido')),
  confianza           numeric(4,3),
  veces_usado         int not null default 1,
  ultima_vez          timestamptz,
  activo              boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

-- Un código de tercero mapea a un solo item.
create unique index if not exists doc_items_alias_codigo_idx
  on public.doc_items_alias(tenant_id, tercero_id, codigo_tercero)
  where codigo_tercero is not null;

create index if not exists doc_items_alias_norm_idx on public.doc_items_alias(tenant_id, tercero_id, descripcion_norm);
create index if not exists doc_items_alias_item_idx on public.doc_items_alias(item_id);

-- Búsqueda por similitud: es lo que resuelve el match cuando no hay código.
create index if not exists doc_items_alias_norm_trgm_idx
  on public.doc_items_alias using gin (descripcion_norm gin_trgm_ops);

drop trigger if exists doc_items_alias_touch on public.doc_items_alias;
create trigger doc_items_alias_touch before update on public.doc_items_alias
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- 6 · doc_precios_historial — el histórico como SERIE DE EVENTOS
-- ============================================================================
-- REGLA INNEGOCIABLE: no se guarda "último precio" pisando el anterior. Cada
-- compra es un evento. "Último precio de compra" es una CONSULTA sobre esta
-- tabla (ver doc_v_ultimo_precio), no una columna. Al revés se pierde la serie
-- — y la serie es todo lo que se quiere: variación, quién aumentó, cuándo, cuánto.
--
-- REGLA DE AUTORIDAD: el precio del histórico sale de la FACTURA. El remito
-- puede adelantarlo, pero si la factura dice otra cosa manda la factura y la
-- diferencia queda registrada en doc_conciliaciones.
create table if not exists public.doc_precios_historial (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  item_id             uuid not null references public.productos_catalogo(id) on delete cascade,
  tercero_id          uuid references public.proveedores(id) on delete set null,
  documento_id        uuid references public.doc_documentos(id) on delete set null,
  linea_id            uuid references public.doc_lineas(id) on delete set null,

  fecha               date not null,
  cantidad            numeric(14,4),
  unidad              text,

  precio_unitario     numeric(14,4) not null,   -- bruto
  precio_neto         numeric(14,4),            -- sin IVA
  precio_con_iva      numeric(14,4),
  descuento_pct       numeric(6,3),
  moneda              text not null default 'ARS',

  unidad_negocio_id   uuid references public.sucursales(id) on delete set null,
  origen              text not null
                        check (origen in ('factura','remito','lista_precios','manual','orden_compra')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

create index if not exists doc_precios_item_idx    on public.doc_precios_historial(tenant_id, item_id, fecha desc);
create index if not exists doc_precios_tercero_idx on public.doc_precios_historial(tenant_id, tercero_id, item_id, fecha desc);
create index if not exists doc_precios_doc_idx     on public.doc_precios_historial(documento_id);

drop trigger if exists doc_precios_historial_touch on public.doc_precios_historial;
create trigger doc_precios_historial_touch before update on public.doc_precios_historial
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- 7 · doc_conciliaciones — el cruce de tres puntas: orden ↔ remito ↔ factura
-- ============================================================================
-- Las tres diferencias que importan (van en el jsonb `diferencias`):
--   1. cantidad_faltante  → ordenaste 20, entregaron 18
--   2. facturado_de_mas   → entregaron 18, facturaron 20
--   3. precio_distinto    → pactado $1.200, facturado $1.340
-- La 2 y la 3 es plata que hoy nadie ve. La 3 es la más común y la más cara.
create table if not exists public.doc_conciliaciones (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,

  orden_id            uuid references public.ordenes_compra(id) on delete set null,
  remito_id           uuid references public.doc_documentos(id) on delete set null,
  factura_id          uuid references public.doc_documentos(id) on delete set null,

  estado              text not null default 'abierta'
                        check (estado in ('abierta','conciliada','con_diferencias','cerrada_manual')),
  diferencias         jsonb not null default '[]'::jsonb,
  monto_diferencia    numeric(14,2),

  resuelto_por        uuid references auth.users(id) on delete set null,
  resuelto_at         timestamptz,
  nota                text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

create index if not exists doc_conciliaciones_estado_idx  on public.doc_conciliaciones(estado);
create index if not exists doc_conciliaciones_orden_idx   on public.doc_conciliaciones(orden_id);
create index if not exists doc_conciliaciones_factura_idx on public.doc_conciliaciones(factura_id);
create index if not exists doc_conciliaciones_tenant_idx  on public.doc_conciliaciones(tenant_id);

drop trigger if exists doc_conciliaciones_touch on public.doc_conciliaciones;
create trigger doc_conciliaciones_touch before update on public.doc_conciliaciones
  for each row execute function public.doc_touch_updated_at();

-- ============================================================================
-- VISTA · doc_v_ultimo_precio
-- ============================================================================
-- Último precio por (item, tercero) con su variación contra el evento anterior.
-- Esto es lo que va a consumir el comparador multidroguería.
-- security_invoker = on: la vista respeta la RLS del que consulta, no la del
-- dueño. Sin esto el linter la marca como security_definer_view (ERROR).
drop view if exists public.doc_v_ultimo_precio;
create view public.doc_v_ultimo_precio
with (security_invoker = on) as
with ranked as (
  select
    h.tenant_id,
    h.item_id,
    h.tercero_id,
    h.fecha,
    h.precio_unitario,
    h.precio_neto,
    h.precio_con_iva,
    h.moneda,
    h.unidad_negocio_id,
    h.documento_id,
    h.origen,
    row_number() over w                as rn,
    -- order by fecha DESC ⇒ la fila siguiente es el evento ANTERIOR: lead(), no lag().
    lead(h.precio_unitario) over w     as precio_anterior,
    lead(h.fecha) over w               as fecha_anterior
  from public.doc_precios_historial h
  window w as (
    partition by h.tenant_id, h.item_id, h.tercero_id
    order by h.fecha desc, h.created_at desc
  )
)
select
  tenant_id,
  item_id,
  tercero_id,
  fecha,
  precio_unitario,
  precio_neto,
  precio_con_iva,
  moneda,
  unidad_negocio_id,
  documento_id,
  origen,
  precio_anterior,
  fecha_anterior,
  (precio_unitario - precio_anterior) as variacion_monto,
  case
    when precio_anterior is not null and precio_anterior <> 0
    then round(((precio_unitario - precio_anterior) / precio_anterior) * 100, 2)
  end                                  as variacion_pct
from ranked
where rn = 1;

comment on view public.doc_v_ultimo_precio is
  'Último precio de compra por item+tercero con variación contra el evento anterior. Fuente del comparador multidroguería.';

-- ============================================================================
-- RLS · todas las tablas doc_*, sin excepción
-- ============================================================================
-- Toda política filtra por tenant_id SIEMPRE, aunque hoy haya un solo tenant.
-- Ésta es la política que en multitenant separa un cliente de otro: escribirla
-- mal ahora es una fuga de datos después.
--
-- Patrón de roles copiado de ordenes_compra / precios_historico (sub-app Compras),
-- extendido con administrativo y tesoreria (Finanzas carga facturas y paga).
alter table public.doc_documentos        enable row level security;
alter table public.doc_lineas            enable row level security;
alter table public.doc_extracciones      enable row level security;
alter table public.doc_terceros_alias    enable row level security;
alter table public.doc_items_alias       enable row level security;
alter table public.doc_precios_historial enable row level security;
alter table public.doc_conciliaciones    enable row level security;

do $$
declare
  t text;
  tablas text[] := array[
    'doc_documentos','doc_lineas','doc_extracciones','doc_terceros_alias',
    'doc_items_alias','doc_precios_historial','doc_conciliaciones'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    -- SELECT: cualquier usuario admin activo del tenant.
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (
        tenant_id = public.doc_tenant_actual()
        and exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo)
      )$f$, t || '_select', t);

    -- INSERT: roles de Compras + Finanzas.
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (
        tenant_id = public.doc_tenant_actual()
        and exists (
          select 1 from public.users_admin ua
          where ua.id = auth.uid() and ua.activo
            and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])
        )
      )$f$, t || '_insert', t);

    -- UPDATE: idem. El tenant no se puede mover de fila (using + with check).
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (
        tenant_id = public.doc_tenant_actual()
        and exists (
          select 1 from public.users_admin ua
          where ua.id = auth.uid() and ua.activo
            and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])
        )
      )
      with check (
        tenant_id = public.doc_tenant_actual()
        and exists (
          select 1 from public.users_admin ua
          where ua.id = auth.uid() and ua.activo
            and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])
        )
      )$f$, t || '_update', t);

    -- DELETE: sólo super_admin. Se prefiere anulación lógica (estado='anulado').
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (
        tenant_id = public.doc_tenant_actual()
        and exists (
          select 1 from public.users_admin ua
          where ua.id = auth.uid() and ua.activo and ua.rol = 'super_admin'::admin_role
        )
      )$f$, t || '_delete', t);
  end loop;
end $$;

-- ============================================================================
-- STORAGE · bucket documentos-comerciales (privado)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('documentos-comerciales','documentos-comerciales',false)
on conflict (id) do nothing;

drop policy if exists doc_comerciales_select on storage.objects;
drop policy if exists doc_comerciales_insert on storage.objects;
drop policy if exists doc_comerciales_update on storage.objects;
drop policy if exists doc_comerciales_delete on storage.objects;

create policy doc_comerciales_select on storage.objects for select to authenticated
using (
  bucket_id = 'documentos-comerciales'
  and exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo)
);

create policy doc_comerciales_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'documentos-comerciales'
  and exists (
    select 1 from public.users_admin ua
    where ua.id = auth.uid() and ua.activo
      and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])
  )
);

create policy doc_comerciales_update on storage.objects for update to authenticated
using (
  bucket_id = 'documentos-comerciales'
  and exists (
    select 1 from public.users_admin ua
    where ua.id = auth.uid() and ua.activo
      and ua.rol = any (array['super_admin','gerente','comprador','administrativo','tesoreria']::admin_role[])
  )
);

-- La imagen original es la prueba ante el tercero: sólo super_admin la borra.
create policy doc_comerciales_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'documentos-comerciales'
  and exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo and ua.rol = 'super_admin'::admin_role)
);
