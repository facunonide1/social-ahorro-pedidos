-- 0167 · v0.91-pedidos · BLOQUE B
--
-- 16.022 PRODUCTOS SIN PRECIO QUE SÍ TENÍAN PRECIO.
--
-- `productos_catalogo.precio_sugerido` estaba cargado en 28.657 de 46.009. Los
-- otros no tenían con qué armar un renglón de pedido.
--
-- El maestro trae DOS columnas de precio y el catálogo se cargó sólo de una:
--
--   prec_vta  → 28.682 filas con valor
--   publico   → 44.704 filas con valor
--
-- No son dos precios distintos: **en las 28.682 filas donde están las dos, el
-- valor es idéntico en las 28.682**. Ninguna difiere. `publico` es la misma
-- columna con 16.022 filas más cargadas.
--
-- Por eso esto no es adivinar cuál usar: es completar los nulos con el mismo
-- número. Los 1.331 que no tienen ninguna de las dos siguen sin precio, y el
-- buscador lo dice — no muestra $0, que es una afirmación distinta.
--
-- SIFACO sigue siendo la autoridad del precio (regla de oro 1): esto lee el
-- archivo de SIFACO, no calcula nada.
update productos_catalogo p
   set precio_sugerido = s.publico,
       updated_at      = now()
  from sifaco_maestro_staging s
 where s.codigo = p.sku
   and not p.es_demo
   and p.precio_sugerido is null
   and coalesce(s.publico, 0) > 0;
