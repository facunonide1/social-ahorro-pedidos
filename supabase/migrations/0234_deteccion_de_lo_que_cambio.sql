-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0234 · LO QUE CAMBIO                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Un negocio no se rompe de golpe. Se rompe de a poco y nadie se da cuenta
-- porque cada dia se parece al anterior.
--
-- Sigue valiendo la regla de B: **el hecho, nunca la causa.** Un producto que
-- dejo de venderse puede ser un competidor, un cambio de receta, un faltante
-- que nadie registro o una moda que paso. El sistema dice que paso de 40 a 0.
--
-- ── C.7 · LA HISTORIA MINIMA, PRIMERO ───────────────────────────────────────
--
-- Esto no es una formalidad. Medido hoy:
--
--   · ventas · 3 meses CERRADOS (07, 08, 09) y octubre entero marcado
--     `parcial`. Octubre no se usa para decidir que algo cambio: un mes a
--     medio cargar se ve igual que un mes que se cayo.
--   · compras · 9 meses de facturas reales (01 a 09), ~600 por mes.
--   · precios de compra por producto · `doc_precios_historial` tiene 0 filas.
--     Entonces C.3 puede decir que un proveedor factura distinto, pero NO
--     puede decir que subio el precio de un producto. Se dice.
--   · canales · 0 cargados, 21 pedidos de abril. C.5 no corre.
--   · clientes · 150, y los 150 son de demostracion. C.6 no corre, y esto
--     estaba pedido explicitamente.
--
-- ── EL MES CERRADO ──────────────────────────────────────────────────────────
--
-- Un solo lugar define cual es el ultimo mes comparable, para que los cuatro
-- detectores usen el mismo y no discutan entre ellos.

create or replace function public.deteccion_meses_cerrados()
returns table (periodo text, orden integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select periodo, row_number() over (order by periodo desc)::integer
    from (select distinct periodo from producto_ventas_sucursal
           where not parcial
             and periodo < to_char(current_date, 'YYYY-MM')) z
   order by periodo desc;
$$;

comment on function public.deteccion_meses_cerrados() is
  'Los meses de venta que se pueden comparar: ni parciales ni el mes en curso. '
  'Un mes a medio cargar se ve igual que un mes que se cayo.';

insert into public.detectores
  (clave, familia, nombre, que_detecta, que_no_dice, historia_minima, tope_diario, orden)
values
  ('dejo_de_venderse', 'cambio', 'Un producto que dejo de venderse',
   'Vendia parejo en los meses cerrados anteriores y el ultimo cerrado quedo en cero.',
   'No dice por que. Puede ser un competidor, un faltante que nadie registro, un cambio de marca o una moda que paso.',
   '3 meses cerrados de venta del mismo producto en la misma sucursal. Octubre esta parcial y no cuenta',
   5, 110),
  ('empezo_a_vender_mas', 'cambio', 'Un producto que acelero',
   'El ultimo mes cerrado vendio el doble o mas que el promedio de los anteriores.',
   'No dice que vaya a seguir. Dice que paso, y cuanto stock queda a ese ritmo.',
   '3 meses cerrados de venta del mismo producto en la misma sucursal',
   5, 120),
  ('proveedor_cambio', 'cambio', 'Un proveedor que cambio',
   'Factura distinto de lo que facturaba: dejo de facturar un mes que siempre facturaba, o el monto mensual se movio fuerte.',
   'NO dice que subio el precio de un producto: `doc_precios_historial` esta vacio, asi que no hay precios de compra por producto para comparar. Dice que el total mensual cambio.',
   '6 meses de facturas del mismo proveedor, de los cuales 4 con facturas',
   5, 130),
  ('sucursal_bajo', 'cambio', 'Una sucursal que bajo contra lo suyo',
   'Vendio menos que su propio promedio de los meses cerrados anteriores. Contra lo suyo, no contra las otras.',
   'No se compara con las otras sucursales a proposito: una sucursal chica siempre vende menos que una grande y eso no es una caida. Y es mensual, no por dia: las ventas de SIFACO vienen por mes.',
   '3 meses cerrados de venta de esa sucursal',
   4, 140),
  ('canal_cambio', 'cambio', 'Un canal que cambio',
   'Un canal que traia pedidos y dejo de traerlos, o al reves.',
   'Hoy no dice nada: no hay canales cargados.',
   'canales cargados y 2 meses de pedidos por canal',
   5, 150),
  ('cliente_no_volvio', 'cambio', 'Un cliente que no volvio',
   'Compraba seguido y hace meses que no aparece.',
   'Hoy no corre y no va a correr hasta que exista un padron de clientes real. Los 150 cargados son de demostracion: un detector corriendo sobre eso inventa 150 clientes perdidos que no existen.',
   'un padron de clientes real con historia de compras. Hoy hay 150 clientes y los 150 son demo',
   5, 160)
on conflict (clave) do update set
  familia = excluded.familia, nombre = excluded.nombre,
  que_detecta = excluded.que_detecta, que_no_dice = excluded.que_no_dice,
  historia_minima = excluded.historia_minima, tope_diario = excluded.tope_diario,
  orden = excluded.orden;

-- ── C.1 · UN PRODUCTO QUE DEJO DE VENDERSE ──────────────────────────────────
--
-- Vendia en los meses cerrados anteriores y el ultimo cerrado quedo en cero.
--
-- Con tres meses de historia eso es UN mes en cero, y el hecho lo dice: no se
-- puede afirmar mas que eso. Cuando haya seis meses el mismo detector va a
-- poder decir «tres meses en cero» sin cambiar una linea, porque lee los
-- meses cerrados que haya.
--
-- (El cuerpo final —con el SKU al lado del nombre— queda en 0235.)

create or replace function public.detectar_dejo_de_venderse(p_minimo_unidades numeric default 3)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (select periodo, orden from deteccion_meses_cerrados()),
  ultimo as (select periodo from m where orden = 1),
  previos as (select periodo from m where orden > 1),
  base as (
    select v.producto_id, v.sucursal_id,
           sum(v.unidades) filter (where v.periodo in (select periodo from previos))::numeric as antes,
           count(distinct v.periodo) filter (
             where v.periodo in (select periodo from previos) and v.unidades > 0) as meses_con_venta,
           coalesce(sum(v.unidades) filter (where v.periodo = (select periodo from ultimo)), 0)::numeric as ahora
      from producto_ventas_sucursal v
     where v.periodo in (select periodo from m)
     group by v.producto_id, v.sucursal_id
  ),
  cayo as (
    select b.*, p.nombre, p.sku, p.precio_sugerido::numeric as precio,
           s.nombre as sucursal,
           (select count(*) from previos) as n_previos,
           (select periodo from ultimo) as mes_cero,
           b.antes / nullif((select count(*) from previos), 0) as promedio_mes,
           coalesce((select ps.stock from producto_stock_sifaco ps
                      where ps.producto_id = b.producto_id
                        and ps.sucursal_id = b.sucursal_id
                      order by ps.leido_at desc limit 1), 0) as stock
      from base b
      join productos_catalogo p on p.id = b.producto_id
      join sucursales s on s.id = b.sucursal_id
     where b.ahora = 0
       -- Tiene que haber vendido en TODOS los meses previos cerrados, no en
       -- uno: un producto que vendio 4 un mes y nada el otro no «dejo de
       -- venderse», nunca se vendio parejo.
       and b.meses_con_venta = (select count(*) from previos)
       and b.antes >= p_minimo_unidades
  )
  select
    'dejo_de_venderse:' || producto_id::text || ':' || sucursal_id::text,
    sucursal_id, producto_id,
    format('En %s, %s vendio %s unidades en los %s meses cerrados anteriores y %s unidades en %s. Quedan %s en stock.',
           sucursal, nombre, round(antes), n_previos, round(ahora), mes_cero, round(stock)),
    case when precio is not null then round(promedio_mes * precio, 2) end,
    case when precio is not null
         then format('las %s unidades por mes que vendia, por el precio de $%s. Es la venta que dejo de entrar en un mes, no una perdida acumulada. Son %s meses cerrados de historia: alcanza para decir que un mes quedo en cero, no para decir que se dejo de vender para siempre.',
                     round(promedio_mes, 1), plata_texto(precio), n_previos + 1)
         else 'no se puede costear: este producto no tiene precio cargado' end,
    jsonb_build_object(
      'antes', antes, 'ahora', ahora, 'promedio_mes', round(promedio_mes, 2),
      'meses_previos', n_previos, 'mes_en_cero', mes_cero, 'stock', stock,
      'sucursal', sucursal, 'sku', sku)
  from cayo;
$$;

comment on function public.detectar_dejo_de_venderse(numeric) is
  'C.1 · Vendio en todos los meses cerrados previos y el ultimo quedo en cero. '
  'Lee los meses cerrados que haya: con 3 dice «un mes en cero», con 6 va a '
  'decir «tres meses en cero» sin cambiar una linea.';

-- ── C.2 · UNO QUE ACELERO ───────────────────────────────────────────────────
--
-- Y que se diga antes de que se corte el stock, que es el unico momento en que
-- sirve. Por eso el hecho trae los meses de cobertura al ritmo nuevo y no al
-- viejo: a 8 por mes puede haber stock para un año, y a 40 por mes para tres
-- semanas.

create or replace function public.detectar_empezo_a_vender_mas(
  p_veces numeric default 2.0,
  p_minimo_unidades numeric default 5
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (select periodo, orden from deteccion_meses_cerrados()),
  ultimo as (select periodo from m where orden = 1),
  previos as (select periodo from m where orden > 1),
  base as (
    select v.producto_id, v.sucursal_id,
           sum(v.unidades) filter (where v.periodo in (select periodo from previos))::numeric as antes,
           coalesce(sum(v.unidades) filter (where v.periodo = (select periodo from ultimo)), 0)::numeric as ahora
      from producto_ventas_sucursal v
     where v.periodo in (select periodo from m)
     group by v.producto_id, v.sucursal_id
  ),
  acelero as (
    select b.*, p.nombre, p.sku, p.precio_sugerido::numeric as precio,
           s.nombre as sucursal,
           (select count(*) from previos) as n_previos,
           (select periodo from ultimo) as mes,
           b.antes / nullif((select count(*) from previos), 0) as promedio_mes,
           coalesce((select ps.stock from producto_stock_sifaco ps
                      where ps.producto_id = b.producto_id
                        and ps.sucursal_id = b.sucursal_id
                      order by ps.leido_at desc limit 1), 0)::numeric as stock
      from base b
      join productos_catalogo p on p.id = b.producto_id
      join sucursales s on s.id = b.sucursal_id
     where b.ahora >= p_minimo_unidades
       and b.antes > 0
       and b.ahora >= (b.antes / nullif((select count(*) from previos), 0)) * p_veces
  )
  select
    'acelero:' || producto_id::text || ':' || sucursal_id::text,
    sucursal_id, producto_id,
    format('En %s, %s vendia %s unidades por mes y en %s vendio %s: %s veces mas. Quedan %s en stock, que al ritmo nuevo son %s.',
           sucursal, nombre, round(promedio_mes, 1), mes, round(ahora),
           round(ahora / promedio_mes, 1), round(stock),
           case when ahora = 0 then 'indefinidos'
                when stock / ahora >= 6 then 'mas de 6 meses'
                when stock / ahora < 1 then format('menos de un mes (%s dias)', round(stock / ahora * 30))
                else format('%s meses', round(stock / ahora, 1)) end),
    -- La plata es la venta del mes que se pierde si se corta el stock, no la
    -- venta de mas: lo que acelero ya se cobro.
    case when precio is not null and ahora > 0 and stock / ahora < 1
         then round(greatest(ahora - stock, 0) * precio, 2) end,
    case when precio is null then 'no se puede costear: este producto no tiene precio cargado'
         when ahora = 0 or stock / ahora >= 1
         then format('no se estima plata: al ritmo nuevo el stock alcanza para %s meses, asi que no hay venta en riesgo todavia. El hallazgo es el cambio de ritmo.',
                     case when ahora = 0 then 'muchos' else round(stock / ahora, 1)::text end)
         else format('las %s unidades que el stock no alcanza a cubrir este mes, por el precio de $%s. Es la venta en riesgo si no se repone, no la venta de mas: lo que ya acelero ya se cobro.',
                     round(greatest(ahora - stock, 0)), plata_texto(precio)) end,
    jsonb_build_object(
      'antes_por_mes', round(promedio_mes, 2), 'ahora', ahora,
      'veces', round(ahora / promedio_mes, 2), 'stock', stock,
      'meses_cobertura_al_ritmo_nuevo', case when ahora > 0 then round(stock / ahora, 2) end,
      'mes', mes, 'meses_previos', n_previos, 'sucursal', sucursal, 'sku', sku)
  from acelero;
$$;

comment on function public.detectar_empezo_a_vender_mas(numeric, numeric) is
  'C.2 · El ultimo mes cerrado vendio el doble o mas. La cobertura se calcula '
  'al ritmo NUEVO, que es el unico que importa: a 8 por mes puede haber stock '
  'para un año y a 40 por mes para tres semanas.';

-- ── C.3 · UN PROVEEDOR QUE CAMBIO ───────────────────────────────────────────
--
-- Dos formas de cambiar, con la misma frase: dejo de facturar un mes que
-- siempre facturaba, o el monto se movio fuerte contra su propia historia.
--
-- Lo que NO puede decir: que subio el precio de un producto.
-- `doc_precios_historial` tiene 0 filas, asi que no hay con que comparar
-- precios de compra por producto. Esta en `que_no_dice` del catalogo.

create or replace function public.detectar_proveedor_cambio(
  p_meses integer default 6,
  p_veces numeric default 2.0
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cerrado as (
    -- El ultimo mes con facturas completas: el mes en curso esta a medio
    -- cargar y se veria como una caida.
    select max(date_trunc('month', fecha_emision))::date as mes
      from facturas_proveedor
     where not es_demo
       and fecha_emision < date_trunc('month', current_date)
       and fecha_emision <= current_date
  ),
  por_mes as (
    select f.proveedor_id, p.razon_social,
           date_trunc('month', f.fecha_emision)::date as mes,
           count(*) as facturas, sum(f.total)::numeric as total
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
      cross join cerrado c
     where not f.es_demo
       and f.fecha_emision > (c.mes - make_interval(months => p_meses))
       and f.fecha_emision < (c.mes + interval '1 month')
     group by 1, 2, 3
  ),
  hist as (
    select pm.proveedor_id, pm.razon_social,
           (select mes from cerrado) as mes_cerrado,
           count(*) filter (where pm.mes < (select mes from cerrado)) as meses_con_factura,
           avg(pm.total) filter (where pm.mes < (select mes from cerrado)) as promedio,
           sum(pm.total) filter (where pm.mes = (select mes from cerrado)) as ultimo,
           sum(pm.facturas) filter (where pm.mes = (select mes from cerrado)) as facturas_ultimo
      from por_mes pm
     group by 1, 2
    having count(*) filter (where pm.mes < (select mes from cerrado)) >= 4
  )
  select
    'prov_cambio:' || proveedor_id::text || ':' || to_char(mes_cerrado, 'YYYY-MM'),
    null::uuid, null::uuid,
    case when ultimo is null then
      format('%s facturo en %s de los %s meses anteriores y en %s no facturo nada. Venia facturando $%s por mes.',
             razon_social, meses_con_factura, p_meses - 1,
             to_char(mes_cerrado, 'TMMonth YYYY'), plata_texto(promedio))
    when ultimo > promedio * p_veces then
      format('%s facturo $%s en %s, contra $%s por mes en los %s meses anteriores: %s veces mas, en %s comprobantes.',
             razon_social, plata_texto(ultimo), to_char(mes_cerrado, 'TMMonth YYYY'),
             plata_texto(promedio), meses_con_factura,
             round(ultimo / promedio, 1), facturas_ultimo)
    else
      format('%s facturo $%s en %s, contra $%s por mes en los %s meses anteriores: un %s%% menos.',
             razon_social, plata_texto(ultimo), to_char(mes_cerrado, 'TMMonth YYYY'),
             plata_texto(promedio), meses_con_factura,
             round((1 - ultimo / promedio) * 100))
    end,
    round(abs(coalesce(ultimo, 0) - promedio), 2),
    format('la diferencia entre los $%s del mes y los $%s que facturaba por mes en los %s meses anteriores. Es cuanto se movio el total del proveedor, no un cambio de precio: no hay precios de compra por producto cargados para poder decir eso.',
           plata_texto(coalesce(ultimo, 0)), plata_texto(promedio), meses_con_factura),
    jsonb_build_object(
      'proveedor', razon_social, 'mes', to_char(mes_cerrado, 'YYYY-MM'),
      'total_mes', coalesce(ultimo, 0), 'promedio_anterior', round(promedio, 2),
      'meses_con_factura', meses_con_factura, 'facturas_del_mes', coalesce(facturas_ultimo, 0),
      'ventana_meses', p_meses)
  from hist
  where ultimo is null
     or ultimo > promedio * p_veces
     or ultimo < promedio / p_veces;
$$;

comment on function public.detectar_proveedor_cambio(integer, numeric) is
  'C.3 · Cadencia y monto mensual contra su propia historia. NO dice que subio '
  'el precio de un producto: doc_precios_historial tiene 0 filas.';

-- ── C.4 · UNA SUCURSAL QUE BAJO ─────────────────────────────────────────────
--
-- **Contra su propia historia, no contra las otras.** Una sucursal chica
-- siempre vende menos que una grande y eso no es una caida: es que es chica.
-- Comparar entre sucursales produce un hallazgo permanente que nunca se cierra
-- y que todos aprenden a ignorar.
--
-- Y es por MES, no por dia. El pedido decia «varios dias seguidos» y no se
-- puede: las ventas de SIFACO vienen por mes, y los arqueos diarios —que
-- serian el otro camino— son todos de demostracion. Se dice en `que_no_dice`
-- en vez de inventar una serie diaria que no existe.

create or replace function public.detectar_sucursal_bajo(p_caida_pct numeric default 15)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (select periodo, orden from deteccion_meses_cerrados()),
  ultimo as (select periodo from m where orden = 1),
  previos as (select periodo from m where orden > 1),
  por_suc as (
    select v.sucursal_id, s.nombre as sucursal, v.periodo,
           sum(v.unidades)::numeric as unidades,
           sum(v.unidades * coalesce(p.precio_sugerido, 0))::numeric as plata
      from producto_ventas_sucursal v
      join sucursales s on s.id = v.sucursal_id
      join productos_catalogo p on p.id = v.producto_id
     where v.periodo in (select periodo from m)
     group by 1, 2, 3
  ),
  comparado as (
    select sucursal_id, sucursal,
           avg(unidades) filter (where periodo in (select periodo from previos)) as antes_u,
           avg(plata) filter (where periodo in (select periodo from previos)) as antes_p,
           sum(unidades) filter (where periodo = (select periodo from ultimo)) as ahora_u,
           sum(plata) filter (where periodo = (select periodo from ultimo)) as ahora_p,
           (select count(*) from previos) as n_previos,
           (select periodo from ultimo) as mes
      from por_suc
     group by 1, 2
  )
  select
    'suc_bajo:' || sucursal_id::text || ':' || mes,
    sucursal_id, null::uuid,
    format('%s vendio %s unidades en %s, contra %s por mes en los %s meses cerrados anteriores: un %s%% menos. Es contra su propia historia, no contra las otras sucursales.',
           sucursal, round(ahora_u), mes, round(antes_u), n_previos,
           round((1 - ahora_u / antes_u) * 100)),
    round(antes_p - ahora_p, 2),
    format('los $%s que vendio de menos: $%s en el mes contra $%s por mes en los %s meses anteriores, valuado a precio de lista. Es mensual y no por dia: las ventas de SIFACO vienen por mes.',
           plata_texto(antes_p - ahora_p), plata_texto(ahora_p),
           plata_texto(antes_p), n_previos),
    jsonb_build_object(
      'sucursal', sucursal, 'mes', mes,
      'unidades_mes', ahora_u, 'unidades_promedio_anterior', round(antes_u, 1),
      'plata_mes', round(ahora_p, 2), 'plata_promedio_anterior', round(antes_p, 2),
      'caida_pct', round((1 - ahora_u / antes_u) * 100, 1),
      'meses_previos', n_previos, 'comparado_contra', 'su propia historia')
  from comparado
  where antes_u > 0 and ahora_u is not null
    and ahora_u < antes_u * (1 - p_caida_pct / 100.0);
$$;

comment on function public.detectar_sucursal_bajo(numeric) is
  'C.4 · Contra su propia historia, NUNCA contra las otras: una sucursal chica '
  'vende menos que una grande y eso no es una caida. Mensual y no diario '
  'porque las ventas vienen por mes y los arqueos diarios son demo.';

revoke all on function public.deteccion_meses_cerrados() from public, anon;
revoke all on function public.detectar_dejo_de_venderse(numeric) from public, anon;
revoke all on function public.detectar_empezo_a_vender_mas(numeric, numeric) from public, anon;
revoke all on function public.detectar_proveedor_cambio(integer, numeric) from public, anon;
revoke all on function public.detectar_sucursal_bajo(numeric) from public, anon;
grant execute on function public.deteccion_meses_cerrados() to authenticated, service_role;
grant execute on function public.detectar_dejo_de_venderse(numeric) to service_role;
grant execute on function public.detectar_empezo_a_vender_mas(numeric, numeric) to service_role;
grant execute on function public.detectar_proveedor_cambio(integer, numeric) to service_role;
grant execute on function public.detectar_sucursal_bajo(numeric) to service_role;
