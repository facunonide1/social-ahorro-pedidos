-- 0179 · v0.93-proveedores · BLOQUE A
--
-- LA RECEPCIÓN DE MERCADERÍA.
--
-- ── EL CIRCUITO QUE REEMPLAZA ───────────────────────────────────────────────
--
-- Hoy: llega la mercadería → se sella → se controla y se ingresa a SIFACO →
-- **se sacan dos fotos y se mandan a un grupo de WhatsApp** → una vez por semana
-- alguien carga las facturas en un Excel → se paga.
--
-- Las dos fotos YA SE SACAN. El trabajo ya está hecho: lo único que cambia es a
-- dónde van. Esa sola cosa elimina el paso del Excel semanal y la semana de
-- demora entre que llega la mercadería y que se sabe cuánto se debe.
--
-- ── LO QUE LE FALTABA A `recepciones_mercaderia` ────────────────────────────
--
-- Existía atada a una orden de compra. Pero acá no hay orden de compra: se pide
-- por WhatsApp o por la web de la droguería, y la recepción empieza cuando el
-- camión llega. Sin `proveedor_id` propio, una recepción sin orden no tenía de
-- quién ser.

alter table recepciones_mercaderia add column if not exists proveedor_id uuid references proveedores(id);
alter table recepciones_mercaderia add column if not exists ingresado_a_sifaco boolean not null default false;
alter table recepciones_mercaderia add column if not exists sellado boolean not null default false;
alter table recepciones_mercaderia add column if not exists tarea_control_id uuid;

comment on column recepciones_mercaderia.proveedor_id is
  'De quién es la entrega. Directo, sin pasar por una orden de compra: el pedido se hace por WhatsApp o por la web de la droguería y acá no queda.';
comment on column recepciones_mercaderia.ingresado_a_sifaco is
  'Lo declara la persona que recibe, y la foto de la pantalla de SIFACO es la evidencia. NORA no escribe en SIFACO (regla de oro 1).';

create index if not exists recepciones_proveedor_idx on recepciones_mercaderia (proveedor_id, fecha_recepcion desc);

-- ── A.2 · LAS DOS FOTOS QUE YA SE SACAN ─────────────────────────────────────
--
-- Una recepción puede traer varias facturas y varios remitos. Y trae una foto
-- que NO se procesa: la pantalla de SIFACO, que es la prueba de que el ingreso
-- se hizo. Guardarla es el punto — hoy vive en un grupo de WhatsApp que nadie
-- consulta después.
do $$ begin
  create type recepcion_comprobante_rol as enum ('factura', 'remito', 'pantalla_sifaco', 'otro');
exception when duplicate_object then null; end $$;

create table if not exists recepcion_comprobantes (
  id            uuid primary key default gen_random_uuid(),
  recepcion_id  uuid not null references recepciones_mercaderia(id) on delete cascade,
  rol           recepcion_comprobante_rol not null,
  archivo_url   text,
  -- El motor de documentos (v0.55) lee la factura y extrae las líneas. La
  -- pantalla de SIFACO no pasa por acá: es un comprobante del paso, no un dato.
  extraccion_id uuid references doc_extracciones(id),
  documento_id  uuid references doc_documentos(id),
  numero_leido  text,
  total_leido   numeric,
  nota          text,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

create index if not exists recepcion_comprobantes_rec_idx on recepcion_comprobantes (recepcion_id);

comment on table recepcion_comprobantes is
  'Lo que vino con la entrega. La factura se procesa con el motor de documentos; la pantalla de SIFACO se guarda como evidencia y NO se procesa.';

-- ── A.3 · EL CONTROL DE LO RECIBIDO ─────────────────────────────────────────
--
-- Hoy el control es visual contra la factura, y lo que falta se anota en texto
-- libre: «FALTÓ UNA TIRA DE KETOROLAC». El seguimiento hasta la nota de crédito
-- es de memoria. 370 casos así en el archivo.
do $$ begin
  create type recepcion_item_estado as enum
    ('ok', 'falta', 'de_mas', 'danado', 'vence_corto', 'devolver');
exception when duplicate_object then null; end $$;

alter table recepcion_items add column if not exists doc_linea_id uuid references doc_lineas(id);
alter table recepcion_items add column if not exists cantidad_facturada numeric;
alter table recepcion_items add column if not exists estado recepcion_item_estado not null default 'ok';
alter table recepcion_items add column if not exists monto_reclamado numeric;
alter table recepcion_items add column if not exists nota_credito_id uuid references facturas_proveedor(id);
alter table recepcion_items add column if not exists resuelto_at timestamptz;
alter table recepcion_items add column if not exists resuelto_motivo text;

comment on column recepcion_items.estado is
  'Qué pasó con este renglón. Lo que no sea ok y tenga monto queda como pendiente con el proveedor hasta que llegue la nota de crédito.';
comment on column recepcion_items.nota_credito_id is
  'La nota de crédito que cerró el reclamo. Mientras sea null, el pendiente sigue abierto.';

create index if not exists recepcion_items_pendientes_idx on recepcion_items (recepcion_id)
  where estado <> 'ok' and nota_credito_id is null and resuelto_at is null;

-- ── LO QUE QUEDÓ PENDIENTE CON CADA PROVEEDOR ───────────────────────────────
create or replace view recepcion_pendientes as
  select ri.id,
         ri.recepcion_id,
         r.proveedor_id,
         p.razon_social as proveedor,
         r.sucursal_id,
         r.fecha_recepcion,
         ri.producto_id,
         coalesce(pc.nombre, ri.descripcion) as producto,
         pc.sku,
         ri.estado,
         ri.cantidad_facturada,
         ri.cantidad_recibida,
         ri.monto_reclamado,
         ri.observaciones,
         (current_date - r.fecha_recepcion::date) as dias_abierto
    from recepcion_items ri
    join recepciones_mercaderia r on r.id = ri.recepcion_id
    left join proveedores p on p.id = r.proveedor_id
    left join productos_catalogo pc on pc.id = ri.producto_id
   where ri.estado <> 'ok'
     and ri.nota_credito_id is null
     and ri.resuelto_at is null
     and not coalesce(r.es_demo, false);

alter view recepcion_pendientes set (security_invoker = true);

comment on view recepcion_pendientes is
  'Lo que faltó, vino dañado o hay que devolver, y todavía no tiene nota de crédito. Es el seguimiento que hoy es de memoria.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table recepcion_comprobantes enable row level security;

drop policy if exists recepcion_comprobantes_read on recepcion_comprobantes;
create policy recepcion_comprobantes_read on recepcion_comprobantes for select
  using (public.hub_rol_activo() is not null);

drop policy if exists recepcion_comprobantes_write on recepcion_comprobantes;
create policy recepcion_comprobantes_write on recepcion_comprobantes for all
  using (public.hub_rol_activo() = any (array['super_admin','gerente','comprador','administrativo','encargado_sucursal','sucursal']::admin_role[]))
  with check (public.hub_rol_activo() = any (array['super_admin','gerente','comprador','administrativo','encargado_sucursal','sucursal']::admin_role[]));
