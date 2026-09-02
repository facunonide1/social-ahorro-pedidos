-- 0165 · v0.91-pedidos · BLOQUE A
--
-- EL PEDIDO COMO OBJETO ÚNICO DE LOS CUATRO CANALES.
--
-- ── LO QUE YA HABÍA, Y SE EXTIENDE ──────────────────────────────────────────
--
-- `orders` ya existe con 21 pedidos reales, su historial de estados, sus
-- incidentes y sus mensajes. Tiene `origin`, y eso ya era la decisión correcta:
-- **el canal es un campo, no un módulo aparte**. Acá NO se construye un modelo
-- paralelo — se le agrega lo que le faltaba.
--
-- ── LO QUE LE FALTABA ───────────────────────────────────────────────────────
--
--   1. LA SUCURSAL. Es la regla de oro 8 y en envíos es estructural: todo envío
--      sale de una sucursal. `orders` no tenía dónde decirlo.
--   2. EL CLIENTE DEL CRM. Había `customer_id` -> `customers`, la tabla del CRM
--      viejo de pedidos. El sector Clientes vive en `clientes`, con dedup por
--      DNI, teléfono y mail. Un cliente que compra por tres canales es UN
--      cliente: `cliente_id` lo apunta ahí.
--   3. EL ID DEL PEDIDO EN EL CANAL. `woo_order_id` sólo servía para Woo.
--      PedidosYa —cuando entre— necesita el suyo.
--
-- ── LA SUCURSAL NO SE EXIGE CON UN CHECK, Y ES A PROPÓSITO ──────────────────
--
-- La pantalla de armado SÍ la exige (bloque B.5): sin sucursal no se confirma un
-- pedido a mano. Pero un webhook que llega de la tienda no puede rebotar por
-- eso: perder un pedido es peor que tenerlo sin asignar. Entran con la sucursal
-- de despacho del canal si está configurada, y si no, entran sin sucursal y
-- quedan a la vista en `pedidos_sin_sucursal`. Un pedido sin sucursal es un
-- trabajo pendiente, no un error que se tira.

-- ── EL ECOMMERCE ES UNA SUCURSAL MÁS ────────────────────────────────────────
--
-- Tiene su stock, su gente y sus pedidos. Si no es una sucursal, no se puede
-- comparar con las otras cuatro ni darle permisos a quien la atiende.
alter table sucursales add column if not exists es_ecommerce boolean not null default false;

insert into sucursales (nombre, codigo, localidad, provincia, activa, es_ecommerce)
select 'Ecommerce', 'SA-EC', 'Ituzaingó', 'Buenos Aires', true, true
where not exists (select 1 from sucursales where codigo = 'SA-EC');

comment on column sucursales.es_ecommerce is
  'La tienda como local: tiene stock, gente y pedidos propios. Se ve como una sucursal más en informes y permisos.';

-- ── EL PEDIDO ───────────────────────────────────────────────────────────────
alter table orders add column if not exists sucursal_id uuid references sucursales(id);
alter table orders add column if not exists cliente_id  uuid references clientes(id);
alter table orders add column if not exists canal_externo_id text;

comment on column orders.sucursal_id is
  'De qué sucursal sale. Se elige a mano o por regla de canal: NO se deduce del stock, porque el stock de NORA es el total de las cuatro sin apertura.';
comment on column orders.cliente_id is
  'El cliente del CRM (tabla clientes), deduplicado por DNI / teléfono / mail. customer_id apunta a la tabla vieja del CRM de pedidos.';
comment on column orders.canal_externo_id is
  'El id del pedido EN el canal, para los que no son Woo. PedidosYa todavía no entra por API: se carga a mano.';

create index if not exists orders_sucursal_idx on orders (sucursal_id);
create index if not exists orders_origin_status_idx on orders (origin, status);
create index if not exists orders_cliente_idx on orders (cliente_id) where cliente_id is not null;
create unique index if not exists orders_canal_externo_uq
  on orders (origin, canal_externo_id) where canal_externo_id is not null;

-- ── LOS QUE ENTRARON SIN SUCURSAL ───────────────────────────────────────────
create or replace view pedidos_sin_sucursal as
  select o.id, o.codigo, o.origin, o.status, o.total, o.created_at,
         o.customer_name, o.customer_phone
    from orders o
   where o.sucursal_id is null
     and o.status not in ('entregado', 'cancelado');

comment on view pedidos_sin_sucursal is
  'Pedidos que hay que asignar a una sucursal. No es un error: es trabajo pendiente. Los entregados y cancelados no cuentan — ya no hay nada que despachar.';

-- ── LOS CUATRO CANALES, EN UNA SOLA LECTURA ─────────────────────────────────
create or replace view pedidos_unificados as
  select o.id,
         o.codigo,
         o.origin                                as canal,
         o.status,
         o.tipo_envio,
         o.sucursal_id,
         s.nombre                                as sucursal,
         s.es_ecommerce,
         o.cliente_id,
         coalesce(c.nombre, o.customer_name)     as cliente,
         coalesce(c.telefono, o.customer_phone)  as telefono,
         coalesce(c.dni, o.customer_dni)         as dni,
         o.total,
         o.zona_id,
         o.assigned_to,
         o.created_at,
         o.confirmed_at,
         o.ready_at,
         o.delivered_at,
         jsonb_array_length(o.items)             as renglones
    from orders o
    left join sucursales s on s.id = o.sucursal_id
    left join clientes  c on c.id = o.cliente_id;

comment on view pedidos_unificados is
  'Un solo modelo para WhatsApp, tienda web, PedidosYa y mostrador. El canal es un campo (origin), no un módulo aparte.';

-- ── QUE LO VEAN LOS DEL HUB, NO SÓLO LOS DE users_pedidos ───────────────────
--
-- `orders` tenía RLS con políticas escritas SÓLO contra `users_pedidos`. La app
-- de pedidos ve todo; un usuario del hub —que es quien va a entrar por
-- /admin/pedidos— recibía cero filas sin ningún error. Es exactamente la tabla
-- ciega de docs/TABLAS-CIEGAS.md: el dato está y nadie lo ve.
create or replace function public.hub_rol_activo() returns admin_role
  language sql stable security definer set search_path to 'public'
as $$ select rol from public.users_admin where id = auth.uid() and activo $$;

comment on function public.hub_rol_activo() is
  'El rol del usuario del hub, o null si no tiene fila activa. Espejo de current_pedidos_role() para el otro padrón de usuarios.';

do $$
declare t text;
begin
  foreach t in array array['orders','order_status_history','order_incidents','whatsapp_messages','zonas_reparto']
  loop
    execute format('drop policy if exists %I on %I', t || '_hub_read', t);
    execute format($f$
      create policy %I on %I for select
      using (public.hub_rol_activo() is not null)
    $f$, t || '_hub_read', t);

    execute format('drop policy if exists %I on %I', t || '_hub_write', t);
    execute format($f$
      create policy %I on %I for all
      using (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal','sucursal','cajero']::admin_role[]))
      with check (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal','sucursal','cajero']::admin_role[]))
    $f$, t || '_hub_write', t);
  end loop;
end $$;

-- ── LAS VISTAS MIRAN CON LOS OJOS DE QUIEN CONSULTA ─────────────────────────
--
-- Una vista sin `security_invoker` corre con los permisos de su dueño y saltea
-- la RLS de `orders`. El linter lo marca como ERROR y tiene razón: sería una
-- puerta lateral a la tabla que acabamos de proteger.
alter view pedidos_sin_sucursal set (security_invoker = true);
alter view pedidos_unificados  set (security_invoker = true);
