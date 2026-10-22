-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0252 · EL MOSTRADOR NO PUBLICA: VENDE EL MAESTRO                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La primera corrida de `canales_estado()` dijo esto:
--
--   Mostrador · catalogo cargado · publicados 0 · nunca se registro una
--   sincronizacion
--
-- Las dos cosas estan mal, y por el mismo motivo: el mostrador no tiene
-- publicaciones. No hay nada que publicar — se vende lo que esta en el
-- maestro de SIFACO. Contar `canal_publicaciones` para el mostrador da cero
-- porque es la tabla equivocada.
--
-- Y «cero publicados» en el canal que mas vende es exactamente el tipo de
-- numero que hace que alguien deje de mirar la pantalla.
--
-- Medido despues del arreglo: 48.206 productos activos del maestro, con la
-- ultima importacion de ayer.
--
-- ── Y DE PASO, LOS DIAS ─────────────────────────────────────────────────────
--
-- La tienda propia no mueve un dato desde el **1 de septiembre**: 51 dias.
-- El estado decia la fecha y no decia que eso es mucho. Ahora lo dice, con el
-- numero y con el umbral de `dias_maestro_viejo` (7), que es el que el
-- proyecto ya usa para decidir cuando una foto esta vieja. Es G.5 del
-- agregado, contestado con el numero medido y no con «cinco meses».

drop function if exists public.canales_estado();

create function public.canales_estado()
returns table (
  canal_id text, nombre text, tipo text, activo boolean,
  catalogo_cargado boolean, publicados integer, activos integer, apagados integer,
  comision_pct numeric, comision_confirmada boolean, comision_de_donde text,
  recargo_pct numeric, recargo_cubre_comision boolean,
  ultima_sincronizacion timestamptz, dias_sin_mover integer, sincroniza_como text,
  de_donde_sale_el_conteo text, que_falta text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with umbral as (
    select coalesce((select max(valor)::int from compras_parametros
                      where clave = 'dias_maestro_viejo'), 7) as dias
  ),
  base as (
    select cv.*,
      case when cv.tipo = 'mostrador' then
        (select count(*)::integer from productos_catalogo p
          where p.activo and not p.es_demo and coalesce(p.es_producto, true))
      when cv.catalogo_cargado then
        (select count(*)::integer from canal_publicaciones cp where cp.canal_id = cv.id)
      end as n_pub,
      case when cv.tipo = 'mostrador' then
        (select count(*)::integer from productos_catalogo p
          where p.activo and not p.es_demo and coalesce(p.es_producto, true))
      when cv.catalogo_cargado then
        (select count(*)::integer from canal_publicaciones cp
          where cp.canal_id = cv.id and cp.estado = 'publish')
      end as n_act,
      case when cv.tipo = 'mostrador' then 0
      when cv.catalogo_cargado then
        (select count(*)::integer from canal_publicaciones cp
          where cp.canal_id = cv.id and cp.estado = 'draft')
      end as n_apa,
      case when cv.tipo = 'mostrador' then
        (select max(si.aplicado_at) from sifaco_importaciones si
          where si.aplicado_at is not null)
      when cv.catalogo_cargado then
        (select max(cp.leido_at) from canal_publicaciones cp where cp.canal_id = cv.id)
      end as sync,
      case when cv.tipo = 'mostrador'
           then 'los productos activos del maestro de SIFACO: el mostrador no publica, vende lo que esta cargado'
           when cv.catalogo_cargado
           then 'las publicaciones que trajo la ultima sincronizacion del canal'
           else null end as de_donde
    from canales_venta cv
  )
  select
    b.id, b.nombre, b.tipo, b.activo, b.catalogo_cargado,
    b.n_pub, b.n_act, b.n_apa,
    b.comision_pct, b.comision_confirmada, b.comision_de_donde,
    b.margen_extra_pct,
    case when b.comision_confirmada then b.margen_extra_pct >= b.comision_pct end,
    b.sync,
    case when b.sync is not null then (current_date - b.sync::date) end,
    b.sincroniza_como, b.de_donde,
    nullif(concat_ws(' · ',
      case when not b.catalogo_cargado
           then 'el catalogo no esta cargado: ' || coalesce(b.catalogo_como_se_carga, 'no quedo dicho como se carga') end,
      case when not b.comision_confirmada
           then 'la comision no esta confirmada: ' || coalesce(b.comision_de_donde, 'no quedo dicho de donde sale') end,
      case when b.catalogo_cargado and b.sync is null
           then 'nunca se registro una sincronizacion' end,
      case when b.sync is not null and (current_date - b.sync::date) > (select dias from umbral)
           then format('hace %s dias que no mueve un dato, y el umbral del proyecto para considerar una foto vieja es %s',
                       current_date - b.sync::date, (select dias from umbral)) end,
      case when b.sincroniza_como is null and b.catalogo_cargado
           then 'no entra solo: lo que se publique hay que cargarlo a mano' end
    ), '')
  from base b
  order by (b.tipo = 'mostrador') desc, b.activo desc, b.nombre;
$$;

comment on function public.canales_estado() is
  'A.5 y A.6 · Una fila por canal. El mostrador cuenta el maestro de SIFACO '
  'porque no publica: contar canal_publicaciones para el mostrador da cero, y '
  'cero publicados en el canal que mas vende es el numero que hace que alguien '
  'deje de mirar la pantalla. `publicados` es NULL cuando el catalogo no esta '
  'cargado: eso tampoco es cero.';

revoke all on function public.canales_estado() from public, anon, authenticated;
grant execute on function public.canales_estado() to service_role;
