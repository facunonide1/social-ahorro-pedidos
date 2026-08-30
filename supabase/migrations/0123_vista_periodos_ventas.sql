-- 0123 · Los períodos de ventas, agregados (v0.83)
--
-- `producto_ventas_mensuales` tiene 598.117 filas y PostgREST devuelve 1000 por
-- respuesta. Preguntarle «qué meses hay cargados» leyendo filas devolvía uno o
-- dos, y la pantalla habría dicho «2 meses de ventas cargados» sin mentir a
-- propósito y sin que nadie lo pudiera notar.
--
-- Es el mismo corte silencioso que hizo parecer que 4.836 productos no cruzaban
-- contra compra_venta. Dos veces en una sesión: el límite de PostgREST no
-- avisa, y un resultado corto se lee como un hallazgo.

create or replace view public.producto_ventas_periodos as
select periodo, bool_or(parcial) as parcial, count(*) as productos, sum(unidades) as unidades
from public.producto_ventas_mensuales
group by periodo;

comment on view public.producto_ventas_periodos is
  'Los periodos cargados, agregados. Existe porque PostgREST devuelve 1000 filas por respuesta y la tabla tiene 598.117: pedir "los periodos distintos" leyendo filas devolvia uno o dos y parecia que faltaban meses.';
