-- 0140 · Los laboratorios, agregados en la base (v0.86)
--
-- La pantalla de stock armaba el filtro de laboratorio con los 5.000 productos
-- que trae acotados. Un laboratorio que apareciera recién en el producto 5.001
-- no figuraba, y no había forma de notarlo: el desplegable se ve completo
-- igual. Mismo caso que `catalogo_rubros` en v0.85.

create or replace view public.catalogo_laboratorios
with (security_invoker = true) as
select laboratorio, count(*) as productos
from public.productos_catalogo
where laboratorio is not null and btrim(laboratorio) <> '' and not es_demo and activo
group by laboratorio;
