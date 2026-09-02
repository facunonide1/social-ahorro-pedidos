-- 0170 · v0.91-pedidos · BLOQUE C
--
-- RESERVAR EL STOCK ENTRE CANALES.
--
-- ── EL PROBLEMA ─────────────────────────────────────────────────────────────
--
-- El mostrador, la web y PedidosYa consumen el mismo stock sin saberlo. Entra un
-- pedido de la web por la última unidad, el operador la ve disponible, y la
-- misma unidad se promete dos veces.
--
-- ── LO QUE ESTO PROTEGE, Y LO QUE NO ────────────────────────────────────────
--
-- **Protege entre canales.** Una unidad reservada por un pedido de la web no
-- aparece disponible para un pedido de WhatsApp.
--
-- **NO protege contra el mostrador.** El stock que tiene NORA es la foto del
-- archivo diario de SIFACO. Entre archivo y archivo el mostrador vende y NORA no
-- se entera. Simular que esto está resuelto sería peor que no tenerlo: alguien
-- confiaría en el número.
--
-- **Y es sobre el total, no sobre la sucursal.** El stock de NORA es el
-- consolidado de las cuatro: falta el archivo `tabla3e` completo. Entonces una
-- reserva puede estar bloqueando algo que físicamente está en otro local. Queda
-- escrito acá y dicho en la pantalla; se resuelve solo el día que llegue el
-- archivo por sucursal.

do $$ begin
  create type reserva_estado as enum ('activa', 'consumida', 'liberada', 'vencida');
exception when duplicate_object then null; end $$;

create table if not exists reservas_stock (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  producto_id  uuid not null references productos_catalogo(id),
  sku          text,
  cantidad     numeric not null check (cantidad > 0),
  -- Informativa: de qué sucursal DICE que sale el pedido. La reserva pesa sobre
  -- el total igual, porque el stock no está abierto por local.
  sucursal_id  uuid references sucursales(id),
  estado       reserva_estado not null default 'activa',
  vence_at     timestamptz not null,
  motivo_cierre text,
  creada_por   uuid,
  created_at   timestamptz not null default now(),
  cerrada_at   timestamptz
);

create index if not exists reservas_stock_producto_idx on reservas_stock (producto_id) where estado = 'activa';
create index if not exists reservas_stock_order_idx on reservas_stock (order_id);
create index if not exists reservas_stock_vence_idx on reservas_stock (vence_at) where estado = 'activa';

comment on table reservas_stock is
  'Unidades bloqueadas por un pedido hasta que se despacha o se cancela. Protege ENTRE CANALES; no protege contra el mostrador.';
comment on column reservas_stock.vence_at is
  'Un pedido sin confirmar no bloquea stock para siempre. El plazo sale del contrato de parámetros (pedidos.horas_reserva).';

alter table reservas_stock enable row level security;

create policy reservas_stock_read on reservas_stock for select
  using (public.hub_rol_activo() is not null or public.current_pedidos_role() is not null);

create policy reservas_stock_write on reservas_stock for all
  using (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal','sucursal','cajero']::admin_role[]))
  with check (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal','sucursal','cajero']::admin_role[]));

-- ── LO QUE QUEDA DISPONIBLE ─────────────────────────────────────────────────
--
-- `stock` es lo que declara SIFACO. `reservado` es lo que ya está prometido.
-- `disponible` es la resta — y nunca baja de cero: un disponible negativo no
-- existe, significa que se prometió de más y eso hay que verlo como sobreventa,
-- no como un número raro.
create or replace view stock_disponible as
  select p.id as producto_id,
         p.sku,
         p.nombre,
         st.stock,
         coalesce(r.reservado, 0) as reservado,
         case when st.stock is null then null
              else greatest(st.stock - coalesce(r.reservado, 0), 0) end as disponible,
         case when st.stock is not null and coalesce(r.reservado, 0) > st.stock
              then coalesce(r.reservado, 0) - st.stock else 0 end as sobrevendido
    from productos_catalogo p
    left join lateral (
      select sum(s.stock) as stock from producto_stock_sifaco s where s.producto_id = p.id
    ) st on true
    left join lateral (
      select sum(rs.cantidad) as reservado
        from reservas_stock rs
       where rs.producto_id = p.id and rs.estado = 'activa'
    ) r on true
   where not p.es_demo;

alter view stock_disponible set (security_invoker = true);

comment on view stock_disponible is
  'Stock de SIFACO menos lo reservado por pedidos abiertos. El stock es una foto del archivo diario: entre archivo y archivo el mostrador vende y esto no se entera.';

-- ── LAS QUE SE PASARON DE PLAZO ─────────────────────────────────────────────
--
-- No se borran ni se marcan solas desde un trigger: se marcan cuando alguien
-- mira. Un `update` disparado por lectura sería una escritura invisible.
create or replace function reservas_vencer() returns integer
  language sql volatile security invoker set search_path to 'public'
as $$
  with v as (
    update reservas_stock
       set estado = 'vencida', cerrada_at = now(),
           motivo_cierre = 'venció el plazo sin que el pedido se despachara'
     where estado = 'activa' and vence_at < now()
    returning 1
  ) select count(*)::int from v;
$$;

comment on function reservas_vencer() is
  'Marca como vencidas las reservas que pasaron su plazo. Devuelve cuántas. Se llama desde la pantalla de reservas y desde el cron.';
