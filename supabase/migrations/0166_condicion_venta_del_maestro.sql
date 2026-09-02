-- 0166 · v0.91-pedidos · BLOQUE B
--
-- LA REGLA 9 NO SE PODÍA APLICAR A 29.663 PRODUCTOS.
--
-- ── LO QUE SE ENCONTRÓ ──────────────────────────────────────────────────────
--
-- `productos_catalogo.condicion_venta` estaba cargada en 16.346 productos de
-- 46.009. Los otros 29.663 tenían `null` y `canal_abierto` en `null`: NORA no
-- sabía si se podían vender por un canal abierto.
--
-- El dato NO faltaba. La condición se había cargado sólo desde
-- `ofertas_24-8.csv` (16.383 filas). El maestro `pla_3d_24.csv` trae la columna
-- `vl` para las 46.035 filas y está en la base desde que se importó, guardada en
-- `sifaco_maestro_staging.extra->>'vl'`. Nunca se copió al catálogo.
--
-- Entre los 29.663 sin condición hay **4.631 con vl = 'N'**: productos que
-- SIFACO declara con receta y que el buscador de pedidos no tenía cómo marcar.
--
-- ── QUÉ HACE ESTA MIGRACIÓN, Y QUÉ NO ───────────────────────────────────────
--
-- Completa SÓLO los `null`. No pisa lo que ya estaba, a propósito: hay 3.903
-- productos donde el archivo de ofertas dice `receta_archivada` o
-- `estupefaciente_psico_ii` y el maestro dice apenas `N`. Las dos son «no se
-- vende por canal abierto», pero la primera es más específica. Pisarla con la
-- del maestro sería perder información sobre terreno legal.

-- `vl = '0'` aparece en dos productos y SIFACO no documenta qué significa. Se
-- declara como no publicable hasta que alguien lo confirme — el mismo criterio
-- que se usó con el `vl = '5'` que apareció en v0.88.
insert into sifaco_condicion_venta (vl_sifaco, condicion, canal_abierto, nota)
select '0', 'sin_declarar', false,
       'aparecio en 2 productos del maestro. SIFACO no documenta que es: por las dudas NO se ofrece por canal abierto hasta que alguien lo confirme'
where not exists (select 1 from sifaco_condicion_venta where vl_sifaco = '0');

update productos_catalogo p
   set condicion_venta = m.condicion,
       canal_abierto   = m.canal_abierto,
       updated_at      = now()
  from sifaco_maestro_staging s
  join sifaco_condicion_venta m on m.vl_sifaco = coalesce(s.extra->>'vl', '')
 where s.codigo = p.sku
   and not p.es_demo
   and p.condicion_venta is null;
