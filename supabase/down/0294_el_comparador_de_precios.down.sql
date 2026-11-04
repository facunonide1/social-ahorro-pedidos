-- DOWN de 0294 · el comparador de precios.
-- Saca solo lo que agregó la 0294, en orden inverso. No toca nada que existiera antes.
-- Probado contra un Postgres local con scripts/precios-probar-migracion.sh (up → down → up).

drop function if exists public.mejor_proveedor(uuid, integer);
drop function if exists public.precios_ingestar(text, text, jsonb, uuid);
drop function if exists public.precios_plausibilidad(numeric, timestamptz, numeric, numeric, timestamptz);
drop index if exists public.precios_proveedores_comparar;
drop table if exists public.precios_proveedores;
drop table if exists public.precios_ingestas;
