-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · C · EL TABLERO DEL DUEÑO
--
-- Nada de acá calcula un indicador nuevo: junta lo que ya estaba calculado,
-- repartido en seis sectores, y le pone a cada número de dónde sale.
--
-- ── POR QUÉ LA PROCEDENCIA ES UNA COLUMNA Y NO UN COMENTARIO ───────────────
--
-- Porque la mitad de estos números son estimados y la otra mitad medidos, y
-- mezclados sin marca se leen todos igual. La venta en plata sale de
-- `unidades × precio sugerido` —no hay ventas diarias cargadas—, y alguien que
-- la lea como caja va a tomar una decisión sobre plata que no existe.
--
-- ── Y POR QUÉ EL `href` VIVE EN LA BASE ────────────────────────────────────
--
-- Porque el aviso, el informe semanal y el tablero tienen que mandar al mismo
-- lugar. Con la ruta escrita en cada pantalla, el día que una cambia quedan
-- dos lugares apuntando a una página que ya no existe.
-- ════════════════════════════════════════════════════════════════════════════

-- ── C.7 · QUÉ CAMBIÓ DESDE LA ÚLTIMA VEZ QUE ENTRASTE ─────────────────────
create table if not exists public.panel_visitas (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  visto_at    timestamptz not null default now(),
  visto_antes timestamptz
);

alter table public.panel_visitas enable row level security;

drop policy if exists panel_visitas_propia on public.panel_visitas;
create policy panel_visitas_propia on public.panel_visitas
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.panel_visitas is
  'v1.5 · C.7 · cuando entro cada uno al tablero. `visto_antes` guarda la anterior: sin eso, entrar al tablero borraria el corte contra el que hay que comparar y «que cambio» quedaria siempre vacio.';

create or replace function public.panel_visitar()
returns timestamptz
language plpgsql security definer set search_path to 'public'
as $$
declare v_antes timestamptz; v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  -- Primero lee la anterior, despues escribe la nueva. Al reves, entrar al
  -- tablero pisaria el corte y nunca habria nada que mostrar.
  select visto_at into v_antes from panel_visitas where user_id = v_uid;
  insert into panel_visitas (user_id, visto_at, visto_antes)
  values (v_uid, now(), v_antes)
  on conflict (user_id) do update
    set visto_antes = panel_visitas.visto_at, visto_at = now();
  -- null es «nunca entraste», que no es lo mismo que «no cambio nada».
  return v_antes;
end;
$$;

create or replace function public.panel_que_cambio(p_desde timestamptz)
returns table(que text, cuantos integer, plata numeric, href text, de_cuando timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select z.que, z.cuantos, z.plata, z.href, z.de_cuando from (
    select 'hallazgos nuevos'::text as que, count(*)::integer as cuantos,
           round(coalesce(sum(plata_en_juego), 0)) as plata, '/admin/deteccion'::text as href,
           max(publicado_at) as de_cuando
      from anomalias
     where p_desde is not null and publicado_at > p_desde
       and estado in ('abierta', 'reaparecio')
    union all
    select 'errores de catálogo resueltos', count(*)::integer, null, '/admin/canales/errores',
           max(resuelta_at)
      from anomalias
     where p_desde is not null and resuelta_at > p_desde
    union all
    select 'lotes firmados', count(*)::integer,
           round(coalesce(sum(plata_estimada), 0)), '/admin/canales/lotes',
           max(firmado_at)
      from canal_lotes
     where p_desde is not null and firmado_at > p_desde
    union all
    select 'archivos de plataforma importados', count(*)::integer, null,
           '/admin/canales/importador', max(subido_at)
      from archivo_importaciones
     where p_desde is not null and subido_at > p_desde
    union all
    select 'tareas completadas', count(*)::integer, null, '/admin/tareas',
           max(updated_at)
      from tareas
     where p_desde is not null and updated_at > p_desde and estado = 'completada'
    union all
    select 'maestros de SIFACO aplicados', count(*)::integer, null,
           '/admin/operaciones/sifaco', max(aplicado_at)
      from sifaco_importaciones
     where p_desde is not null and aplicado_at > p_desde
  ) z
  -- Cero no se muestra: «0 lotes firmados» no es un cambio.
  where z.cuantos > 0
  order by z.plata desc nulls last, z.cuantos desc;
$$;

-- ── C.3 · LO QUE ESTÁ EN JUEGO ────────────────────────────────────────────
create or replace function public.direccion_en_juego()
returns table(
  clave text, titulo text, cuantos integer, plata numeric,
  procedencia text, de_donde text, accion text, href text, riesgo boolean
)
language sql stable security definer set search_path to 'public'
as $$
  select z.clave, z.titulo, z.cuantos, z.plata, z.procedencia, z.de_donde,
         z.accion, z.href, z.riesgo
    from (
    select 'apagados_con_stock'::text as clave, 'Apagados con stock'::text as titulo,
           (r ->> 'productos_de_la_oportunidad')::integer as cuantos,
           (r ->> 'oportunidad_real')::numeric as plata,
           'medido'::text as procedencia, (r ->> 'como_se_calculo_la_oportunidad') as de_donde,
           'Prepararlos para publicar'::text as accion,
           '/admin/canales/apagados'::text as href, false as riesgo
      from canal_apagados_resumen(null) r
    union all
    select 'hallazgos', 'Hallazgos publicados',
           count(*)::integer, round(coalesce(sum(plata_en_juego), 0)),
           'medido',
           'hallazgos de los detectores que están publicados y sin cerrar. La plata es la que cada detector pudo valuar: los que no tienen número no suman cero, no suman.',
           'Revisar los hallazgos', '/admin/deteccion', false
      from anomalias
     where publicado_at is not null and estado in ('abierta', 'reaparecio')
    union all
    select 'comprar_ya', 'Para comprar ya',
           sum(items)::integer, round(sum(monto)),
           'estimado',
           'items en urgencia «ya» y «esta semana», valuados al último costo conocido. El costo puede estar viejo: es el del maestro, no una cotización.',
           'Armar el plan de compra', '/admin/compras', false
      from reco_compras_urgencia
     where urgencia in ('ya', 'esta_semana')
    union all
    select 'deuda', 'Deuda con proveedores',
           count(*)::integer, round(sum(saldo)),
           'medido',
           'saldo impago de las facturas cargadas. No incluye lo que todavía no se capturó: si una factura no entró, no está acá.',
           'Ver qué se debe', '/admin/finanzas/documentos', true
      from deuda_proveedores
     where saldo > 0
    union all
    select 'errores_canal', 'Errores de catálogo',
           count(*)::integer, round(coalesce(sum(an.plata_en_juego), 0)),
           'medido',
           'los seis detectores de la familia canal, abiertos. Cada uno con su plazo declarado por tipo.',
           'Resolverlos', '/admin/canales/errores', false
      from anomalias an join detectores d on d.clave = an.detector
     where d.familia = 'canal' and an.estado in ('abierta', 'reaparecio')
  ) z
  order by z.plata desc nulls last;
$$;

-- ── C.4 · CUÁNTO DEJA CADA SUCURSAL ──────────────────────────────────────
-- No cuánto vende: cuánto deja. Y con el límite dicho: sin gastos fijos
-- cargados lo que se muestra es margen BRUTO, que no contesta si gana.
create or replace function public.direccion_por_sucursal(p_meses integer default 3)
returns table(
  sucursal_id uuid, codigo text, sucursal text,
  periodos_mirados integer, periodo_desde text, periodo_hasta text,
  unidades numeric, venta_estimada numeric, costo_estimado numeric,
  deja_estimado numeric, margen_pct numeric,
  stock_al_costo numeric, cobertura_meses numeric,
  empleados integer, venta_por_persona numeric,
  gastos_fijos numeric,
  gana_plata boolean, por_que_no_se_puede_decir text
)
language sql stable security definer set search_path to 'public'
as $$
  with periodos as (
    -- Solo meses completos. Comparar un mes a medio cargar contra uno entero
    -- es el error que la columna `parcial` existe para evitar.
    select periodo from (
      select distinct periodo from producto_ventas_sucursal where not parcial
    ) t order by periodo desc limit greatest(p_meses, 1)
  ),
  v as (
    select pv.sucursal_id,
           sum(pv.unidades) as unidades,
           sum(pv.unidades * coalesce(p.precio_sugerido, 0)) as venta,
           sum(pv.unidades * coalesce(p.precio_costo_promedio, 0)) as costo
      from producto_ventas_sucursal pv
      join productos_catalogo p on p.id = pv.producto_id and not p.es_demo
     where pv.periodo in (select periodo from periodos)
     group by pv.sucursal_id
  ),
  e as (
    select sucursal_id, count(*)::integer as n from empleados
     where activo and sucursal_id is not null group by sucursal_id
  ),
  g as (
    select sucursal_id, sum(monto) as monto from gastos_operativos group by sucursal_id
  )
  select s.id, s.codigo, s.nombre,
         (select count(*)::integer from periodos),
         (select min(periodo) from periodos), (select max(periodo) from periodos),
         coalesce(v.unidades, 0),
         round(coalesce(v.venta, 0)), round(coalesce(v.costo, 0)),
         round(coalesce(v.venta, 0) - coalesce(v.costo, 0)),
         case when coalesce(v.venta, 0) > 0
              then round(100.0 * (v.venta - v.costo) / v.venta, 1) end,
         cs.valor_costo, cs.cobertura_meses,
         e.n,
         -- null y no cero: sin empleados asignados no se puede dividir. Cero
         -- diria «no vende por persona», que es otra cosa.
         case when coalesce(e.n, 0) > 0 then round(coalesce(v.venta, 0) / e.n) end,
         g.monto,
         -- Sin gastos fijos NO se puede decir cual gana. Es null, no false.
         case when g.monto is not null and coalesce(v.venta, 0) > 0
              then (v.venta - v.costo) > g.monto end,
         case
           when g.monto is null then
             'no hay gastos fijos cargados para esta sucursal: lo que se muestra es el margen bruto, que no dice si la sucursal gana plata. Sin alquiler, sueldos y servicios la pregunta no tiene respuesta.'
           when coalesce(v.venta, 0) = 0 then
             'esta sucursal no registra ventas en los meses completos mirados'
         end
    from sucursales s
    left join v on v.sucursal_id = s.id
    left join e on e.sucursal_id = s.id
    left join g on g.sucursal_id = s.id
    left join comparar_sucursales cs on cs.sucursal_id = s.id
   where s.activa and not s.es_ecommerce
   order by coalesce(v.venta, 0) desc;
$$;

-- ── C.2 · LOS NÚMEROS DEL NEGOCIO, CONTRA EL PERÍODO ANTERIOR ────────────
create or replace function public.direccion_negocio()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with completos as (
    select distinct periodo from producto_ventas_sucursal where not parcial
  ),
  ult as (select max(periodo) as p from completos),
  ant as (select max(periodo) as p from completos where periodo < (select p from ult)),
  mes as (
    select pv.periodo,
           sum(pv.unidades) as unidades,
           sum(pv.unidades * coalesce(p.precio_sugerido, 0)) as venta,
           sum(pv.unidades * coalesce(p.precio_costo_promedio, 0)) as costo
      from producto_ventas_sucursal pv
      join productos_catalogo p on p.id = pv.producto_id and not p.es_demo
     where pv.periodo in ((select p from ult), (select p from ant))
     group by pv.periodo
  ),
  u as (select * from mes where periodo = (select p from ult)),
  a as (select * from mes where periodo = (select p from ant))
  select jsonb_build_object(
    'periodo', (select p from ult),
    'periodo_anterior', (select p from ant),
    'meses_completos', (select count(*) from completos),
    'meses_parciales_excluidos',
      (select count(distinct periodo) from producto_ventas_sucursal where parcial),

    'venta', jsonb_build_object(
      'valor', round((select venta from u)),
      'anterior', round((select venta from a)),
      'variacion_pct', case when (select venta from a) > 0
        then round(100.0 * ((select venta from u) - (select venta from a)) / (select venta from a), 1) end,
      'procedencia', 'estimado',
      'de_donde', 'unidades vendidas × precio sugerido del maestro, la misma fórmula que usa la comparación entre sucursales desde la v0.96. No hay ventas diarias cargadas: no hay nada medido con qué contrastarla.'),

    'margen', jsonb_build_object(
      'valor', round((select venta - costo from u)),
      'anterior', round((select venta - costo from a)),
      'variacion_pct', case when (select venta - costo from a) > 0
        then round(100.0 * (((select venta - costo from u)) - ((select venta - costo from a)))
                   / ((select venta - costo from a)), 1) end,
      'procedencia', 'estimado',
      'de_donde', 'venta estimada menos el último costo conocido. Es margen BRUTO: no hay gastos fijos por sucursal cargados, así que no dice si el negocio gana.'),

    'caja', jsonb_build_object(
      'valor', (select round(coalesce(sum(saldo_actual), 0)) from cuentas_bancarias_con_saldo
                 where activa and moneda = 'ARS'),
      'anterior', null,
      'procedencia', 'medido',
      'de_donde', 'saldo de las cuentas bancarias en pesos. No hay serie histórica: no se puede comparar contra el mes anterior.'),

    'deuda', jsonb_build_object(
      'valor', (select round(coalesce(sum(saldo), 0)) from deuda_proveedores where saldo > 0),
      'anterior', null,
      'procedencia', 'medido',
      'de_donde', 'saldo impago de las facturas cargadas. Lo que no se capturó todavía no está.'),

    'stock', jsonb_build_object(
      'valor', (select round(coalesce(sum(valor_costo), 0)) from comparar_sucursales),
      'anterior', null,
      'procedencia', 'medido',
      'de_donde', 'unidades en stock × costo promedio, del último maestro de SIFACO aplicado por sucursal.'),

    'rotacion', jsonb_build_object(
      'valor', (select round(avg(cobertura_meses), 2) from comparar_sucursales
                 where cobertura_meses is not null),
      'anterior', null,
      'procedencia', 'estimado',
      'de_donde', 'meses de cobertura promedio entre sucursales: stock al costo dividido el consumo mensual. Más bajo es mejor.'),

    'que_no_dice',
      'Ninguno de estos números incluye gastos fijos, sueldos ni impuestos: no hay nada de eso cargado. El margen es bruto y la pregunta «gana plata el negocio» no tiene respuesta todavía.');
$$;

-- ── C.5 · LO QUE EL SISTEMA NO SABE ───────────────────────────────────────
-- Se cuenta cada vez. Un bloque escrito a mano se desactualiza y termina
-- diciendo que falta algo que ya entró, que es peor que no tener bloque.
create or replace function public.direccion_no_se_sabe()
returns table(que text, cuantos integer, que_lo_enciende text, href text)
language sql stable security definer set search_path to 'public'
as $$
  select z.que, z.cuantos, z.que_lo_enciende, z.href from (
    select 'Ventas diarias'::text as que,
           (select count(*)::integer from sucursales_metricas_diarias) as cuantos,
           'cargar las ventas por día desde SIFACO. Hoy la venta se estima con unidades del mes × precio: sirve para comparar meses, no para saber cuánto entró ayer.'::text as que_lo_enciende,
           '/admin/centro-datos'::text as href
    union all
    select 'Productos con costo cargado',
           (select count(*)::integer from productos_catalogo
             where activo and not es_demo and precio_costo_promedio is not null),
           'que el costo entre con el maestro de SIFACO o con las facturas de compra. Hay 23.319 productos activos sin costo, y sin costo no entran en ninguna cuenta de margen.',
           '/admin/operaciones/sifaco'
    union all
    select 'Gastos fijos por sucursal',
           (select count(*)::integer from gastos_operativos),
           'cargar alquiler, sueldos y servicios por sucursal. Sin eso no se puede decir cuál sucursal gana: lo que se muestra es margen bruto.',
           '/admin/sucursales/gastos'
    union all
    select 'Liquidaciones de plataforma',
           (select count(*)::integer from archivo_importaciones where tipo = 'liquidacion'),
           'subir una liquidación real de cada plataforma por el importador. Es lo que confirma la comisión del 24% de PedidosYa, que hoy es un número declarado y no verificado.',
           '/admin/canales/importador'
    union all
    select 'Pedidos con costo real de envío',
           (select count(*)::integer from orders where envio_costo_real is not null),
           'registrar el costo real del envío en cada pedido, o cargar el costo por zona. Sin eso el resultado por canal está inflado: falta restar el envío.',
           '/admin/pedidos'
    union all
    select 'Publicaciones de PedidosYa',
           (select count(*)::integer from canal_publicaciones where canal_id like 'pedidosya%'),
           'exportar el catálogo desde el portal de PedidosYa y subirlo por el importador. Hoy los dos canales están declarados y vacíos: todo lo que el sistema dice de ellos es null, no cero.',
           '/admin/canales/importador'
    union all
    select 'Empleados con sucursal asignada',
           (select count(*)::integer from empleados where activo and sucursal_id is not null),
           'asignar la sucursal a cada empleado. Sin eso no se puede comparar productividad por persona, que es una de las tres comparaciones que sí tienen sentido entre sucursales.',
           '/admin/rrhh'
  ) z
  order by z.cuantos asc, z.que;
$$;

revoke all on function public.panel_que_cambio(timestamptz) from public, anon, authenticated;
revoke all on function public.direccion_en_juego() from public, anon, authenticated;
revoke all on function public.direccion_por_sucursal(integer) from public, anon, authenticated;
revoke all on function public.direccion_negocio() from public, anon, authenticated;
revoke all on function public.direccion_no_se_sabe() from public, anon, authenticated;
-- `panel_visitar` se queda abierta a `authenticated`: usa auth.uid() y solo
-- puede escribir la fila del que llama. Es la excepcion declarada de siempre.
revoke all on function public.panel_visitar() from public, anon;
grant execute on function public.panel_visitar() to authenticated;
