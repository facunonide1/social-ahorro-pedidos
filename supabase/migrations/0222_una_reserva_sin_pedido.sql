-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0222 · UNA RESERVA PUEDE NO TENER PEDIDO                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `reservas_stock.order_id` era NOT NULL desde la v0.170: todas las reservas
-- nacían de un pedido web, así que la suposición era cierta.
--
-- El mostrador la rompe. Cuando un cliente pide algo que no hay acá y se
-- resuelve con **«lo traigo de la otra sucursal»**, hay que apartar la unidad
-- allá para que no la vendan mientras viaja — y eso no es un pedido: es una
-- transferencia. El cliente se la lleva del mostrador cuando llega.
--
-- ── POR QUÉ NO SE GUARDÓ EN `motivo_cierre` ─────────────────────────────────
--
-- Porque esa columna dice por qué se **cerró** una reserva, y esta reserva
-- está abierta. Meter el id de la transferencia ahí habría funcionado y habría
-- dejado una columna que miente sobre lo que contiene, que es exactamente el
-- atajo que después nadie entiende.
--
-- ── Y LA REGLA NUEVA ────────────────────────────────────────────────────────
--
-- Una reserva tiene que tener un motivo: un pedido o una transferencia. Una
-- reserva sin ninguno de los dos es stock apartado que nadie va a liberar,
-- porque nadie sabe para quién era.

alter table public.reservas_stock alter column order_id drop not null;

alter table public.reservas_stock
  add column if not exists transferencia_id uuid
    references public.transferencias_sucursal(id) on delete set null;

create index if not exists reservas_stock_transf
  on public.reservas_stock (transferencia_id) where transferencia_id is not null;

alter table public.reservas_stock drop constraint if exists reservas_stock_tiene_motivo;
alter table public.reservas_stock
  add constraint reservas_stock_tiene_motivo
  check (order_id is not null or transferencia_id is not null);

comment on column public.reservas_stock.order_id is
  'El pedido que la genero. Null cuando la reserva viene de una transferencia pedida desde el mostrador: ahi el motivo es transferencia_id.';
comment on column public.reservas_stock.transferencia_id is
  'La transferencia que la genero. El mostrador reserva en la sucursal que tiene el producto para que no lo vendan mientras viaja.';
comment on constraint reservas_stock_tiene_motivo on public.reservas_stock is
  'Una reserva sin pedido ni transferencia es stock apartado que nadie va a liberar, porque nadie sabe para quien era.';

-- ── C.3 Y C.4 · SE CARGA AHÍ MISMO, Y RESERVA ───────────────────────────────
--
-- Una sola función para las cuatro salidas. Hace tres cosas en una
-- transacción, porque las tres juntas o ninguna:
--
--   1 · verifica que haya lo que se promete
--   2 · crea el pedido o la transferencia, según la salida
--   3 · reserva la unidad en la sucursal que la tiene, con vencimiento
--
-- El orden es ése porque la reserva necesita saber de qué es (la regla de
-- arriba). Si la reserva falla, la transacción revierte el pedido: lo que
-- garantiza que no quede un pedido prometiendo algo que no está es la
-- transacción, no el orden.
--
-- ── Y POR QUÉ NO VENDE ──────────────────────────────────────────────────────
--
-- Regla de oro 1: SIFACO es la autoridad de precio y facturación. Esto no
-- factura, no cobra y no mueve stock. Deja un pedido y una reserva: la venta
-- se hace en SIFACO cuando el producto llega.
--
-- ── TRES COSAS QUE SE APRENDIERON DEL ESQUEMA, NO DE LA MEMORIA ─────────────
--
--   · `orders.shipping_address` es jsonb con la forma de WooCommerce. La
--     dirección del mostrador se toma de viva voz: va en `address_1` y el
--     resto queda vacío — nadie le pregunta el código postal a alguien que
--     está esperando.
--   · `orders_origin_number_ck` exige `manual_order_number` para todo lo que
--     no venga de Woo. Se usa `siguiente_numero_manual()`, la misma que usa la
--     pantalla de pedidos: no se inventa una numeración paralela.
--   · `manual_order_number` es **integer**, no texto.

create or replace function public.mostrador_resolver_faltante(
  p_producto uuid, p_sucursal_pide uuid, p_sucursal_tiene uuid, p_salida text,
  p_cantidad numeric default 1, p_cliente_id uuid default null,
  p_cliente_nombre text default null, p_cliente_telefono text default null,
  p_direccion text default null, p_usuario uuid default null,
  -- Cuánto dura la reserva. 48 horas: una transferencia entre sucursales de
  -- Ituzaingó no tarda más, y una reserva eterna es stock congelado que nadie
  -- libera.
  p_horas_reserva integer default 48
)
returns jsonb
language plpgsql volatile security definer set search_path to 'public'
as $$
declare
  v_disponible numeric;
  v_reserva uuid; v_pedido uuid; v_transf uuid;
  v_prod record; v_tiene text; v_pide text; v_codigo text; v_num integer;
  v_reparto boolean;
  v_vence timestamptz := now() + make_interval(hours => p_horas_reserva);
begin
  if p_salida not in ('transferencia', 'reparto_hoy', 'a_domicilio', 'retiro_otra') then
    return jsonb_build_object('ok', false, 'motivo', 'salida desconocida: ' || p_salida);
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'la cantidad tiene que ser mayor a cero');
  end if;
  if p_sucursal_tiene = p_sucursal_pide then
    return jsonb_build_object('ok', false, 'motivo',
      'la sucursal que lo tiene y la que lo pide son la misma: si hay stock aca, no hace falta traerlo');
  end if;
  if p_salida = 'a_domicilio' and coalesce(btrim(p_direccion), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'para mandarlo a la casa hace falta la direccion');
  end if;

  select p.nombre, p.sku, coalesce(o.precio_con_descuento, p.precio_sugerido) as precio
    into v_prod from productos_catalogo p
    left join lateral (
      select precio_con_descuento from ofertas_sifaco of
       where of.producto_id = p.id and of.estado in ('vigente', 'sin_vencimiento')
       order by of.descuento_efectivo_pct desc nulls last limit 1) o on true
   where p.id = p_producto;
  if v_prod.sku is null then
    return jsonb_build_object('ok', false, 'motivo', 'el producto no existe');
  end if;

  select nombre into v_tiene from sucursales where id = p_sucursal_tiene;
  select nombre into v_pide from sucursales where id = p_sucursal_pide;

  if p_salida = 'reparto_hoy' then
    select exists (select 1 from zonas_reparto)
        or exists (select 1 from viajes_reparto where fecha >= current_date - 30) into v_reparto;
    if not v_reparto then
      return jsonb_build_object('ok', false, 'motivo',
        'no hay reparto entre sucursales configurado, asi que no se puede prometer para hoy. Lo que si se puede es pedirlo para mañana.');
    end if;
  end if;

  select greatest(coalesce(si.cantidad, 0) - coalesce(rv.reservado, 0), 0) into v_disponible
    from stock_items si
    left join lateral (
      select sum(r.cantidad) as reservado from reservas_stock r
       where r.producto_id = p_producto and r.sucursal_id = p_sucursal_tiene
         and r.estado = 'activa' and (r.vence_at is null or r.vence_at > now())) rv on true
   where si.producto_id = p_producto and si.sucursal_id = p_sucursal_tiene;

  if coalesce(v_disponible, 0) < p_cantidad then
    return jsonb_build_object('ok', false,
      'motivo', format('En %s quedan %s disponibles segun la ultima foto de SIFACO, y se piden %s. El stock es una foto diaria: puede que lo hayan vendido hoy.',
                       v_tiene, coalesce(v_disponible, 0), p_cantidad),
      'disponible', coalesce(v_disponible, 0));
  end if;

  if p_salida in ('transferencia', 'reparto_hoy') then
    insert into transferencias_sucursal (
      sucursal_origen_id, sucursal_destino_id, estado, solicitado_por, origen_pedido, notas
    ) values (
      p_sucursal_tiene, p_sucursal_pide, 'solicitada', p_usuario, 'pidio_la_sucursal',
      format('Mostrador de %s: un cliente pidio %s (%s) y no habia. %s',
             v_pide, v_prod.nombre, v_prod.sku,
             case when p_salida = 'reparto_hoy' then 'Para el reparto de hoy.' else 'Para mañana.' end)
    ) returning id into v_transf;
  else
    v_codigo := 'MOS-' || to_char(now(), 'YYMMDD-HH24MISS');
    v_num := siguiente_numero_manual();
    insert into orders (
      codigo, manual_order_number, status, origin, sucursal_id, cliente_id,
      customer_name, customer_phone, shipping_address,
      forma_entrega, tipo_envio, total, items, notes
    ) values (
      v_codigo, v_num, 'nuevo', 'mostrador',
      -- El pedido queda en la sucursal que TIENE el producto: es la que lo
      -- prepara. La que lo pidió queda en la nota.
      p_sucursal_tiene, p_cliente_id, p_cliente_nombre, p_cliente_telefono,
      case when p_salida = 'a_domicilio'
           then jsonb_build_object('address_1', btrim(p_direccion), 'city', 'Ituzaingo',
                                   'phone', coalesce(p_cliente_telefono, '')) end,
      case when p_salida = 'a_domicilio' then 'reparto_propio'::forma_entrega
           else 'retiro_local'::forma_entrega end,
      case when p_salida = 'a_domicilio' then 'programado'::tipo_envio
           else 'retiro'::tipo_envio end,
      coalesce(v_prod.precio, 0) * p_cantidad,
      jsonb_build_array(jsonb_build_object(
        'producto_id', p_producto, 'sku', v_prod.sku, 'nombre', v_prod.nombre,
        'cantidad', p_cantidad, 'precio', v_prod.precio)),
      format('Pedido tomado en el mostrador de %s. %s', v_pide,
             case when p_salida = 'a_domicilio' then 'Se envia al domicilio.'
                  else 'Retira en ' || v_tiene || '.' end)
    ) returning id into v_pedido;
  end if;

  insert into reservas_stock (
    producto_id, sku, cantidad, sucursal_id, estado, vence_at, creada_por, order_id, transferencia_id
  ) values (
    p_producto, v_prod.sku, p_cantidad, p_sucursal_tiene, 'activa', v_vence, p_usuario, v_pedido, v_transf
  ) returning id into v_reserva;

  return jsonb_build_object(
    'ok', true, 'salida', p_salida, 'reserva_id', v_reserva, 'reserva_vence_at', v_vence,
    'pedido_id', v_pedido, 'pedido_numero', v_num, 'transferencia_id', v_transf,
    'que_decirle',
    case p_salida
      when 'transferencia' then format('Lo traigo de %s para mañana. Queda reservado a tu nombre.', v_tiene)
      when 'reparto_hoy'   then format('Lo traigo de %s hoy a la tarde. Queda reservado.', v_tiene)
      when 'a_domicilio'   then 'Te lo mandamos a tu casa. Queda reservado.'
      else format('Pasa por %s%s. Queda reservado 48 horas.', v_tiene,
                  coalesce(' (' || (select direccion from sucursales where id = p_sucursal_tiene) || ')', ''))
    end,
    'ojo', 'El stock es una foto diaria de SIFACO. La reserva lo aparta en NORA, pero si el otro local lo vendio hoy y todavia no se leyo el maestro, puede no estar.'
  );
end $$;

comment on function public.mostrador_resolver_faltante(uuid, uuid, uuid, text, numeric, uuid, text, text, text, uuid, integer) is
  'C.3 y C.4 · Crea el pedido o la transferencia y reserva la unidad, en una transaccion. NO vende ni factura: SIFACO es la autoridad (regla de oro 1).';

-- Escribe, así que sólo por la ruta, que verifica el rol y la sucursal.
revoke all on function public.mostrador_resolver_faltante(uuid, uuid, uuid, text, numeric, uuid, text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.mostrador_resolver_faltante(uuid, uuid, uuid, text, numeric, uuid, text, text, text, uuid, integer) to service_role;
