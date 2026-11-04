#!/usr/bin/env bash
# Prueba la 0294 (comparador de precios) de ida y vuelta contra un Postgres LOCAL en Docker.
#
#   bash scripts/precios-probar-migracion.sh
#
# No es staging: el esquema de NORA se imita con lo mínimo que la 0294 referencia (proveedores,
# productos_catalogo, auth.users y los roles de Supabase). Prueba que el up aplica, que las reglas de
# plausibilidad y mejor_proveedor dicen lo que tienen que decir, que authenticated no puede ejecutar
# nada, que el down deja la base como estaba y que se puede volver a subir. No toca nada remoto.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
UP="$RAIZ/supabase/migrations/0294_el_comparador_de_precios.sql"
DOWN="$RAIZ/supabase/down/0294_el_comparador_de_precios.down.sql"
NOMBRE="nora-precios-prueba-$$"

docker run -d --rm --name "$NOMBRE" -e POSTGRES_PASSWORD=local -e POSTGRES_DB=nora postgres:17-alpine >/dev/null
trap 'docker stop "$NOMBRE" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do docker exec "$NOMBRE" pg_isready -U postgres -d nora >/dev/null 2>&1 && break; sleep 1; done
sleep 1

sql() { docker exec -i "$NOMBRE" psql -v ON_ERROR_STOP=1 -q -t -o /dev/null -U postgres -d nora "$@" 2>&1 | sed -n -e "s/.*NOTICE:  //p" -e "/ERROR/p"; }

echo "== esquema mínimo que imita a NORA =="
sql <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create table public.proveedores (
  id uuid primary key default gen_random_uuid(), razon_social text, nombre_comercial text, cuit text,
  activo boolean default true, es_demo boolean default false, es_drogueria boolean default true);
create table public.productos_catalogo (
  id uuid primary key default gen_random_uuid(), nombre text, codigo_barras text,
  precio_costo_promedio numeric, es_demo boolean default false);
-- el default privilege que tiene NORA: authenticated recibe EXECUTE de todo lo nuevo
alter default privileges in schema public grant execute on functions to authenticated;
SQL

echo "== up =="
sql < "$UP"

echo "== las reglas, el ingreso y la comparación =="
sql <<'SQL'
create function pg_temp.esperar(cond boolean, que text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FALLA: %', que; end if;
  raise notice 'ok    %', que;
end $$;

-- plausibilidad
select pg_temp.esperar((select estado from precios_plausibilidad(null, now(), 100, null)) = 'rechazado', 'precio null → rechazado');
select pg_temp.esperar((select estado from precios_plausibilidad(0, now(), 100, null)) = 'rechazado', 'precio 0 → rechazado');
select pg_temp.esperar((select estado from precios_plausibilidad(100, null, 100, null)) = 'rechazado', 'sin fecha → rechazado');
select pg_temp.esperar((select estado from precios_plausibilidad(100, now() + interval '2 days', 100, null)) = 'rechazado', 'fecha futura → rechazado');
select pg_temp.esperar((select motivos[1] from precios_plausibilidad(100, now() - interval '10 days', 100, null)) = 'se leyó hace 10 días', 'lectura de hace 10 días → sospechoso, dicho con el hecho');
select pg_temp.esperar((select motivos[1] from precios_plausibilidad(420, now(), 100, null)) = 'es 4.2 veces el costo promedio', '4,2 veces el costo → sospechoso');
select pg_temp.esperar((select estado from precios_plausibilidad(20, now(), 100, null)) = 'sospechoso', 'menos de un tercio del costo → sospechoso');
select pg_temp.esperar((select motivos[1] from precios_plausibilidad(150, now(), null, 100)) like 'cambió 50%%', '+50% contra la última lectura → sospechoso');
select pg_temp.esperar((select estado from precios_plausibilidad(110, now(), 100, 100)) = 'aceptado', 'precio razonable → aceptado');

-- datos
insert into proveedores (razon_social, nombre_comercial, cuit) values
  ('DROGUERIA DEL SUD SA', 'Del Sud', '30-12345678-9'), ('MONROE AMERICANA SA', 'Monroe', '30-87654321-0');
insert into productos_catalogo (nombre, codigo_barras, precio_costo_promedio) values
  ('IBUPIRAC 600 x 10', '7790001000011', 2500), ('SOLO UNO', '7790001000028', 1000);

select pg_temp.esperar((precios_ingestar('grok_bot', 'prueba', jsonb_build_array(
  jsonb_build_object('proveedor', 'Del Sud', 'cuit', '30123456789', 'codigo_barras', '7790001000011', 'precio', 3210.50, 'capturado_at', now()::text),
  jsonb_build_object('proveedor', 'Monroe', 'codigo_barras', '7790001000011', 'precio', 3300, 'capturado_at', now()::text),
  jsonb_build_object('proveedor', 'Nadie SA', 'codigo_barras', '7790001000011', 'precio', 3000, 'capturado_at', now()::text),
  jsonb_build_object('proveedor', 'Del Sud', 'cuit', '30123456789', 'codigo_barras', '7790001000011', 'precio', null, 'capturado_at', now()::text),
  jsonb_build_object('proveedor', 'Del Sud', 'cuit', '30123456789', 'codigo_barras', '7790001000028', 'precio', 1100, 'capturado_at', now()::text)
)) ->> 'filas')::int = 5, 'ingesta de 5 filas');
select pg_temp.esperar((select aceptadas = 3 and rechazadas = 1 and sin_reconocer = 1 from precios_ingestas), '3 aceptadas, 1 rechazada, 1 sin reconocer');
select pg_temp.esperar((select motivos[1] from precios_proveedores where proveedor_texto = 'Nadie SA') like 'no reconozco al proveedor%', 'el proveedor desconocido dice por qué');

-- comparación
select pg_temp.esperar((select mejor_proveedor(id) -> 'mejor' ->> 'proveedor' from productos_catalogo where codigo_barras = '7790001000011') = 'Del Sud', 'el mejor es Del Sud');
select pg_temp.esperar((select (mejor_proveedor(id) ->> 'ahorro_contra_el_segundo')::numeric from productos_catalogo where codigo_barras = '7790001000011') = 89.50, 'ahorro contra el segundo: 89,50');
select pg_temp.esperar((select mejor_proveedor(id) ->> 'por_que_no' from productos_catalogo where codigo_barras = '7790001000028') like 'hay un solo proveedor%', 'con un solo proveedor lo dice');
select pg_temp.esperar((select mejor_proveedor(gen_random_uuid()) -> 'mejor' = 'null'::jsonb and mejor_proveedor(gen_random_uuid()) ->> 'por_que_no' like 'no hay precios%'), 'sin lecturas: mejor null con el motivo, no cero');

-- un precio 4 veces más caro que la última lectura aceptada no entra a la comparación
select precios_ingestar('sheets', 'prueba', jsonb_build_array(
  jsonb_build_object('proveedor', 'Monroe', 'codigo_barras', '7790001000011', 'precio', 9000, 'capturado_at', now()::text)));
select pg_temp.esperar((select mejor_proveedor(id) -> 'segundo' ->> 'precio' from productos_catalogo where codigo_barras = '7790001000011') = '3300.00', 'la lectura sospechosa no reemplaza a la aceptada');

-- permisos: authenticated no puede ejecutar nada de esto, aunque el default privilege se lo dé
select pg_temp.esperar(not has_function_privilege('authenticated', 'public.precios_ingestar(text,text,jsonb,uuid)', 'execute'), 'authenticated no ejecuta precios_ingestar');
select pg_temp.esperar(not has_function_privilege('authenticated', 'public.mejor_proveedor(uuid,integer)', 'execute'), 'authenticated no ejecuta mejor_proveedor');
select pg_temp.esperar(not has_function_privilege('authenticated', 'public.precios_plausibilidad(numeric,timestamptz,numeric,numeric,timestamptz)', 'execute'), 'authenticated no ejecuta precios_plausibilidad');
select pg_temp.esperar((select relrowsecurity from pg_class where relname = 'precios_proveedores'), 'RLS activa en precios_proveedores');
SQL

echo "== down =="
sql < "$DOWN"
sql <<'SQL'
do $$ begin
  if to_regclass('public.precios_proveedores') is not null or to_regclass('public.precios_ingestas') is not null
     or to_regprocedure('public.mejor_proveedor(uuid,integer)') is not null
     or to_regprocedure('public.precios_ingestar(text,text,jsonb,uuid)') is not null
     or to_regprocedure('public.precios_plausibilidad(numeric,timestamptz,numeric,numeric,timestamptz)') is not null then
    raise exception 'FALLA: el down dejó objetos de la 0294';
  end if;
  if (select count(*) from public.proveedores) <> 2 then raise exception 'FALLA: el down tocó proveedores'; end if;
  raise notice 'ok    el down saca todo lo de la 0294 y no toca lo que existía';
end $$;
SQL

echo "== up otra vez (después del down) =="
sql < "$UP"
sql < "$DOWN"
echo "ok    up → down → up → down"
echo
echo "TODO BIEN"
