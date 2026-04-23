-- =====================================================================
-- Admin Hub · schema inicial
-- Crea el esquema de administración compartida (proveedores, facturas,
-- pagos, recepciones, sucursales, roles admin, auditoría, notificaciones).
--
-- Principios:
--   - Sólo CREATE. No se modifica ni elimina ninguna tabla existente.
--   - Los roles del Admin Hub son independientes de `users_pedidos`.
--     Un mismo `auth.users.id` puede tener fila en ambas: cada app
--     consulta la suya.
--   - RLS activo en toda tabla con datos de dominio.
--   - Naming: snake_case. Enums en singular sin prefijo de tabla.
--   - Reutilizamos el trigger existente `public.tg_set_updated_at()`
--     para mantener `updated_at`.
--   - FKs a `auth.users(id)` con ON DELETE SET NULL para preservar
--     la auditoría si un usuario se elimina.
--   - FKs a `orders(id)` (la tabla existente, no se llama "pedidos").
--
-- NO EJECUTAR TODAVÍA. Revisar, discutir con los dueños de la
-- cuponera y aplicar en una ventana coordinada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'condicion_iva') then
    create type condicion_iva as enum (
      'responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'contacto_rol') then
    create type contacto_rol as enum (
      'vendedor', 'cobranzas', 'logistica', 'gerencia', 'otro'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_cuenta_bancaria') then
    create type tipo_cuenta_bancaria as enum ('caja_ahorro', 'cuenta_corriente');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'proveedor_documento_tipo') then
    create type proveedor_documento_tipo as enum (
      'constancia_cuit', 'certificado_iibb', 'convenio', 'lista_precios', 'otro'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_factura') then
    create type tipo_factura as enum ('A', 'B', 'C', 'M');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'factura_estado') then
    create type factura_estado as enum (
      'borrador', 'pendiente_aprobacion', 'aprobada',
      'programada_pago', 'pagada_parcial', 'pagada',
      'vencida', 'rechazada', 'anulada'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'metodo_pago') then
    create type metodo_pago as enum (
      'transferencia', 'cheque', 'echeq', 'efectivo', 'tarjeta', 'otro'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pago_estado') then
    create type pago_estado as enum (
      'solicitado', 'aprobado', 'ejecutado', 'conciliado', 'anulado'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'recepcion_estado') then
    create type recepcion_estado as enum (
      'completa', 'parcial', 'con_diferencias', 'rechazada'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'admin_role') then
    create type admin_role as enum (
      'super_admin', 'gerente', 'comprador',
      'administrativo', 'tesoreria', 'auditor', 'sucursal'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'notificacion_tipo') then
    create type notificacion_tipo as enum ('alerta', 'tarea', 'info', 'aprobacion');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'notificacion_prioridad') then
    create type notificacion_prioridad as enum ('baja', 'media', 'alta', 'critica');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- HELPER DE PERMISOS · current_admin_role()
-- Equivalente a `current_pedidos_role()` pero para el Admin Hub.
-- SECURITY DEFINER para no entrar en recursión con las policies RLS
-- que a su vez consulten la tabla users_admin.
-- ---------------------------------------------------------------------
create table if not exists public.users_admin (
  id              uuid primary key references auth.users(id) on delete cascade,
  rol             admin_role not null,
  sucursal_id     uuid,  -- FK agregada abajo tras crear sucursales
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists users_admin_rol_idx on public.users_admin(rol);
create index if not exists users_admin_sucursal_idx on public.users_admin(sucursal_id);

create or replace function public.current_admin_role()
returns admin_role
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.users_admin where id = auth.uid() and activo = true
$$;

-- ---------------------------------------------------------------------
-- TABLA: sucursales
-- Debe crearse antes que users_admin.sucursal_id pueda referenciarla.
-- ---------------------------------------------------------------------
create table if not exists public.sucursales (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  codigo              text unique,
  direccion           text,
  localidad           text,
  provincia           text,
  telefono            text,
  email               text,
  horario_atencion    jsonb,
  latitud             numeric(10, 7),
  longitud            numeric(10, 7),
  responsable_id      uuid references auth.users(id) on delete set null,
  activa              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists sucursales_activa_idx on public.sucursales(activa);
create index if not exists sucursales_responsable_idx on public.sucursales(responsable_id);

-- Ahora que sucursales existe, agregamos la FK en users_admin
alter table public.users_admin
  drop constraint if exists users_admin_sucursal_fk;
alter table public.users_admin
  add constraint users_admin_sucursal_fk
  foreign key (sucursal_id) references public.sucursales(id) on delete set null;

-- ---------------------------------------------------------------------
-- TABLA: proveedores
-- ---------------------------------------------------------------------
create table if not exists public.proveedores (
  id                          uuid primary key default gen_random_uuid(),
  razon_social                text not null,
  nombre_comercial            text,
  cuit                        text not null unique,
  condicion_iva               condicion_iva,
  categoria                   text,
  domicilio_fiscal            text,
  localidad                   text,
  provincia                   text,
  codigo_postal               text,
  email_general               text,
  telefono_general            text,
  sitio_web                   text,
  logo_url                    text,
  plazo_pago_dias             integer not null default 30,
  descuento_pronto_pago_pct   numeric(5, 2) not null default 0,
  minimo_compra               numeric(14, 2) not null default 0,
  frecuencia_visita_dias      integer,
  activo                      boolean not null default true,
  calificacion_interna        smallint check (calificacion_interna is null or calificacion_interna between 1 and 5),
  notas                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id) on delete set null
);

create index if not exists proveedores_activo_idx on public.proveedores(activo);
create index if not exists proveedores_razon_social_idx on public.proveedores ((lower(razon_social)));
create index if not exists proveedores_categoria_idx on public.proveedores(categoria);

-- ---------------------------------------------------------------------
-- TABLA: proveedor_contactos
-- ---------------------------------------------------------------------
create table if not exists public.proveedor_contactos (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedores(id) on delete cascade,
  nombre        text,
  rol           contacto_rol,
  telefono      text,
  email         text,
  whatsapp      text,
  es_principal  boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists proveedor_contactos_proveedor_idx
  on public.proveedor_contactos(proveedor_id);

-- ---------------------------------------------------------------------
-- TABLA: proveedor_cuentas_bancarias
-- ---------------------------------------------------------------------
create table if not exists public.proveedor_cuentas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedores(id) on delete cascade,
  banco         text,
  tipo_cuenta   tipo_cuenta_bancaria,
  cbu           text,
  alias         text,
  titular       text,
  cuit_titular  text,
  es_principal  boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists proveedor_cuentas_proveedor_idx
  on public.proveedor_cuentas_bancarias(proveedor_id);

-- ---------------------------------------------------------------------
-- TABLA: proveedor_documentos
-- ---------------------------------------------------------------------
create table if not exists public.proveedor_documentos (
  id                 uuid primary key default gen_random_uuid(),
  proveedor_id       uuid not null references public.proveedores(id) on delete cascade,
  tipo               proveedor_documento_tipo not null,
  nombre             text,
  archivo_url        text,
  fecha_vencimiento  date,
  created_at         timestamptz not null default now(),
  uploaded_by        uuid references auth.users(id) on delete set null
);

create index if not exists proveedor_documentos_proveedor_idx
  on public.proveedor_documentos(proveedor_id);
create index if not exists proveedor_documentos_vencimiento_idx
  on public.proveedor_documentos(fecha_vencimiento)
  where fecha_vencimiento is not null;

-- ---------------------------------------------------------------------
-- TABLA: facturas_proveedor
-- NOTA: `order_id` referencia `orders(id)` — la tabla de pedidos se
-- llama en inglés en este repo. Se usa NULLABLE porque una factura
-- puede no estar vinculada a una orden concreta (compra mayorista).
-- ---------------------------------------------------------------------
create table if not exists public.facturas_proveedor (
  id                  uuid primary key default gen_random_uuid(),
  proveedor_id        uuid not null references public.proveedores(id) on delete restrict,
  order_id            uuid references public.orders(id) on delete set null,
  sucursal_id         uuid references public.sucursales(id) on delete set null,
  tipo_factura        tipo_factura not null,
  punto_venta         text not null,
  numero_factura      text not null,
  cae                 text,
  cae_vencimiento     date,
  fecha_emision       date not null,
  fecha_recepcion     date not null default current_date,
  fecha_vencimiento   date not null,
  subtotal            numeric(14, 2) not null,
  iva_21              numeric(14, 2) not null default 0,
  iva_105             numeric(14, 2) not null default 0,
  iva_27              numeric(14, 2) not null default 0,
  percepciones        numeric(14, 2) not null default 0,
  retenciones         numeric(14, 2) not null default 0,
  total               numeric(14, 2) not null,
  moneda              text not null default 'ARS',
  estado              factura_estado not null default 'borrador',
  observaciones       text,
  archivo_pdf_url     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  approved_by         uuid references auth.users(id) on delete set null,
  constraint facturas_proveedor_unica
    unique (proveedor_id, tipo_factura, punto_venta, numero_factura)
);

create index if not exists facturas_proveedor_proveedor_idx
  on public.facturas_proveedor(proveedor_id);
create index if not exists facturas_proveedor_estado_idx
  on public.facturas_proveedor(estado);
create index if not exists facturas_proveedor_vencimiento_idx
  on public.facturas_proveedor(fecha_vencimiento);
create index if not exists facturas_proveedor_order_idx
  on public.facturas_proveedor(order_id)
  where order_id is not null;
create index if not exists facturas_proveedor_sucursal_idx
  on public.facturas_proveedor(sucursal_id)
  where sucursal_id is not null;

-- ---------------------------------------------------------------------
-- TABLA: factura_items
-- ---------------------------------------------------------------------
create table if not exists public.factura_items (
  id                uuid primary key default gen_random_uuid(),
  factura_id        uuid not null references public.facturas_proveedor(id) on delete cascade,
  descripcion       text not null,
  cantidad          numeric(14, 3) not null default 1,
  precio_unitario   numeric(14, 4) not null default 0,
  subtotal          numeric(14, 2) not null default 0,
  alicuota_iva      numeric(5, 2) not null default 21,
  created_at        timestamptz not null default now()
);

create index if not exists factura_items_factura_idx
  on public.factura_items(factura_id);

-- ---------------------------------------------------------------------
-- TABLA: pagos
-- `numero_orden_pago` se autogenera vía trigger (formato OP-YYYY-NNNN)
-- ---------------------------------------------------------------------
create sequence if not exists public.orden_pago_seq start 1;

create table if not exists public.pagos (
  id                       uuid primary key default gen_random_uuid(),
  proveedor_id             uuid not null references public.proveedores(id) on delete restrict,
  numero_orden_pago        text unique,
  fecha_pago               date not null,
  metodo_pago              metodo_pago not null,
  cuenta_bancaria_origen   text,
  monto_total              numeric(14, 2) not null,
  retenciones_aplicadas    numeric(14, 2) not null default 0,
  monto_neto               numeric(14, 2) not null,
  moneda                   text not null default 'ARS',
  estado                   pago_estado not null default 'solicitado',
  comprobante_url          text,
  observaciones            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  solicitado_por           uuid references auth.users(id) on delete set null,
  aprobado_por             uuid references auth.users(id) on delete set null,
  ejecutado_por            uuid references auth.users(id) on delete set null
);

create index if not exists pagos_proveedor_idx on public.pagos(proveedor_id);
create index if not exists pagos_estado_idx on public.pagos(estado);
create index if not exists pagos_fecha_pago_idx on public.pagos(fecha_pago);

-- Trigger para autonumerar el OP al crear
create or replace function public.tg_assign_orden_pago()
returns trigger language plpgsql as $$
declare
  v_year text := to_char(coalesce(new.fecha_pago, current_date), 'YYYY');
  v_seq  int  := nextval('public.orden_pago_seq');
begin
  if new.numero_orden_pago is null then
    new.numero_orden_pago := 'OP-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists pagos_assign_numero on public.pagos;
create trigger pagos_assign_numero
  before insert on public.pagos
  for each row execute function public.tg_assign_orden_pago();

-- ---------------------------------------------------------------------
-- TABLA: pago_facturas (N:M con montos aplicados)
-- Permite pagos parciales y pagos que cubran varias facturas.
-- ---------------------------------------------------------------------
create table if not exists public.pago_facturas (
  id              uuid primary key default gen_random_uuid(),
  pago_id         uuid not null references public.pagos(id) on delete cascade,
  factura_id      uuid not null references public.facturas_proveedor(id) on delete restrict,
  monto_aplicado  numeric(14, 2) not null check (monto_aplicado > 0),
  created_at      timestamptz not null default now(),
  unique (pago_id, factura_id)
);

create index if not exists pago_facturas_pago_idx on public.pago_facturas(pago_id);
create index if not exists pago_facturas_factura_idx on public.pago_facturas(factura_id);

-- ---------------------------------------------------------------------
-- TABLA: recepciones_mercaderia
-- ---------------------------------------------------------------------
create table if not exists public.recepciones_mercaderia (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid references public.orders(id) on delete set null,
  sucursal_id       uuid references public.sucursales(id) on delete set null,
  numero_remito     text,
  fecha_recepcion   timestamptz not null default now(),
  estado            recepcion_estado not null default 'completa',
  observaciones     text,
  recibido_por      uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists recepciones_order_idx on public.recepciones_mercaderia(order_id);
create index if not exists recepciones_sucursal_idx on public.recepciones_mercaderia(sucursal_id);
create index if not exists recepciones_estado_idx on public.recepciones_mercaderia(estado);

-- ---------------------------------------------------------------------
-- TABLA: recepcion_items
-- Nota: no existe aún tabla `productos` en el repo; dejamos
-- `producto_id` como uuid genérico nullable para vincular en el futuro.
-- ---------------------------------------------------------------------
create table if not exists public.recepcion_items (
  id                          uuid primary key default gen_random_uuid(),
  recepcion_id                uuid not null references public.recepciones_mercaderia(id) on delete cascade,
  producto_id                 uuid,
  descripcion                 text,
  cantidad_pedida             numeric(14, 3),
  cantidad_recibida           numeric(14, 3),
  cantidad_danada             numeric(14, 3) not null default 0,
  fecha_vencimiento_producto  date,
  observaciones               text,
  foto_url                    text,
  created_at                  timestamptz not null default now()
);

create index if not exists recepcion_items_recepcion_idx on public.recepcion_items(recepcion_id);

-- ---------------------------------------------------------------------
-- TABLA: auditoria_logs
-- Genérica. `entidad` es un string libre para soportar nuevas áreas
-- sin migrar. Guardamos snapshot antes/después en jsonb.
-- ---------------------------------------------------------------------
create table if not exists public.auditoria_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  accion            text not null,
  entidad           text not null,
  entidad_id        uuid,
  datos_anteriores  jsonb,
  datos_nuevos      jsonb,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create index if not exists auditoria_logs_user_idx on public.auditoria_logs(user_id);
create index if not exists auditoria_logs_entidad_idx
  on public.auditoria_logs(entidad, entidad_id);
create index if not exists auditoria_logs_created_at_idx
  on public.auditoria_logs(created_at desc);

-- ---------------------------------------------------------------------
-- TABLA: notificaciones_admin
-- ---------------------------------------------------------------------
create table if not exists public.notificaciones_admin (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade,
  rol_destinatario      admin_role,
  tipo                  notificacion_tipo not null default 'info',
  titulo                text not null,
  mensaje               text,
  entidad_relacionada   text,
  entidad_id            uuid,
  leida                 boolean not null default false,
  url_accion            text,
  prioridad             notificacion_prioridad not null default 'media',
  created_at            timestamptz not null default now(),
  read_at               timestamptz,
  constraint notificaciones_destinatario_valido
    check (user_id is not null or rol_destinatario is not null)
);

create index if not exists notificaciones_user_no_leidas_idx
  on public.notificaciones_admin(user_id, created_at desc)
  where leida = false;
create index if not exists notificaciones_rol_idx
  on public.notificaciones_admin(rol_destinatario)
  where rol_destinatario is not null;

-- ---------------------------------------------------------------------
-- TRIGGERS updated_at (reusa función existente public.tg_set_updated_at)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'users_admin', 'sucursales', 'proveedores',
    'facturas_proveedor', 'pagos'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.tg_set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Política base: sólo usuarios con fila activa en users_admin pueden
-- leer/modificar. Los roles concretos definen qué pueden hacer; para
-- MVP abrimos read a todos los admin activos y write sólo a los roles
-- operativos (no 'auditor', no 'sucursal' salvo para su sucursal).
-- Refinar por área en migraciones siguientes.
-- ---------------------------------------------------------------------
alter table public.users_admin              enable row level security;
alter table public.sucursales               enable row level security;
alter table public.proveedores              enable row level security;
alter table public.proveedor_contactos      enable row level security;
alter table public.proveedor_cuentas_bancarias enable row level security;
alter table public.proveedor_documentos     enable row level security;
alter table public.facturas_proveedor       enable row level security;
alter table public.factura_items            enable row level security;
alter table public.pagos                    enable row level security;
alter table public.pago_facturas            enable row level security;
alter table public.recepciones_mercaderia   enable row level security;
alter table public.recepcion_items          enable row level security;
alter table public.auditoria_logs           enable row level security;
alter table public.notificaciones_admin     enable row level security;

-- users_admin: el propio usuario puede leerse, super_admin/gerente pueden leer y modificar todos
drop policy if exists users_admin_self_read on public.users_admin;
create policy users_admin_self_read on public.users_admin
  for select using (
    id = auth.uid()
    or public.current_admin_role() in ('super_admin', 'gerente')
  );

drop policy if exists users_admin_manage on public.users_admin;
create policy users_admin_manage on public.users_admin
  for all using (public.current_admin_role() in ('super_admin', 'gerente'))
           with check (public.current_admin_role() in ('super_admin', 'gerente'));

-- Helper macro: read permissive para cualquier admin activo
--                 write para operativos (no auditor)
--
-- Sucursales
drop policy if exists sucursales_read on public.sucursales;
create policy sucursales_read on public.sucursales
  for select using (public.current_admin_role() is not null);

drop policy if exists sucursales_write on public.sucursales;
create policy sucursales_write on public.sucursales
  for all using (public.current_admin_role() in ('super_admin', 'gerente'))
           with check (public.current_admin_role() in ('super_admin', 'gerente'));

-- Proveedores + anexos (contactos, cuentas, documentos)
drop policy if exists proveedores_read on public.proveedores;
create policy proveedores_read on public.proveedores
  for select using (public.current_admin_role() is not null);

drop policy if exists proveedores_write on public.proveedores;
create policy proveedores_write on public.proveedores
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'comprador', 'administrativo'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'comprador', 'administrativo'));

drop policy if exists proveedor_contactos_read on public.proveedor_contactos;
create policy proveedor_contactos_read on public.proveedor_contactos
  for select using (public.current_admin_role() is not null);
drop policy if exists proveedor_contactos_write on public.proveedor_contactos;
create policy proveedor_contactos_write on public.proveedor_contactos
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'comprador', 'administrativo'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'comprador', 'administrativo'));

drop policy if exists proveedor_cuentas_read on public.proveedor_cuentas_bancarias;
create policy proveedor_cuentas_read on public.proveedor_cuentas_bancarias
  for select using (public.current_admin_role() is not null);
drop policy if exists proveedor_cuentas_write on public.proveedor_cuentas_bancarias;
create policy proveedor_cuentas_write on public.proveedor_cuentas_bancarias
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'tesoreria', 'administrativo'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'tesoreria', 'administrativo'));

drop policy if exists proveedor_documentos_read on public.proveedor_documentos;
create policy proveedor_documentos_read on public.proveedor_documentos
  for select using (public.current_admin_role() is not null);
drop policy if exists proveedor_documentos_write on public.proveedor_documentos;
create policy proveedor_documentos_write on public.proveedor_documentos
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'comprador', 'administrativo'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'comprador', 'administrativo'));

-- Facturas y factura_items
drop policy if exists facturas_read on public.facturas_proveedor;
create policy facturas_read on public.facturas_proveedor
  for select using (public.current_admin_role() is not null);
drop policy if exists facturas_write on public.facturas_proveedor;
create policy facturas_write on public.facturas_proveedor
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'tesoreria'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'tesoreria'));

drop policy if exists factura_items_read on public.factura_items;
create policy factura_items_read on public.factura_items
  for select using (public.current_admin_role() is not null);
drop policy if exists factura_items_write on public.factura_items;
create policy factura_items_write on public.factura_items
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'tesoreria'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'tesoreria'));

-- Pagos y pago_facturas: write solo tesoreria/gerente/super_admin
drop policy if exists pagos_read on public.pagos;
create policy pagos_read on public.pagos
  for select using (public.current_admin_role() is not null);
drop policy if exists pagos_write on public.pagos;
create policy pagos_write on public.pagos
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'tesoreria'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'tesoreria'));

drop policy if exists pago_facturas_read on public.pago_facturas;
create policy pago_facturas_read on public.pago_facturas
  for select using (public.current_admin_role() is not null);
drop policy if exists pago_facturas_write on public.pago_facturas;
create policy pago_facturas_write on public.pago_facturas
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'tesoreria'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'tesoreria'));

-- Recepciones: write para sucursal + gerente + super_admin + administrativo
drop policy if exists recepciones_read on public.recepciones_mercaderia;
create policy recepciones_read on public.recepciones_mercaderia
  for select using (public.current_admin_role() is not null);
drop policy if exists recepciones_write on public.recepciones_mercaderia;
create policy recepciones_write on public.recepciones_mercaderia
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'sucursal'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'sucursal'));

drop policy if exists recepcion_items_read on public.recepcion_items;
create policy recepcion_items_read on public.recepcion_items
  for select using (public.current_admin_role() is not null);
drop policy if exists recepcion_items_write on public.recepcion_items;
create policy recepcion_items_write on public.recepcion_items
  for all using (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'sucursal'))
           with check (public.current_admin_role() in ('super_admin', 'gerente', 'administrativo', 'sucursal'));

-- Auditoría: read para auditor + super_admin + gerente; insert para todos los admin activos (los registros los genera la app).
drop policy if exists auditoria_read on public.auditoria_logs;
create policy auditoria_read on public.auditoria_logs
  for select using (public.current_admin_role() in ('super_admin', 'gerente', 'auditor'));

drop policy if exists auditoria_insert on public.auditoria_logs;
create policy auditoria_insert on public.auditoria_logs
  for insert with check (public.current_admin_role() is not null);

-- Notificaciones: un user ve las suyas (user_id = auth.uid) y las de su rol.
drop policy if exists notificaciones_read on public.notificaciones_admin;
create policy notificaciones_read on public.notificaciones_admin
  for select using (
    user_id = auth.uid()
    or rol_destinatario = public.current_admin_role()
    or public.current_admin_role() in ('super_admin', 'gerente')
  );

drop policy if exists notificaciones_update on public.notificaciones_admin;
create policy notificaciones_update on public.notificaciones_admin
  for update using (user_id = auth.uid())
             with check (user_id = auth.uid());

drop policy if exists notificaciones_insert on public.notificaciones_admin;
create policy notificaciones_insert on public.notificaciones_admin
  for insert with check (public.current_admin_role() is not null);

-- ---------------------------------------------------------------------
-- Bloqueo self-edit en users_admin (igual lógica que users_pedidos)
-- ---------------------------------------------------------------------
create or replace function public.tg_lock_self_admin_role()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and auth.uid() = new.id then
    if new.rol is distinct from old.rol then
      raise exception 'no_podes_cambiar_tu_propio_rol';
    end if;
    if new.activo is distinct from old.activo then
      raise exception 'no_podes_cambiar_tu_propio_estado';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_admin_lock_self on public.users_admin;
create trigger users_admin_lock_self
  before update on public.users_admin
  for each row execute function public.tg_lock_self_admin_role();
