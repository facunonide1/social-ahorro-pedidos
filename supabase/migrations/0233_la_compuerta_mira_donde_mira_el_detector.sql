-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0233 · LA COMPUERTA TIENE QUE MIRAR DONDE MIRA EL DETECTOR              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `prueba-deteccion.ts` encontro esto en la primera corrida:
--
--   MAL   B.5 devolvio 42 hallazgos y declaro que no puede correr
--
-- `deteccion_estado` contaba `avisos_faltante` —0 filas reales— y decia «no
-- hay ningun faltante registrado». El detector, en cambio, lee
-- `facturas_proveedor.faltantes_texto`, donde hay 56.
--
-- La compuerta y el detector miraban dos tablas distintas. Si la compuerta
-- hubiera ganado, B.5 habria quedado apagado para siempre con un motivo que
-- sonaba razonable; si gana el detector, la pantalla dice «no puede correr» al
-- lado de 42 hallazgos.
--
-- Es la misma forma del error que ya mordio antes en este proyecto: un select
-- contra el lugar equivocado devuelve cero, y cero se lee como «lo mire y no
-- hay». Por eso la prueba compara las dos cosas y no cada una por separado.

create or replace function public.deteccion_estado(p_detector text default null)
returns table (
  clave text, nombre text, familia text, historia_minima text,
  puede_correr boolean, por_que_no text, lo_que_hay text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with h as (
    select
      (select count(distinct importacion_id) from producto_stock_sifaco
        where sucursal_id is not null) as fotos_stock,
      (select count(*) from arqueos_caja where not es_demo) as arqueos_reales,
      (select count(*) from facturas_proveedor where not es_demo) as facturas,
      -- Donde el detector de B.5 busca de verdad.
      (select count(*) from facturas_proveedor
        where not es_demo and faltantes_texto is not null
          and btrim(faltantes_texto) <> '') as faltantes,
      (select count(*) from productos_catalogo where activo and not es_demo) as productos
  )
  select d.clave, d.nombre, d.familia::text, d.historia_minima,
    case d.clave
      when 'stock_no_cuadra' then h.fotos_stock >= 2
      when 'caja_diferencias_repetidas' then h.arqueos_reales >= 5
      when 'comprobante_duplicado' then h.facturas > 0
      when 'monto_fuera_de_lo_habitual' then h.facturas >= 5
      when 'faltante_sin_nota_credito' then h.faltantes > 0
      else true
    end,
    case d.clave
      when 'stock_no_cuadra' then
        case when h.fotos_stock < 2 then
          format('hay %s foto de stock por sucursal y hacen falta 2 para comparar. El maestro de agosto no trae apertura por sucursal: la primera con apertura es la del 14/10', h.fotos_stock)
        end
      when 'caja_diferencias_repetidas' then
        case when h.arqueos_reales < 5 then
          format('hay %s arqueos reales. Los que estan cargados son de demostracion', h.arqueos_reales)
        end
      when 'comprobante_duplicado' then
        case when h.facturas = 0 then 'no hay comprobantes cargados' end
      when 'monto_fuera_de_lo_habitual' then
        case when h.facturas < 5 then 'hacen falta al menos 5 facturas para saber que es lo habitual' end
      when 'faltante_sin_nota_credito' then
        case when h.faltantes = 0 then 'ningun comprobante declaro un faltante' end
    end,
    case d.clave
      when 'stock_no_cuadra' then format('%s foto(s) de stock por sucursal', h.fotos_stock)
      when 'caja_diferencias_repetidas' then format('%s arqueos reales', h.arqueos_reales)
      when 'comprobante_duplicado' then format('%s comprobantes', h.facturas)
      when 'monto_fuera_de_lo_habitual' then format('%s comprobantes', h.facturas)
      when 'faltante_sin_nota_credito' then
        format('%s comprobantes con un faltante escrito a mano', h.faltantes)
      else format('%s productos en el catalogo', h.productos)
    end
  from detectores d, h
  where d.activo and (p_detector is null or d.clave = p_detector)
  order by d.orden;
$$;

comment on function public.deteccion_estado(text) is
  'C.7 · Si cada detector tiene con que hablar. Cada compuerta cuenta en la '
  'misma tabla donde busca su detector: cuando no, una devuelve cero y la otra '
  'devuelve 42, y cero se lee como «lo mire y no hay».';

revoke all on function public.deteccion_estado(text) from public, anon;
grant execute on function public.deteccion_estado(text) to authenticated, service_role;
