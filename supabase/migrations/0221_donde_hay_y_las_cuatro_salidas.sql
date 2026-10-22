-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0221 · LO QUE NO HAY ACÁ                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Es el caso que más venta recupera: hoy la venta se pierde en el momento. El
-- cliente pregunta, no hay, se va, y nadie se enteró de nada.
--
-- Hay **5.594 productos con stock en más de una sucursal**: en la mayoría de
-- los casos el producto está a doce cuadras.
--
-- ── C.6 · LA LIMITACIÓN, DECLARADA ──────────────────────────────────────────
--
-- **El stock es una foto diaria de SIFACO.** La función devuelve `leido_at` de
-- cada sucursal, no un booleano: la pantalla dice «según el stock de hoy a las
-- 9» con la hora de verdad, y «de hace 3 días» cuando es de hace tres días.
--
-- Prometer que está es lo que hace que la próxima vez nadie le crea a la
-- pantalla, y una pantalla a la que no se le cree no se usa.

create or replace function public.mostrador_donde_hay(
  p_producto uuid,
  p_sucursal_actual uuid
)
returns table (
  sucursal_id uuid, sucursal text, codigo text, direccion text, telefono text,
  stock numeric, reservado numeric, disponible numeric,
  leido_at timestamptz, es_la_mia boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select
    s.id, s.nombre, s.codigo, s.direccion, s.telefono,
    coalesce(si.cantidad, 0),
    coalesce(rv.reservado, 0),
    greatest(coalesce(si.cantidad, 0) - coalesce(rv.reservado, 0), 0),
    ps.leido_at,
    (s.id = p_sucursal_actual)
  from sucursales s
  left join stock_items si on si.producto_id = p_producto and si.sucursal_id = s.id
  left join producto_stock_sifaco ps on ps.producto_id = p_producto and ps.sucursal_id = s.id
  left join lateral (
    select sum(r.cantidad) as reservado from reservas_stock r
     where r.producto_id = p_producto and r.sucursal_id = s.id
       and r.estado = 'activa' and (r.vence_at is null or r.vence_at > now())
  ) rv on true
  where s.activa and not s.es_ecommerce
  order by (s.id = p_sucursal_actual) desc,
           greatest(coalesce(si.cantidad, 0) - coalesce(rv.reservado, 0), 0) desc,
           s.codigo;
$$;

comment on function public.mostrador_donde_hay(uuid, uuid) is
  'C.1 · En que sucursal hay, cuantas y cuantas estan reservadas. Devuelve leido_at por sucursal: el stock es una foto diaria y la pantalla dice de cuando es la de cada local.';

-- ── C.2 · QUÉ SALIDAS ESTÁN DISPONIBLES DE VERDAD ───────────────────────────
--
-- Las cuatro del prompt, pero **una depende de algo que hoy no existe**: «lo
-- tengo a la tarde» necesita reparto entre sucursales, y `zonas_reparto`,
-- `viajes_reparto` y `turno_reparto` tienen cero filas.
--
-- Entonces esa salida no se ofrece, y se dice por qué. Ofrecer «lo tengo a la
-- tarde» sin que haya nadie que lo traiga a la tarde es prometerle algo a un
-- cliente que está esperando: se enteraría mañana.

create or replace function public.mostrador_salidas(p_sucursal uuid)
returns table (salida text, titulo text, disponible boolean, por_que_no text, que_hace text)
language sql stable security definer set search_path to 'public'
as $$
  with hay_reparto as (
    select exists (select 1 from zonas_reparto) as zonas,
           exists (select 1 from viajes_reparto where fecha >= current_date - 30) as viajes
  )
  select 'transferencia', 'Lo traigo para mañana', true, null::text,
         'Pide la transferencia a la sucursal que lo tiene y reserva la unidad alla'
  union all
  select 'reparto_hoy', 'Lo tengo a la tarde',
         (select zonas or viajes from hay_reparto),
         case when (select zonas or viajes from hay_reparto) then null
              else 'no hay reparto entre sucursales configurado: no hay zonas ni viajes cargados. Ofrecerlo seria prometerle a alguien que esta esperando algo que nadie va a traer' end,
         'Igual que la transferencia, pero marcada para el reparto del dia'
  union all
  select 'a_domicilio', 'Te lo mando a tu casa', true, null::text,
         'Arma un pedido con entrega por reparto propio y reserva la unidad'
  union all
  select 'retiro_otra', 'Pasa por la otra sucursal', true, null::text,
         'Arma un pedido para retirar en la sucursal que lo tiene, con la direccion';
$$;

comment on function public.mostrador_salidas(uuid) is
  'C.2 · Las cuatro salidas, con cual esta disponible de verdad. «Lo tengo a la tarde» necesita reparto entre sucursales y hoy hay cero zonas y cero viajes cargados: no se ofrece y se dice por que.';

revoke all on function public.mostrador_donde_hay(uuid, uuid) from public, anon;
revoke all on function public.mostrador_salidas(uuid) from public, anon;
grant execute on function public.mostrador_donde_hay(uuid, uuid) to authenticated, service_role;
grant execute on function public.mostrador_salidas(uuid) to authenticated, service_role;

-- NOTA · `mostrador_resolver_faltante` nació acá y quedó reescrita en 0222,
-- cuando apareció que una reserva por transferencia no tiene pedido.
