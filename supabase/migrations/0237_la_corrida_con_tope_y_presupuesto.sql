-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0237 · LA CORRIDA · D.2, D.3, D.4 y D.6                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── DOS COSAS QUE `anomalias` TENIA Y NO SE VEIAN ───────────────────────────
--
-- 1 · `plata_en_juego` era **NOT NULL**, y eso rompe el criterio de D.1.
--
--     La tabla nacio con seis detectores de catalogo que siempre podian
--     costear: un producto sin costo, una oferta bajo costo. Los doce de
--     ahora no: B.6 encontro 21 casos donde los dos registros no registran
--     ventas y la diferencia de precio no se multiplica por nada, y C.2 tiene
--     160 donde el stock alcanza y no hay plata en riesgo.
--
--     Con NOT NULL habria que escribir 0, y 0 significa «lo mire y no hay».
--     Son dos cosas distintas y la pantalla las muestra distinto: 0 ordena
--     como inofensivo, null va a la lista larga diciendo por que.
--
-- 2 · `detectada_en` y `vista_en` **no son fechas**: son uuid que apuntan a
--     `sifaco_importaciones` —en que maestro se detecto y en cual se la vio
--     por ultima vez. Los nombres se leen como fecha y no lo son. Las fechas
--     de verdad son `primera_vez` y `ultima_vez`.
--
--     Los detectores de esta sesion no salen de un maestro, asi que las dejan
--     en null, y eso tambien dice algo: este hallazgo no vino de una
--     importacion.

alter table public.anomalias
  alter column plata_en_juego drop not null,
  add column if not exists publicado_at timestamptz;

comment on column public.anomalias.plata_en_juego is
  'D.1 · Null es «no se puede estimar» y 0 es «lo mire y no hay». Era NOT NULL '
  'cuando todos los detectores podian costear; ahora hay varios que no, y '
  'escribir 0 los haria ver inofensivos.';
comment on column public.anomalias.detectada_en is
  'NO es una fecha: es el uuid de la importacion de SIFACO en la que se '
  'detecto. Las fechas son primera_vez y ultima_vez. Los detectores de la '
  'v1.3 la dejan en null porque no salen de un maestro.';
comment on column public.anomalias.publicado_at is
  'D.4 · Cuando se publico como aviso. Null es «esta en la lista larga '
  'esperando», no «se descarto»: lo que no entra en el presupuesto de '
  'interrupcion no se pierde.';

create index if not exists anomalias_publicado
  on public.anomalias (detector, publicado_at desc nulls last);

alter table public.detectores
  add column if not exists aviso_tipo text,
  add column if not exists aviso_href text,
  add column if not exists funcion text,
  -- D.7 · cuando un detector se apaga por no acertar nunca, queda dicho.
  add column if not exists apagado_porque text,
  add column if not exists apagado_at timestamptz;

comment on column public.detectores.funcion is
  'Como se llama al detector. Los de la familia `catalogo` no tienen: corren '
  'por el camino de `anomalias_correr_catalogo`, que ya existia y funciona.';

-- A cada detector, su tipo de aviso. El enum `nora_aviso_tipo` ya tiene los
-- valores que hacen falta y no se puede extender desde un bloque, asi que el
-- mapeo vive en el catalogo.
update public.detectores set aviso_tipo = m.t, aviso_href = m.h, funcion = m.f
  from (values
    ('stock_no_cuadra', 'irregularidad_stock', '/admin/operaciones/stock', 'detectar_stock_no_cuadra'),
    ('caja_diferencias_repetidas', 'caja_descuadre', '/admin/caja', 'detectar_caja_diferencias_repetidas'),
    ('comprobante_duplicado', 'comprobante_duplicado', '/admin/compras/documentos', 'detectar_comprobante_duplicado'),
    ('monto_fuera_de_lo_habitual', 'monto_fuera_de_lo_habitual', '/admin/compras/documentos', 'detectar_monto_fuera_de_lo_habitual'),
    ('faltante_sin_nota_credito', 'faltante_sin_nota_credito', '/admin/compras/documentos', 'detectar_faltante_sin_nota_credito'),
    ('barras_con_dos_precios', 'datos_sin_actualizar', '/admin/catalogo', 'detectar_barras_con_dos_precios'),
    ('dejo_de_venderse', 'stock_dormido', '/admin/compras/demanda', 'detectar_dejo_de_venderse'),
    ('empezo_a_vender_mas', 'entra_en_quiebre', '/admin/compras', 'detectar_empezo_a_vender_mas'),
    ('proveedor_cambio', 'cambio_de_estado', '/admin/compras/proveedores', 'detectar_proveedor_cambio'),
    ('sucursal_bajo', 'cambio_de_estado', '/admin/reportes', 'detectar_sucursal_bajo')
  ) as m(c, t, h, f)
 where detectores.clave = m.c;

update public.detectores set aviso_tipo = m.t, aviso_href = m.h
  from (values
    ('canal_cambio', 'cambio_de_estado', '/admin/pedidos'),
    ('cliente_no_volvio', 'cliente_vip_inactivo', '/admin/clientes'),
    ('sin_costo_cargado', 'datos_sin_actualizar', '/admin/catalogo'),
    ('producto_duplicado', 'datos_sin_actualizar', '/admin/catalogo'),
    ('oferta_bajo_costo', 'datos_sin_actualizar', '/admin/ofertas'),
    ('precio_lista_bajo_costo', 'datos_sin_actualizar', '/admin/catalogo'),
    ('descuento_imposible', 'datos_sin_actualizar', '/admin/ofertas'),
    ('descuento_sin_vencimiento', 'oferta_por_vencer', '/admin/ofertas')
  ) as m(c, t, h)
 where detectores.clave = m.c;

-- ── D.2 · ORDENADO POR PLATA, NO POR FECHA ──────────────────────────────────
--
-- Es el cambio mas chico del bloque y el que mas cambia la pantalla. Por
-- fecha, arriba esta lo ultimo que paso. Por plata, arriba esta lo que mas
-- cuesta — que es lo unico que justifica interrumpir a alguien.
--
-- `nulls last` no es un detalle de SQL: es D.1. Un hallazgo sin plata
-- estimada no se puede comparar con otro, asi que no puede estar arriba.

create or replace function public.deteccion_hallazgos(
  p_familia text default null,
  p_sucursal uuid default null,
  p_solo_publicados boolean default true,
  p_limite integer default 50
)
returns table (
  id uuid, detector text, nombre_detector text, familia text,
  clave text, sucursal_id uuid, sucursal text, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, que_no_dice text,
  estado text, visto_primero timestamptz, visto_ultimo timestamptz,
  publicado_at timestamptz, veces_reaparecio integer, aviso_href text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select an.id, an.detector, d.nombre, d.familia::text,
         an.clave, an.sucursal_id, s.nombre, an.producto_id,
         coalesce(an.hecho, an.tipo::text || ': ' || an.clave),
         an.plata_en_juego, an.como_se_calculo, d.que_no_dice,
         an.estado::text, an.primera_vez, an.ultima_vez,
         an.publicado_at, an.veces_reaparecio, d.aviso_href
    from anomalias an
    join detectores d on d.clave = an.detector
    left join sucursales s on s.id = an.sucursal_id
   where an.estado in ('abierta', 'en_curso', 'reaparecio')
     and (p_familia is null or d.familia::text = p_familia)
     and (p_sucursal is null or an.sucursal_id = p_sucursal or an.sucursal_id is null)
     and (not p_solo_publicados or an.publicado_at is not null)
   order by an.plata_en_juego desc nulls last, an.ultima_vez desc
   limit p_limite;
$$;

comment on function public.deteccion_hallazgos(text, uuid, boolean, integer) is
  'D.2 · Ordenado por plata y no por fecha. `nulls last` es D.1: un hallazgo '
  'sin plata estimada no se puede comparar, asi que no va arriba.';

-- ── LA CORRIDA ──────────────────────────────────────────────────────────────
--
-- ── D.3 · EL TOPE POR DETECTOR ──────────────────────────────────────────────
--
-- Los cinco peores de cada detector, no los ciento cuarenta. C.1 encontro 698
-- productos que dejaron de venderse: publicar 698 es lo mismo que publicar
-- cero, con mas trabajo.
--
-- ── D.4 · EL PRESUPUESTO DE INTERRUPCION ────────────────────────────────────
--
-- `avisos_por_corrida` ya existe y vale 40. No se inventa otro: si cada
-- sesion agrega su propio presupuesto, el total deja de ser un presupuesto.
--
-- Lo que no entra queda en `anomalias` con `publicado_at` en null. No se
-- pierde: manaña, si lo de arriba se resolvio, sube.
--
-- ── D.6 · LO QUE SE DESCARTO Y DESPUES PASO ─────────────────────────────────
--
-- Con una condicion que importa: tienen que haber pasado 30 dias desde el
-- descarte —`medidor_dias_para_cerrar`, el mismo parametro del medidor.
--
-- Sin eso, un hallazgo descartado hoy «vuelve a pasar» manaña, porque el dato
-- no cambio y el detector lo encuentra igual. Eso no es volver: es que nunca
-- se fue. Y contarlo como que volvio le daria al detector un acierto por
-- nada, que es exactamente el error que el medidor de la v0.99 ya tiene
-- escrito en su propio codigo: «el caso que antes daba acierto siempre».
--
-- (El cuerpo final de `deteccion_correr` queda en 0241, que arregla el tope
--  por dia. Aca nacio.)

create or replace function public.deteccion_correr()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_presupuesto int := coalesce((select max(valor)::int from compras_parametros
                                  where clave = 'avisos_por_corrida'), 40);
  v_dias_volver int := coalesce((select max(valor)::int from compras_parametros
                                  where clave = 'medidor_dias_para_cerrar'), 30);
  r record;
  v_encontrados int;
  v_nuevos int := 0;
  v_total int := 0;
  v_publicados int := 0;
  v_esperando int := 0;
  v_volvieron int := 0;
  v_apagados int := 0;
  v_por_detector jsonb := '[]'::jsonb;
  v_no_corrieron jsonb := '[]'::jsonb;
  v_silenciados jsonb := '[]'::jsonb;
begin
  create temp table _hallazgos (
    detector text, clave text, sucursal_id uuid, producto_id uuid,
    hecho text, plata numeric, como_se_calculo text, evidencia jsonb
  ) on commit drop;

  for r in
    select d.clave, d.funcion, d.tope_diario, e.puede_correr, e.por_que_no
      from detectores d
      join deteccion_estado() e on e.clave = d.clave
     where d.activo and d.funcion is not null
     order by d.orden
  loop
    if not r.puede_correr then
      v_no_corrieron := v_no_corrieron || jsonb_build_object(
        'detector', r.clave, 'por_que_no', r.por_que_no);
      continue;
    end if;

    execute format(
      'insert into _hallazgos select %L, clave, sucursal_id, producto_id, hecho, plata, como_se_calculo, evidencia from %I()',
      r.clave, r.funcion);
    get diagnostics v_encontrados = row_count;

    v_por_detector := v_por_detector || jsonb_build_object(
      'detector', r.clave, 'encontrados', v_encontrados, 'tope', r.tope_diario);
    v_total := v_total + v_encontrados;
  end loop;

  for r in select * from deteccion_silencios() loop
    delete from _hallazgos h
     where h.detector = r.detector
       and exists (select 1 from deteccion_descartes dd
                    where dd.detector = r.detector and dd.motivo = r.motivo
                      and dd.clave = h.clave);
    get diagnostics v_encontrados = row_count;
    v_silenciados := v_silenciados || jsonb_build_object(
      'detector', r.detector, 'motivo', r.motivo,
      'callados', v_encontrados, 'por_que', r.por_que);
  end loop;

  update deteccion_descartes dd
     set volvio_at = now(), volvio_veces = dd.volvio_veces + 1
   where dd.volvio_at is null
     and dd.descartado_at < now() - make_interval(days => v_dias_volver)
     and exists (select 1 from _hallazgos h
                  where h.detector = dd.detector and h.clave = dd.clave);
  get diagnostics v_volvieron = row_count;

  insert into anomalias (
    tipo, detector, clave, sucursal_id, producto_id,
    hecho, plata_en_juego, como_se_calculo, evidencia,
    estado, primera_vez, ultima_vez)
  select
    case when h.detector = 'comprobante_duplicado' then 'producto_duplicado'::anomalia_tipo
         else 'sin_costo_cargado'::anomalia_tipo end,
    h.detector, h.clave, h.sucursal_id, h.producto_id,
    h.hecho, h.plata, h.como_se_calculo, h.evidencia,
    'abierta', now(), now()
  from _hallazgos h
  on conflict (clave) do update set
    hecho = excluded.hecho,
    plata_en_juego = excluded.plata_en_juego,
    como_se_calculo = excluded.como_se_calculo,
    evidencia = excluded.evidencia,
    sucursal_id = excluded.sucursal_id,
    ultima_vez = now(),
    estado = case when anomalias.estado in ('resuelta', 'descartada')
                  then 'reaparecio'::anomalia_estado else anomalias.estado end,
    veces_reaparecio = case when anomalias.estado in ('resuelta', 'descartada')
                            then anomalias.veces_reaparecio + 1
                            else anomalias.veces_reaparecio end;

  with candidatos as (
    select an.id, an.detector, an.plata_en_juego,
           row_number() over (partition by an.detector
                              order by an.plata_en_juego desc nulls last) as puesto_detector
      from anomalias an
      join detectores d on d.clave = an.detector
     where an.estado in ('abierta', 'reaparecio')
       and an.publicado_at is null
       and d.funcion is not null
  ),
  con_tope as (
    select c.id, c.plata_en_juego,
           row_number() over (order by c.plata_en_juego desc nulls last) as puesto_global
      from candidatos c
      join detectores d on d.clave = c.detector
     where c.puesto_detector <= d.tope_diario
  ),
  publicados as (
    update anomalias set publicado_at = now()
     where id in (select id from con_tope where puesto_global <= v_presupuesto)
    returning 1)
  select count(*) into v_publicados from publicados;

  select count(*) into v_esperando
    from anomalias an join detectores d on d.clave = an.detector
   where an.estado in ('abierta', 'reaparecio') and an.publicado_at is null
     and d.funcion is not null;

  insert into nora_avisos (
    tipo, severidad, titulo, detalle, modulo, sucursal_id,
    accion_label, accion_href, entidad_ref, estado, clave_dedup, es_demo)
  select
    d.aviso_tipo::nora_aviso_tipo,
    case when an.plata_en_juego is null then 'info'
         when an.plata_en_juego >= 1000000 then 'critico'
         when an.plata_en_juego >= 100000 then 'alerta'
         else 'sugerencia' end::nora_aviso_severidad,
    d.nombre,
    an.hecho || E'\n\n' ||
      case when an.plata_en_juego is not null
           then 'Plata en juego: $' || plata_texto(an.plata_en_juego) || '. '
           else '' end ||
      'De donde sale: ' || coalesce(an.como_se_calculo, 'sin procedencia') ||
      E'\n\nLo que esto NO dice: ' || d.que_no_dice,
    'deteccion', an.sucursal_id,
    'Ver', coalesce(d.aviso_href, '/admin'),
    jsonb_build_object('anomalia_id', an.id, 'detector', an.detector,
                       'producto_id', an.producto_id),
    'pendiente', 'deteccion:' || an.clave, false
  from anomalias an
  join detectores d on d.clave = an.detector
  where an.publicado_at >= now() - interval '2 minutes'
    and d.aviso_tipo is not null
  on conflict (clave_dedup) where estado = 'pendiente' and clave_dedup is not null
  do nothing;
  get diagnostics v_nuevos = row_count;

  update detectores d
     set activo = false,
         apagado_porque = mk.veredicto,
         apagado_at = now()
    from deteccion_marcador() mk
   where mk.detector = d.clave
     and d.activo
     and mk.se_puede_juzgar
     and mk.aciertos = 0;
  get diagnostics v_apagados = row_count;

  return jsonb_build_object(
    'corrio_en', now(),
    'encontrados', v_total,
    'publicados', v_publicados,
    'avisos_nuevos', v_nuevos,
    'esperando_en_la_lista_larga', v_esperando,
    'presupuesto', v_presupuesto,
    'descartes_que_volvieron', v_volvieron,
    'detectores_apagados', v_apagados,
    'por_detector', v_por_detector,
    'no_corrieron', v_no_corrieron,
    'silenciados', v_silenciados);
end;
$$;

revoke all on function public.deteccion_hallazgos(text, uuid, boolean, integer) from public, anon;
revoke all on function public.deteccion_correr() from public, anon;
grant execute on function public.deteccion_hallazgos(text, uuid, boolean, integer) to authenticated, service_role;
grant execute on function public.deteccion_correr() to service_role;
