-- EL ESQUEMA QUE VIVE SÓLO EN LA BASE · SÓLO LECTURA.
--
-- Estas piezas se aplicaron a mano (o por MCP) y no están en ninguna
-- migración del repo. Sin su definición no se puede arreglar
-- decisiones_pendientes (A4), aplicar el maestro por sucursal (C1) ni revisar
-- el auditor de RLS. Esta consulta devuelve el DDL actual de cada una para
-- guardarlo en supabase/esquema-vivo/ como referencia (no como migración).
--
-- Correr y copiar el resultado de la columna `ddl`.

select 'vista' as tipo, c.relname as nombre,
       format('create or replace view public.%I as%s', c.relname, pg_get_viewdef(c.oid, true)) as ddl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
  and c.relname in ('decisiones_pendientes')
union all
select 'funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('proveedores_detectar', 'sifaco_aplicar_maestro', 'sifaco_aplicar_sucursales',
                    'rls_escrituras_que_dan_lectura')
union all
select 'tabla', c.relname,
       'create table public.' || quote_ident(c.relname) || ' (' || string_agg(
         format('%I %s%s', a.attname, format_type(a.atttypid, a.atttypmod), case when a.attnotnull then ' not null' else '' end),
         ', ' order by a.attnum) || ');'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('producto_stock_sifaco')
group by c.relname
order by 1, 2;
