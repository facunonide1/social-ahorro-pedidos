-- ÍNDICES QUE LES FALTAN A LAS FOREIGN KEYS · SÓLO LECTURA.
--
-- Los advisors de Supabase marcan 346 foreign keys sin índice. Sin índice, un
-- join o un filtro por la columna de la FK recorre la tabla entera, y un
-- DELETE/UPDATE en la tabla padre recorre la hija para chequear la FK. Es una
-- de las dos causas de fondo de los timeouts (la otra es decisiones_pendientes).
--
-- Esta consulta NO crea nada. Devuelve, por cada FK sin un índice que empiece
-- por sus columnas (en el mismo orden), la sentencia para crearlo, ordenada
-- por el tamaño de la tabla: las más grandes primero, que son las que más
-- duelen y las que más tarda indexar.
--
-- Cómo se usa (lo hace una persona, con firma):
--   1. Correrla en el SQL editor de Supabase (es sólo lectura).
--   2. Revisar la lista. Las tablas chicas (pocas filas) casi no ganan nada.
--   3. Correr las sentencias UNA POR UNA, fuera de una transacción: `create
--      index concurrently` no bloquea escrituras pero no puede ir dentro de
--      un BEGIN/COMMIT (y el SQL editor de Supabase envuelve en transacción
--      si se pegan varias juntas). Si una falla, deja un índice INVALID: se
--      borra con `drop index concurrently` y se reintenta.
--
-- El rollback de cada una es `drop index concurrently if exists <nombre>;`
-- (va en la misma fila, columna `rollback`).

with fks as (
  select
    c.conrelid,
    c.conname,
    c.conkey,
    n.nspname  as esquema,
    t.relname  as tabla,
    array_agg(a.attname order by k.ord) as columnas
  from pg_constraint c
  join pg_class t      on t.oid = c.conrelid
  join pg_namespace n  on n.oid = t.relnamespace
  cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = k.attnum
  where c.contype = 'f'
    and n.nspname = 'public'
  group by c.conrelid, c.conname, c.conkey, n.nspname, t.relname
),
sin_indice as (
  select f.*
  from fks f
  where not exists (
    select 1
    from pg_index i
    where i.indrelid = f.conrelid
      and i.indisvalid
      -- el índice empieza por las columnas de la FK, en el mismo orden
      and (string_to_array(i.indkey::text, ' ')::smallint[])[1:array_length(f.conkey, 1)] = f.conkey
  )
)
select
  s.tabla,
  s.columnas,
  s.conname as foreign_key,
  pg_size_pretty(pg_total_relation_size(s.conrelid)) as tamano,
  (select reltuples::bigint from pg_class where oid = s.conrelid) as filas_estimadas,
  format('create index concurrently if not exists %I on %I.%I (%s);',
         left('ix_fk_' || s.tabla || '_' || array_to_string(s.columnas, '_'), 63),
         s.esquema, s.tabla,
         (select string_agg(quote_ident(col), ', ') from unnest(s.columnas) col)) as crear,
  format('drop index concurrently if exists %I.%I;',
         s.esquema,
         left('ix_fk_' || s.tabla || '_' || array_to_string(s.columnas, '_'), 63)) as rollback
from sin_indice s
order by pg_total_relation_size(s.conrelid) desc, s.tabla, s.conname;
