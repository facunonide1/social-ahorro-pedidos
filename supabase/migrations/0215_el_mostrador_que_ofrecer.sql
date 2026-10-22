-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0215 · EL MOSTRADOR · QUÉ OFRECER                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── LA LÍNEA QUE NO SE CRUZA ────────────────────────────────────────────────
--
-- Esto contesta sobre el PRODUCTO. No contesta sobre el tratamiento.
--
-- Recibe un texto y devuelve productos del catálogo con su stock, su precio y
-- por qué estarían primeros. No recibe ni guarda síntoma, diagnóstico ni
-- motivo de compra, y no hay columna donde ponerlos.
--
-- El motivo práctico pesa más que el legal: si el empleado le pregunta a una
-- pantalla qué darle a alguien, el responsable dejó de ser una persona.

-- Los trigramas sobre nombre ya existían. Faltan los otros dos campos por los
-- que se busca de verdad. (El índice del mostrador de 0216 los reemplaza para
-- la búsqueda, pero quedan porque los usa `catalogo_pagina`.)
create index if not exists productos_droga_trgm_idx
  on public.productos_catalogo using gin (droga_principal gin_trgm_ops);
create index if not exists productos_comercial_trgm_idx
  on public.productos_catalogo using gin (nombre_comercial gin_trgm_ops);
create index if not exists productos_nombre_lower_idx
  on public.productos_catalogo (lower(nombre) text_pattern_ops);
create index if not exists productos_droga_lower_idx
  on public.productos_catalogo (lower(droga_principal) text_pattern_ops);

-- El vencimiento por producto y sucursal. El índice que había era sólo por
-- fecha: para preguntar «cuándo vence lo que tengo de ESTE producto ACÁ» hacía
-- un scan.
create index if not exists lotes_prod_suc_venc_idx
  on public.lotes_productos (producto_id, sucursal_id, fecha_vencimiento)
  where cantidad_actual > 0 and fecha_vencimiento is not null;

-- ── QUÉ ES UN CONTROLADO, PARA EL MOSTRADOR ─────────────────────────────────
--
-- A.3 · «Los controlados no aparecen en la lista general.»
--
-- Y acá hay un hallazgo: `es_controlado` marca 3.649 productos, pero
-- `condicion_venta` dice que 3.797 son de receta archivada y 106 son
-- estupefacientes o psicotrópicos II. **Los dos campos no coinciden.**
--
-- Para el mostrador se usa la definición ANCHA: lo que cualquiera de los dos
-- marque, que son 5.134. En terreno legal-farmacéutico (regla de oro 9) el
-- error de mostrar uno de menos cuesta una consulta; el de mostrar uno de más
-- cuesta una inspección.
create or replace function public.mostrador_es_controlado(
  p_es_controlado boolean, p_condicion text
)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_es_controlado, false)
      or p_condicion in ('receta_archivada', 'estupefaciente_psico_ii');
$$;

comment on function public.mostrador_es_controlado(boolean, text) is
  'Definicion ancha: lo que marque es_controlado O condicion_venta. Los dos campos no coinciden (3.649 vs 3.903) y en terreno legal se peca de mas.';

-- ── A.5 · QUÉ NO SE PUEDE ORDENAR, Y POR QUÉ ────────────────────────────────
--
-- La pantalla tiene que decirlo. Un orden que no puede usar un criterio y no
-- lo dice se lee como un orden completo, y el empleado cree que el primero es
-- el que más deja cuando en realidad es el que más se vende.

create or replace function public.mostrador_que_no_se_puede_ordenar(p_sucursal uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'productos', (select count(*) from productos_catalogo where activo and not es_demo),
    'sin_costo', (select count(*) from productos_catalogo
                   where activo and not es_demo and precio_costo_promedio is null),
    'con_costo', (select count(*) from productos_catalogo
                   where activo and not es_demo and precio_costo_promedio is not null),
    'con_vencimiento', (select count(distinct producto_id) from lotes_productos
                         where fecha_vencimiento is not null
                           and (p_sucursal is null or sucursal_id = p_sucursal)),
    'con_ventas', (select count(distinct producto_id) from demanda_por_sucursal
                    where p_sucursal is null or sucursal_id = p_sucursal),
    'stock_leido_at', (select max(leido_at) from producto_stock_sifaco)
  );
$$;

comment on function public.mostrador_que_no_se_puede_ordenar(uuid) is
  'A.5 · Sobre cuantos productos se puede aplicar cada criterio del orden. La pantalla lo dice: un orden que no puede usar un criterio y no lo avisa se lee como un orden completo.';

revoke all on function public.mostrador_que_no_se_puede_ordenar(uuid) from public, anon;
revoke all on function public.mostrador_es_controlado(boolean, text) from public, anon;
grant execute on function public.mostrador_que_no_se_puede_ordenar(uuid) to authenticated, service_role;
grant execute on function public.mostrador_es_controlado(boolean, text) to authenticated, service_role;

-- NOTA · La primera versión de `mostrador_buscar` vivía acá, leyendo
-- `productos_catalogo` directo. Tardaba 4,1 s en «ibu» y el requisito son 2 s.
-- La versión que quedó lee de `mostrador_indice`: ver 0216, 0217 y 0218.
