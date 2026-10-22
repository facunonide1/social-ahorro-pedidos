-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0216 · EL ÍNDICE DEL MOSTRADOR                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── POR QUÉ EXISTE ESTA TABLA ───────────────────────────────────────────────
--
-- F.1 dice: «Responde en menos de dos segundos. Es un requisito, no una
-- aspiración. Si una consulta tarda más, se precalcula.»
--
-- Medido sobre `productos_catalogo` directo, con los índices de trigramas
-- puestos:
--
--   ibu .............. 4.101 ms
--   paracetamol ...... 1.876 ms
--   shampoo .......... 1.571 ms
--   amoxi ............ 1.301 ms
--   ibupirac ......... 1.202 ms
--   ibuprofeno 600 ..... 537 ms
--
-- «ibu» pasa el requisito al doble. El resto queda al borde, y «al borde» con
-- alguien esperando del otro lado del mostrador es lo mismo que afuera.
--
-- El problema es que la búsqueda mira tres columnas con OR y la similitud se
-- calcula para cada candidato. Eso no se arregla con otro índice: se arregla
-- precalculando una sola columna de texto por producto.
--
-- ── QUÉ TIENE Y QUÉ NO ──────────────────────────────────────────────────────
--
-- Una fila por producto, NO por producto y sucursal: multiplicar por cuatro
-- 48.217 filas para guardar un stock que cambia todos los días es al revés de
-- lo que conviene. El stock y el vencimiento se juntan en la consulta, que a
-- esa altura son joins por clave sobre 200 filas.
--
-- No guarda nada de personas. Es catálogo.

create table if not exists public.mostrador_indice (
  producto_id      uuid primary key references public.productos_catalogo(id) on delete cascade,
  sku              text not null,
  codigo_barras    text,
  nombre           text not null,
  nombre_comercial text,
  laboratorio      text,
  presentacion     text,
  droga_principal  text,
  -- La concentración que se pudo extraer del texto. Null cuando no se pudo.
  concentracion    text,

  precio           numeric,
  costo            numeric,
  -- Null cuando no hay costo. NO cero: cero sería una afirmación sobre el
  -- margen de 23.319 productos.
  margen_pct       numeric,

  condicion_venta  text,
  requiere_receta  boolean not null default false,
  es_controlado    boolean not null default false,

  -- Todo lo que se puede escribir para encontrarlo, en una sola columna,
  -- normalizada sin acentos. Es lo único que mira la búsqueda.
  busqueda         text not null,
  -- El nombre comercial ya normalizado: es contra esta columna que se decide
  -- «pidió esta marca», que es lo único que puede dar vuelta el orden entero.
  -- Calcularlo al vuelo costaba 631 ms sobre 48.217 filas (ver 0218).
  comercial_norm   text,
  -- Los números que aparecen en el nombre o la presentación: «600», «20».
  -- Van aparte porque son lo que el cliente dice en voz alta y lo único que no
  -- se puede aproximar.
  numeros          text[],

  calculado_at     timestamptz not null default now()
);

-- El GIN de trigramas sobre UNA columna, que es la diferencia.
create index if not exists mostrador_indice_trgm
  on public.mostrador_indice using gin (busqueda gin_trgm_ops);
-- Y el prefijo para las consultas cortas, que por trigramas son ruido.
create index if not exists mostrador_indice_prefijo
  on public.mostrador_indice (busqueda text_pattern_ops);
create index if not exists mostrador_indice_barras
  on public.mostrador_indice (codigo_barras) where codigo_barras is not null;
create index if not exists mostrador_indice_droga
  on public.mostrador_indice (droga_principal) where droga_principal is not null;
create index if not exists mostrador_indice_comercial_norm
  on public.mostrador_indice (comercial_norm text_pattern_ops)
  where comercial_norm is not null;

comment on table public.mostrador_indice is
  'Catalogo aplanado para la busqueda del mostrador. Una fila por producto. Existe porque la busqueda directa tardaba 4,1 s en «ibu» y el requisito es menos de 2 s con alguien esperando. No guarda nada de personas.';
comment on column public.mostrador_indice.busqueda is
  'nombre + comercial + droga + presentacion + lab + sku, sin acentos. Es lo unico que mira la busqueda: tres columnas con OR es lo que la hacia lenta.';

create or replace function public.mostrador_indice_refrescar()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $$
declare
  v_n int;
  v_inicio timestamptz := clock_timestamp();
begin
  -- Se reemplaza entera. Es una tabla derivada de 48.217 filas: un diff
  -- incremental sería más código y más formas de desincronizarse.
  delete from mostrador_indice;

  insert into mostrador_indice (
    producto_id, sku, codigo_barras, nombre, nombre_comercial, laboratorio,
    presentacion, droga_principal, concentracion, precio, costo, margen_pct,
    condicion_venta, requiere_receta, es_controlado, busqueda, comercial_norm, numeros
  )
  select
    p.id, p.sku, p.codigo_barras, p.nombre, p.nombre_comercial, p.laboratorio,
    p.presentacion, p.droga_principal,
    (regexp_match(
      lower(coalesce(p.presentacion, '') || ' ' || coalesce(p.nombre, '')),
      '([0-9]+(?:[.,][0-9]+)?\s*(?:mg|mcg|g|ml|ui|%))'))[1],
    p.precio_sugerido, p.precio_costo_promedio,
    case when p.precio_costo_promedio is not null and p.precio_costo_promedio > 0
              and p.precio_sugerido is not null and p.precio_sugerido > 0
         then round((p.precio_sugerido - p.precio_costo_promedio) / p.precio_sugerido * 100, 1)
    end,
    p.condicion_venta,
    p.condicion_venta in ('requiere_receta', 'receta_archivada', 'estupefaciente_psico_ii'),
    mostrador_es_controlado(p.es_controlado, p.condicion_venta),
    convenio_normalizar(
      coalesce(p.nombre, '') || ' ' || coalesce(p.nombre_comercial, '') || ' ' ||
      coalesce(p.droga_principal, '') || ' ' || coalesce(p.presentacion, '') || ' ' ||
      coalesce(p.laboratorio, '') || ' ' || coalesce(p.sku, '')),
    convenio_normalizar(coalesce(p.nombre_comercial, '')),
    (select array_agg(distinct w)
       from regexp_split_to_table(
              lower(coalesce(p.presentacion, '') || ' ' || coalesce(p.nombre, '')),
              '[^0-9]+') w
      where w <> '' and length(w) <= 5)
  from productos_catalogo p
  where p.activo and not p.es_demo;

  select count(*) into v_n from mostrador_indice;
  analyze mostrador_indice;

  return jsonb_build_object(
    'productos', v_n,
    'con_monodroga', (select count(*) from mostrador_indice where droga_principal is not null),
    'con_concentracion', (select count(*) from mostrador_indice where concentracion is not null),
    'sin_costo', (select count(*) from mostrador_indice where costo is null),
    'controlados_fuera_de_la_lista', (select count(*) from mostrador_indice where es_controlado),
    'tardo_ms', round(extract(milliseconds from clock_timestamp() - v_inicio))
  );
end $$;

comment on function public.mostrador_indice_refrescar() is
  'Rearma el indice del mostrador desde el catalogo. Lo corre el cron diario y el importador del maestro: el catalogo cambia cuando entra un maestro, no cada vez que alguien busca.';

revoke all on function public.mostrador_indice_refrescar() from public, anon, authenticated;
grant execute on function public.mostrador_indice_refrescar() to service_role;

alter table public.mostrador_indice enable row level security;

-- Lo lee cualquiera que esté adentro: es el catálogo, y el catálogo ya lo ve
-- todo el mundo. Lo que NO viaja al navegador es el margen, y eso lo decide la
-- ruta con el rol (ver app/api/mostrador/route.ts y F.7).
drop policy if exists mostrador_indice_ver on public.mostrador_indice;
create policy mostrador_indice_ver on public.mostrador_indice
  for select to authenticated using (true);
