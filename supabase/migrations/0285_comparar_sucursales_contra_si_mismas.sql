-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · D · COMPARAR LAS SUCURSALES
--
-- ── LA DECISIÓN DE DISEÑO DEL BLOQUE ───────────────────────────────────────
--
-- **Arabia nunca va a vender como Guzmán.** Guzmán tiene el 57% del stock y el
-- 73% del consumo de la cadena; Arabia el 3,8% y el 2,1%. Un ranking por
-- volumen dice todos los meses lo mismo —Guzmán primero, Arabia última— y no
-- informa nada: es la foto del tamaño de cada local.
--
-- Así que hay dos comparaciones y no una:
--
--   · **Cada una contra sí misma**, mes contra su mes anterior. Eso sí dice si
--     mejoró o empeoró.
--   · **Entre ellas, sólo lo que no depende del tamaño**: rotación, margen
--     porcentual y venta por persona. Son ratios: un local chico puede rotar
--     mejor que uno grande, y eso es información.
--
-- El volumen se muestra igual, pero como contexto y no como comparación.
--
-- ── Y LO QUE FALTA PARA COMPARAR DE VERDAD ─────────────────────────────────
--
-- `gastos_operativos` tiene **cero filas**. Sin alquiler, sueldos y servicios
-- por sucursal, «cuál gana» no tiene respuesta: lo que se puede mostrar es
-- margen bruto. Y `empleados` tiene un solo registro activo y ninguno con
-- sucursal asignada, así que la venta por persona es null en las cuatro.
--
-- Eso va declarado ARRIBA de la tabla, no al pie. Al pie, alguien lee la
-- columna «deja» como ganancia.
-- ════════════════════════════════════════════════════════════════════════════

-- ── D.1 y D.2 · CADA UNA CONTRA SÍ MISMA ──────────────────────────────────
create or replace function public.sucursales_contra_si_mismas(p_meses integer default 6)
returns table(
  sucursal_id uuid, codigo text, sucursal text,
  periodo text, parcial boolean,
  unidades numeric, venta_estimada numeric, costo_estimado numeric,
  deja_estimado numeric, margen_pct numeric,
  -- Contra su propio mes anterior. Null = no hay mes anterior cargado, que no
  -- es lo mismo que «no cambió».
  unidades_mes_anterior numeric, venta_mes_anterior numeric,
  variacion_unidades_pct numeric, variacion_venta_pct numeric,
  mejor_o_peor text, que_no_se_puede_comparar text
)
language sql stable security definer set search_path to 'public'
as $$
  with periodos as (
    select periodo, bool_and(parcial) as es_parcial
      from producto_ventas_sucursal
     group by periodo
     order by periodo desc
     limit greatest(p_meses, 2)
  ),
  base as (
    select pv.sucursal_id, pv.periodo,
           sum(pv.unidades) as unidades,
           sum(pv.unidades * coalesce(p.precio_sugerido, 0)) as venta,
           sum(pv.unidades * coalesce(p.precio_costo_promedio, 0)) as costo
      from producto_ventas_sucursal pv
      join productos_catalogo p on p.id = pv.producto_id and not p.es_demo
     where pv.periodo in (select periodo from periodos)
     group by pv.sucursal_id, pv.periodo
  ),
  conlag as (
    select b.*,
           pe.es_parcial,
           lag(b.unidades) over (partition by b.sucursal_id order by b.periodo) as u_ant,
           lag(b.venta) over (partition by b.sucursal_id order by b.periodo) as v_ant,
           lag(pe.es_parcial) over (partition by b.sucursal_id order by b.periodo) as ant_parcial
      from base b
      join periodos pe on pe.periodo = b.periodo
  )
  select s.id, s.codigo, s.nombre,
         c.periodo, c.es_parcial,
         c.unidades, round(c.venta), round(c.costo),
         round(c.venta - c.costo),
         case when c.venta > 0 then round(100.0 * (c.venta - c.costo) / c.venta, 1) end,
         c.u_ant, round(c.v_ant),
         -- La variación NO se calcula si alguno de los dos meses es parcial:
         -- un mes a medio cargar contra uno entero da una caída inventada.
         case when c.u_ant > 0 and not c.es_parcial and not coalesce(c.ant_parcial, true)
              then round(100.0 * (c.unidades - c.u_ant) / c.u_ant, 1) end,
         case when c.v_ant > 0 and not c.es_parcial and not coalesce(c.ant_parcial, true)
              then round(100.0 * (c.venta - c.v_ant) / c.v_ant, 1) end,
         case
           when c.es_parcial or coalesce(c.ant_parcial, true) then null
           when c.v_ant is null then null
           when c.venta > c.v_ant * 1.02 then 'mejor'
           when c.venta < c.v_ant * 0.98 then 'peor'
           else 'igual'
         end,
         case
           when c.es_parcial then
             format('%s está a medio cargar: no se compara contra el mes anterior porque la caída sería del archivo, no de la sucursal.', c.periodo)
           when c.ant_parcial then
             'el mes anterior está a medio cargar: comparar contra él daría una mejora inventada'
           when c.v_ant is null then
             'no hay mes anterior cargado para esta sucursal'
         end
    from conlag c
    join sucursales s on s.id = c.sucursal_id
   where s.activa and not s.es_ecommerce
   order by s.nombre, c.periodo desc;
$$;

comment on function public.sucursales_contra_si_mismas(integer) is
  'v1.5 · D.2 · cada sucursal contra su propio mes anterior. Arabia nunca va a '
  'vender como Guzman: lo que importa es si cada una esta mejor o peor que ella '
  'misma. La variacion no se calcula si alguno de los dos meses es parcial.';

-- ── D.3 · LAS TRES COMPARACIONES QUE SÍ TIENEN SENTIDO ────────────────────
create or replace function public.sucursales_comparables()
returns table(
  sucursal_id uuid, codigo text, sucursal text,
  -- Ratios: no dependen del tamaño, así que se pueden poner uno al lado del otro.
  cobertura_meses numeric, margen_pct numeric, venta_por_persona numeric,
  -- Contexto, NO comparación. Va para que se entienda la escala, no para rankear.
  pct_del_stock numeric, pct_del_consumo numeric, venta_estimada numeric,
  empleados integer,
  posicion_rotacion integer, posicion_margen integer,
  que_no_se_puede_comparar text
)
language sql stable security definer set search_path to 'public'
as $$
  with meses as (
    select periodo from (
      select distinct periodo from producto_ventas_sucursal where not parcial
    ) t order by periodo desc limit 3
  ),
  v as (
    select pv.sucursal_id,
           sum(pv.unidades * coalesce(p.precio_sugerido, 0)) as venta,
           sum(pv.unidades * coalesce(p.precio_costo_promedio, 0)) as costo
      from producto_ventas_sucursal pv
      join productos_catalogo p on p.id = pv.producto_id and not p.es_demo
     where pv.periodo in (select periodo from meses)
     group by pv.sucursal_id
  ),
  e as (
    select sucursal_id, count(*)::integer as n from empleados
     where activo and sucursal_id is not null group by sucursal_id
  ),
  arm as (
    select cs.sucursal_id, cs.codigo, cs.nombre, cs.cobertura_meses,
           cs.pct_del_stock, cs.pct_del_consumo,
           case when coalesce(v.venta, 0) > 0
                then round(100.0 * (v.venta - v.costo) / v.venta, 1) end as margen_pct,
           case when coalesce(e.n, 0) > 0 then round(coalesce(v.venta, 0) / e.n) end as por_persona,
           round(coalesce(v.venta, 0)) as venta,
           e.n as empleados
      from comparar_sucursales cs
      left join v on v.sucursal_id = cs.sucursal_id
      left join e on e.sucursal_id = cs.sucursal_id
  )
  select a.sucursal_id, a.codigo, a.nombre,
         a.cobertura_meses, a.margen_pct, a.por_persona,
         a.pct_del_stock, a.pct_del_consumo, a.venta, a.empleados,
         -- Más bajo es mejor en cobertura: menos meses de stock parado.
         rank() over (order by a.cobertura_meses asc nulls last)::integer,
         rank() over (order by a.margen_pct desc nulls last)::integer,
         nullif(concat_ws(' · ',
           case when a.empleados is null then
             'la venta por persona no se puede calcular: no hay empleados con esta sucursal asignada' end,
           case when a.margen_pct is null then
             'el margen no se puede calcular: esta sucursal no registra ventas en los meses completos' end,
           case when a.cobertura_meses is null then
             'la cobertura no se puede calcular: no hay consumo mensual con qué dividir el stock' end
         ), '')
    from arm a
   order by a.cobertura_meses asc nulls last;
$$;

comment on function public.sucursales_comparables() is
  'v1.5 · D.3 · rotacion, margen y venta por persona: los tres ratios que si se '
  'pueden poner uno al lado del otro. El volumen va como contexto, no como '
  'comparacion: un ranking por volumen dice todos los meses lo mismo.';

-- ── D.4 · LO MAL REPARTIDO ────────────────────────────────────────────────
-- Reusa `transferir_antes_de_comprar`, de la v0.96. No se recalcula nada: la
-- vista ya decide qué conviene mover y cuánta plata ahorra no comprarlo.
create or replace function public.sucursales_mal_repartido(p_limite integer default 200)
returns table(
  producto_id uuid, sku text, nombre text,
  destino text, faltan_en_destino numeric,
  origen text, sobran_en_origen numeric,
  transferir numeric, plata_que_no_hay_que_gastar numeric,
  sin_costo boolean, el_origen_no_lo_vende boolean,
  de_cuantos_es_este integer, cuanta_plata_en_total numeric
)
language sql stable security definer set search_path to 'public'
as $$
  select t.producto_id, t.sku, t.nombre,
         t.destino_nombre, t.faltan_en_destino,
         t.origen_nombre, t.sobran_en_origen,
         t.transferir, t.plata_que_no_hay_que_gastar,
         t.sin_costo, t.el_origen_no_lo_vende,
         (select count(*)::integer from transferir_antes_de_comprar),
         (select round(coalesce(sum(plata_que_no_hay_que_gastar), 0))
            from transferir_antes_de_comprar)
    from transferir_antes_de_comprar t
   -- Por plata. Los que no tienen costo al final: no son «cero plata», son
   -- «no se sabe cuánta», y arriba taparían a los que sí se pueden valuar.
   order by t.sin_costo asc,
            t.plata_que_no_hay_que_gastar desc nulls last
   limit p_limite;
$$;

comment on function public.sucursales_mal_repartido(integer) is
  'v1.5 · D.4 · lo que conviene mover antes de comprarlo. Reusa '
  'transferir_antes_de_comprar de la v0.96: son 2.909 filas y PostgREST '
  'entrega 1.000 sin avisar, el corte que mordio en la v0.98.';

-- ── D.5 · LO QUE FALTA PARA COMPARAR DE VERDAD ────────────────────────────
create or replace function public.sucursales_lo_que_falta()
returns table(que text, cuantos integer, sin_esto_no_se_puede text, que_lo_enciende text, href text)
language sql stable security definer set search_path to 'public'
as $$
  select z.que, z.cuantos, z.sin_esto_no_se_puede, z.que_lo_enciende, z.href from (
    select 'Gastos fijos por sucursal'::text as que,
           (select count(*)::integer from gastos_operativos) as cuantos,
           'decir cuál sucursal GANA. Lo que se puede mostrar es margen bruto, que no resta alquiler, sueldos ni servicios.'::text as sin_esto_no_se_puede,
           'cargar los gastos operativos por sucursal y período'::text as que_lo_enciende,
           '/admin/sucursales/gastos'::text as href
    union all
    select 'Empleados con sucursal asignada',
           (select count(*)::integer from empleados where activo and sucursal_id is not null),
           'comparar productividad por persona, que es una de las tres comparaciones que no dependen del tamaño del local',
           'asignar la sucursal a cada empleado activo',
           '/admin/rrhh'
    union all
    select 'Meses completos de venta cargados',
           (select count(distinct periodo)::integer from producto_ventas_sucursal where not parcial),
           'comparar una sucursal contra sí misma más allá de los meses que hay. Con dos meses se ve una variación; con doce se ve una tendencia',
           'importar los maestros de SIFACO de los meses anteriores',
           '/admin/operaciones/sifaco'
    union all
    select 'Ventas diarias por sucursal',
           (select count(*)::integer from sucursales_metricas_diarias),
           'saber cuánto vendió cada sucursal ayer. Hoy la venta se estima con unidades del mes × precio sugerido: sirve para comparar meses, no días',
           'cargar las ventas diarias desde SIFACO por el Centro de Datos',
           '/admin/centro-datos'
  ) z
  order by z.cuantos asc, z.que;
$$;

revoke all on function public.sucursales_contra_si_mismas(integer) from public, anon, authenticated;
revoke all on function public.sucursales_comparables() from public, anon, authenticated;
revoke all on function public.sucursales_mal_repartido(integer) from public, anon, authenticated;
revoke all on function public.sucursales_lo_que_falta() from public, anon, authenticated;
