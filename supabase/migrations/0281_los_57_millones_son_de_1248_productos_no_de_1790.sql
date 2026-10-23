-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · B.6 · EL TITULAR CUENTA 1.790 Y VALÚA 1.248
--
-- De los 1.790 apagados con stock, 542 no tienen costo cargado: su
-- `plata_en_juego` es null, no cero. Así que los $57.780.179 son de 1.248
-- productos, no de 1.790 — y el resumen tiene que decirlo, porque dividir
-- 57,7 M por 1.790 da un promedio que no existe.
--
-- Esto no se vio hasta que hubo que mostrarlo. El detector venía contando bien
-- —publicaba los 1.790 y sumaba sólo los que podía valuar— pero el total y el
-- conteo se leían juntos, y juntos mienten.
--
-- Y dos de los 1.248 pierden plata a cualquier precio: el costo es mayor que
-- el precio sugerido. En la tienda propia, que no cobra comisión ni aplica
-- recargo, `conviene` da true porque el canal es idéntico al mostrador — pero
-- publicar algo que se vende por debajo del costo no es una oportunidad.
-- Salen de la oportunidad real y se declaran aparte: son un problema de
-- precio, no de canal.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.canal_apagados_resumen(p_canal text default null)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with t as (
    select * from canal_apagados_con_stock(p_canal, 100000)
  )
  select jsonb_build_object(
    'productos', (select count(*) from t),

    -- El titular, y de cuántos es realmente.
    'plata_declarada', (select round(coalesce(sum(plata_quieta), 0)) from t),
    'productos_con_plata', (select count(*) from t where plata_quieta is not null),
    'productos_sin_plata', (select count(*) from t where plata_quieta is null),

    -- B.6 · LA OPORTUNIDAD REAL. Saca a los que pierden plata igual.
    'oportunidad_real', (select round(coalesce(sum(plata_quieta), 0))
                           from t where conviene and not pierde_plata),
    'productos_de_la_oportunidad', (select count(*) from t where conviene and not pierde_plata),

    'pierden_igual', (select count(*) from t where pierde_plata),
    'plata_de_los_que_pierden', (select round(coalesce(sum(plata_quieta), 0)) from t where pierde_plata),

    'dejan_menos_que_el_mostrador', (select count(*) from t where conviene = false),
    'plata_de_los_que_dejan_menos', (select round(coalesce(sum(plata_quieta), 0))
                                       from t where conviene = false),

    'no_se_puede_juzgar', (select count(*) from t where conviene is null),

    'se_sabe_por_que_estan_apagados', (select count(*) from t where se_sabe_por_que),
    'no_se_sabe_por_que', (select count(*) from t where not se_sabe_por_que),

    'de_donde_sale_la_plata',
      'Unidades en stock × costo unitario. Se valúa a costo y no a precio de venta: es plata que '
      'ya se pagó y está quieta, no una venta perdida.',

    'por_que_el_total_no_es_de_todos',
      format('%s de los %s productos no tienen costo cargado, así que su plata es null y no cero: '
             'no entran en el total. Los $%s son de %s productos. Dividir el total por %s daría un '
             'promedio que no existe.',
             (select count(*) from t where plata_quieta is null),
             (select count(*) from t),
             plata_texto((select coalesce(sum(plata_quieta), 0) from t)),
             (select count(*) from t where plata_quieta is not null),
             (select count(*) from t)),

    'como_se_calculo_la_oportunidad',
      'La oportunidad real saca dos grupos del total: los que dejarían menos que el mostrador en '
      'ese canal —publicarlos no recupera nada, empeora— y los que pierden plata a cualquier '
      'precio porque el costo es mayor que el precio sugerido. Esos últimos son un problema de '
      'precio y no de canal: publicarlos vendería más rápido algo que pierde en cada unidad.',

    'que_no_dice',
      'No dice que publicar los que convienen vaya a vender. Dice que hoy nadie los puede comprar '
      'en ese canal teniendo stock. La tienda propia tiene 4.669 productos publicados y 21 pedidos '
      'en total: publicar es condición necesaria, no suficiente.');
$$;

revoke all on function public.canal_apagados_resumen(text) from public, anon, authenticated;
