-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0224 · LA NORMALIZACIÓN TIENE QUE COLAPSAR LOS ESPACIOS                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `convenio_normalizar` reemplazaba cada carácter raro por UN espacio, así que
-- «CREMA  FACIAL coreana» quedaba con dos espacios y «crema facial coreana»
-- con uno. Dos textos que una persona lee como el mismo quedaban distintos.
--
-- Lo encontró la prueba del bloque D: tres pedidos del mismo producto que no
-- está en el catálogo se contaron como tres cosas distintas, en vez de «me lo
-- pidieron tres veces». Y eso es justo lo que la vista viene a contar.
--
-- Afecta también al mostrador, donde «ibu  profeno» no habría encontrado nada,
-- y a los motivos de débito de la v1.1 por la misma razón.
--
-- Se arregla la función y **se rearma el índice del mostrador**, que guarda el
-- texto ya normalizado: sin eso las filas viejas tendrían el valor viejo y la
-- búsqueda compararía manzanas con peras.

create or replace function public.convenio_normalizar(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select btrim(regexp_replace(
    regexp_replace(
      lower(translate(coalesce(p, ''),
        'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
      '[^a-z0-9 ]', ' ', 'g'),
    -- Lo que faltaba: varios espacios son uno.
    '\s+', ' ', 'g'));
$$;

comment on function public.convenio_normalizar(text) is
  'Minusculas, sin acentos, sin simbolos y con los espacios colapsados. Lo ultimo faltaba y hacia que «CREMA  FACIAL» y «crema facial» se contaran como dos cosas distintas.';

update public.demanda_invisible
   set texto_norm = convenio_normalizar(coalesce(texto_pedido, ''))
 where texto_pedido is not null;

-- Y el índice del mostrador, que guarda `busqueda` y `comercial_norm` ya
-- normalizados. Se corre a mano después de aplicar esta migración:
--   select public.mostrador_indice_refrescar();
