-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · E · LA BANDEJA ÚNICA DE LO QUE ESPERA
--
-- Hoy lo que espera decisión está en seis lugares: decisiones, hallazgos,
-- errores de catálogo, débitos reclamables, tareas vencidas y firmas
-- pendientes. Seis pantallas y ninguna que diga qué hacer primero.
--
-- ── EL ERROR QUE ESTA FUNCIÓN EVITA ────────────────────────────────────────
--
-- Los hallazgos y los errores de catálogo **son la misma tabla**. Si se leen
-- como dos fuentes, los 30 errores de canal publicados se cuentan dos veces y
-- la bandeja dice 105 renglones donde hay 75. Se parten por `familia`: una
-- fila entra a una sola categoría.
--
-- ── Y POR QUÉ HAY DOS COLUMNAS DE PLATA ────────────────────────────────────
--
-- Las decisiones cuestan **por día** ($748.284 por día de venta que no se
-- hace) y el resto es un **total** ($125.450.906 en juego). Sumarlos en una
-- columna sería sumar un stock con un caudal: el número resultante no
-- significa nada y es más grande, así que se usaría.
--
-- ── E.6 · EL PRESUPUESTO DE INTERRUPCIÓN ───────────────────────────────────
--
-- A la bandeja entran los hallazgos **publicados**. Hay 10.790 esperando
-- turno: cada detector tiene su tope diario y el resto queda en cola. No están
-- escondidos — el resumen dice cuántos son. Una bandeja con diez mil renglones
-- no se revisa, y una que no dice que hay diez mil atrás miente por omisión.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.bandeja_unica(
  p_user uuid default null,
  p_sucursal uuid default null,
  p_limite integer default 300
) returns table(
  fuente text, clave text, titulo text, que_pasa text,
  plata numeric, costo_por_dia numeric,
  se_puede_costear boolean, por_que_no_se_puede_costear text,
  sucursal_id uuid, sucursal text,
  responsable_user_id uuid, mio boolean,
  desde timestamptz, vence_at timestamptz, vencido boolean,
  accion text, href text, riesgo boolean
)
language sql stable security definer set search_path to 'public'
as $$
  with todo as (
    -- 1 · DECISIONES. La unica fuente cuyo costo es por DIA y no un total.
    select 'decision'::text as fuente, dp.clave, dp.titulo, dp.que_pasa,
           null::numeric as plata, dp.costo_por_dia,
           dp.costo_por_dia is not null as se_puede_costear,
           dp.por_que_no_se_sabe as por_que_no,
           dp.sucursal_id, null::uuid as resp,
           null::timestamptz as desde, null::timestamptz as vence,
           'Decidir'::text as accion, dp.href, false as riesgo
      from decisiones_pendientes dp

    union all

    -- 2 y 3 · HALLAZGOS. Solo los PUBLICADOS: los 10.790 que esperan turno son
    -- el presupuesto de interrupcion funcionando, no una lista escondida. Se
    -- parten por familia para que «errores de catalogo» y «lo que no cuadra»
    -- no se cuenten dos veces: es la misma tabla.
    select case when d.familia = 'canal' then 'error_de_canal' else 'hallazgo' end,
           a.id::text, d.nombre, a.hecho,
           a.plata_en_juego, null,
           a.plata_en_juego is not null,
           case when a.plata_en_juego is null then
             'este detector no pudo ponerle numero: la plata es null y no cero' end,
           a.sucursal_id, a.responsable_user_id,
           a.publicado_at, a.vence_at,
           case when d.familia = 'canal' then 'Resolverlo' else 'Revisarlo' end,
           case when d.familia = 'canal' then '/admin/canales/errores' else '/admin/deteccion' end,
           d.siempre_arriba
      from anomalias a
      join detectores d on d.clave = a.detector
     where a.publicado_at is not null and a.estado in ('abierta', 'reaparecio')

    union all

    -- 4 · TAREAS VENCIDAS. Sin plata, y eso no se disfraza con un cero.
    select 'tarea', t.id::text, t.titulo,
           format('tarea %s vencida el %s', t.codigo, t.fecha_vencimiento::date),
           null, null, false,
           'una tarea no tiene plata asociada: lo que cuesta es lo que no se hizo, y eso no esta medido',
           t.sucursal_id, t.responsable_id,
           t.fecha_asignacion, t.fecha_vencimiento, 'Hacerla', '/admin/tareas', false
      from tareas t
     where t.fecha_vencimiento < now()
       and t.estado in ('pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion', 'vencida')

    union all

    -- 5 · FIRMAS PENDIENTES. Un lote armado y sin firmar no publica nada: es
    -- trabajo hecho esperando una persona.
    select 'firma', l.id::text,
           format('Lote de %s en %s, sin firmar', l.accion, l.canal_id),
           coalesce(l.motivo, 'sin motivo declarado'),
           l.plata_estimada, null,
           l.plata_estimada is not null,
           case when l.plata_estimada is null then
             'el lote no pudo valuarse: los productos que lo componen no tienen costo' end,
           null, l.armado_por, l.armado_at, null,
           'Revisar y firmar', '/admin/canales/lotes', false
      from canal_lotes l
     where l.firmado_at is null and l.estado <> 'descartado'

    union all

    -- 6 · DEBITOS. `convenio_debito_reclamable` devuelve true, false o NULL —
    -- null es «tiene que mirarlo una persona». Los tres son distintos y el
    -- tercero es el que no se puede costear. El estado `reclamable` no existe
    -- en el enum: lo reclamable se decide con la funcion, no con una columna.
    select 'debito', cd.id::text,
           format('Débito de %s por %s',
                  coalesce(c.nombre, 'una obra social'), cd.motivo::text),
           r.por_que,
           case when (r.reclamable)::boolean then cd.importe end,
           null,
           (r.reclamable)::boolean is true,
           case when (r.reclamable)::boolean is not true then r.por_que end,
           cd.sucursal_id, null, cd.created_at,
           nullif(r.vence_at, '')::timestamptz,
           'Reclamarlo', '/admin/convenios/debitos', false
      from convenio_debitos cd
      left join convenios c on c.id = cd.convenio_id
      cross join lateral (
        select (convenio_debito_reclamable(cd.id) ->> 'reclamable') as reclamable,
               (convenio_debito_reclamable(cd.id) ->> 'por_que') as por_que,
               (convenio_debito_reclamable(cd.id) ->> 'vence_at') as vence_at
      ) r
     where cd.estado = 'abierto'
       and (r.reclamable is null or (r.reclamable)::boolean is not false)
  )
  select t.fuente, t.clave, t.titulo, t.que_pasa,
         t.plata, t.costo_por_dia,
         t.se_puede_costear, t.por_que_no,
         t.sucursal_id, s.nombre,
         t.resp, (p_user is not null and t.resp = p_user),
         t.desde, t.vence, (t.vence is not null and t.vence < now()),
         t.accion, t.href, t.riesgo
    from todo t
    left join sucursales s on s.id = t.sucursal_id
   -- E.3 · por sucursal. Lo que no tiene sucursal es de la cadena y se ve
   -- siempre: el recargo de PedidosYa no es de un local.
   where (p_sucursal is null or t.sucursal_id = p_sucursal or t.sucursal_id is null)
   -- E.2 · POR PLATA. Y lo que no se puede costear, abajo y separado: no es
   -- cero plata, es «no se sabe cuanta», y arriba taparia a lo que si se sabe.
   -- `riesgo` primero es la regla de oro 9: lo legal no espera su turno en la
   -- fila de la plata.
   order by t.riesgo desc,
            t.se_puede_costear desc,
            greatest(coalesce(t.plata, 0), coalesce(t.costo_por_dia, 0) * 30) desc,
            t.desde asc nulls last
   limit p_limite;
$$;

comment on function public.bandeja_unica(uuid, uuid, integer) is
  'v1.5 · E · las seis fuentes de lo que espera, en una lista ordenada por '
  'plata. Los hallazgos y los errores de canal se parten por familia: son la '
  'misma tabla y leerlos como dos fuentes los contaria dos veces.';

create or replace function public.bandeja_resumen(
  p_user uuid default null, p_sucursal uuid default null
) returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with b as (select * from bandeja_unica(p_user, p_sucursal, 100000))
  select jsonb_build_object(
    'cuantos', (select count(*) from b),
    -- E.5 · cuando no queda nada, lo dice.
    'vacia', (select count(*) = 0 from b),

    'plata_total', (select round(coalesce(sum(plata), 0)) from b where plata is not null),
    'costo_por_dia', (select round(coalesce(sum(costo_por_dia), 0)) from b where costo_por_dia is not null),

    'se_pueden_costear', (select count(*) from b where se_puede_costear),
    'no_se_pueden_costear', (select count(*) from b where not se_puede_costear),

    'mios', (select count(*) from b where mio),
    'vencidos', (select count(*) from b where vencido),
    'de_riesgo', (select count(*) from b where riesgo),

    'por_fuente', (select coalesce(jsonb_object_agg(fuente, n), '{}'::jsonb)
                     from (select fuente, count(*) as n from b group by fuente) z),

    -- E.6 · el presupuesto de interrupcion, dicho.
    'esperando_turno', (select count(*) from anomalias
                         where publicado_at is null and estado in ('abierta', 'reaparecio')),
    'como_funciona_el_presupuesto',
      'Los hallazgos que entran a la bandeja son los publicados. Cada detector tiene un tope diario y el resto espera turno: no están escondidos, están en cola. Una bandeja con diez mil renglones no se revisa.',

    'que_parte_no_se_puede_costear',
      format('%s de los %s renglones no tienen plata asociada. Las tareas vencidas no la tienen —lo que cuesta es lo que no se hizo, y eso no está medido— y algunos hallazgos no pudieron valuarse. Van abajo y separados: su plata es null, no cero.',
             (select count(*) from b where not se_puede_costear),
             (select count(*) from b)),

    'por_que_hay_dos_columnas_de_plata',
      'Las decisiones cuestan por DÍA y el resto es un total. Sumarlos en una sola columna sería sumar un stock con un caudal: $57 M quietos no son lo mismo que $61.151 por día de venta que no se hace.');
$$;

comment on function public.bandeja_resumen(uuid, uuid) is
  'v1.5 · E.4 y E.6 · el costo de no decidir sumando todas las fuentes, con '
  'que parte no se puede costear y cuantos hallazgos esperan turno detras del '
  'presupuesto de interrupcion.';

revoke all on function public.bandeja_unica(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.bandeja_resumen(uuid, uuid) from public, anon, authenticated;
