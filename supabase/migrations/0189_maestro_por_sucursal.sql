-- 0189 · v0.96-sucursales · BLOQUE A · aplicada vía MCP
--
-- ════════════════════════════════════════════════════════════════════════════
-- LLEGÓ EL ARCHIVO QUE FALTABA, Y TRAJO UNA NOTICIA MALA
-- ════════════════════════════════════════════════════════════════════════════
--
-- `maestro sucursales 14-10.xls`, hoja **`tabla3e`**: es el archivo que viene
-- pedido desde v0.88 en «lo que falta para poder calcular por sucursal».
-- 48.127 filas × 59 columnas, stock y ventas abiertos por los cuatro locales.
--
-- ── LO QUE DESTRABA ─────────────────────────────────────────────────────────
--
--   · el stock por local                       (estaba en 480 filas de demo)
--   · los quiebres reales                      (no se podían ver)
--   · la transferencia antes de comprar        (escrita y apagada desde v0.94)
--   · la reserva sobre la sucursal correcta    (pesaba sobre el total)
--   · la sucursal de despacho                  (se configuraba a mano)
--
-- ── Y LO QUE DESCUBRE ───────────────────────────────────────────────────────
--
-- El valor al costo da $457.666.703 contra $266.374.988 del maestro de agosto:
-- un 72% más en seis semanas. La descomposición producto por producto dice que
-- $178,9 M de los $191 M son CANTIDAD de stock y no precios. Eso no se explica
-- con inflación ni con 2.195 productos nuevos, así que se buscó la causa:
--
--   · de los 2.041 productos con stock SÓLO fuera de Guzmán, el 79% tenía cero
--     en el maestro de agosto;
--   · de los 2.815 con stock SÓLO en Guzmán, apenas el 13% tenía cero, y las
--     unidades coinciden al 99,1% (69.662 contra 70.261);
--   · en los 5.080 productos con stock en más de un local donde Guzmán difiere
--     del total, agosto coincide con Guzmán 2.254 veces y con el total 295.
--
-- **El maestro de agosto traía el stock de Guzmán, no el de la cadena.** Todo
-- lo calculado desde v0.88 —los $266 M, la cobertura de 1,29 meses, los 3.392
-- ítems urgentes por $100,8 M— comparaba el stock de UNA sucursal contra las
-- ventas de las CUATRO. Ver docs/EL-MAESTRO-DE-AGOSTO-ERA-GUZMAN.md.
--
-- ════════════════════════════════════════════════════════════════════════════

-- ── A.4 · EL MAPEO DE SUCURSALES, DECLARADO ─────────────────────────────────
--
-- `sucursales.codigo_sifaco` existía desde hace versiones y estaba en null en
-- las cinco filas. Mientras estuvo vacío, ninguna importación por sucursal
-- podía escribir una fila sin inventarse a qué local pertenece.
--
-- No se dedujo: lo declaró Facundo el 21 de octubre de 2026. Los nombres del
-- sistema (Central / Norte / Sur / Este) son de relleno y no dicen qué local es
-- cuál, así que no había de dónde deducirlo.

update public.sucursales set codigo_sifaco = 'GUZ' where codigo = 'SA-01';
update public.sucursales set codigo_sifaco = 'FIG' where codigo = 'SA-02';
update public.sucursales set codigo_sifaco = 'ARA' where codigo = 'SA-03';
update public.sucursales set codigo_sifaco = 'TES' where codigo = 'SA-04';

-- El ecommerce queda en null a propósito: no es un local, no tiene stock
-- propio, y si algún día se le asigna un código va a ser una decisión.
create unique index if not exists sucursales_codigo_sifaco_unico
  on public.sucursales (codigo_sifaco) where codigo_sifaco is not null;

-- ── A.3 · LAS VENTAS POR SUCURSAL, EN SU PROPIA TABLA ───────────────────────
--
-- NO se le agregó `sucursal_id` a `producto_ventas_mensuales`. Esa tabla tiene
-- clave (producto_id, periodo) y la leen el plan de compra, las
-- recomendaciones, los dormidos y la cobertura. Con una columna nullable y las
-- cuatro filas por producto, cada suma que hoy funciona pasaría a contar cinco
-- veces lo mismo —el consolidado más las cuatro aperturas— y no fallaría: daría
-- un número más grande, que es la peor forma de fallar.

create table if not exists public.producto_ventas_sucursal (
  producto_id    uuid not null references public.productos_catalogo(id) on delete cascade,
  sucursal_id    uuid not null references public.sucursales(id),
  periodo        text not null,
  unidades       numeric not null default 0,
  -- El mes en curso viene cortado: 22.994 unidades contra ~50.000 de los
  -- cerrados. Mismo caso que `ago25` en el maestro anterior.
  parcial        boolean not null default false,
  importacion_id uuid references public.sifaco_importaciones(id) on delete set null,
  leido_at       timestamptz not null default now(),
  primary key (producto_id, sucursal_id, periodo)
);

-- ── LA PILA DE ORIGEN DEL LAYOUT NUEVO ──────────────────────────────────────
--
-- `sifaco_sucursal_staging`: 59 columnas resueltas POR NOMBRE contra el
-- encabezado real, no por índice. El criterio cambia con el archivo y está
-- escrito en lib/sifaco/columnas-sucursales.ts: los encabezados de `tabla3e`
-- son códigos ASCII que la codificación no toca, y un índice fijo para 59
-- columnas que nadie vio sería una suposición sobre el orden.
--
-- (DDL completo aplicado vía MCP: ver el archivo del módulo.)

-- ── A.2 · EL STOCK, Y UNA COLUMNA GENERADA ──────────────────────────────────
--
-- `stock_items.cantidad` es GENERADA: góndola + depósito. El archivo trae UN
-- número por sucursal sin abrir, y entra todo como góndola — no por comodidad:
-- las cuatro sucursales tienen `usa_deposito = false`, o sea que no hay
-- depósito separado que repartir.
--
-- `stock_minimo` queda en 0, que acá quiere decir SIN DECLARAR: este archivo no
-- trae punto de pedido por sucursal. Por eso el quiebre NO se define por mínimo
-- —daría cero, y cero es «lo miré y no hay»— sino por «vende acá y no tiene».

-- ── A.5 · EL `vl` CONSERVADO, CON UNA ASIMETRÍA ─────────────────────────────
--
-- Este archivo trae `vl` con dos valores donde agosto tenía cinco: receta (N),
-- receta archivada (3) y estupefaciente (4) llegan todos como `N`, y
-- perfumería, que era vacío, llega como `S`.
--
-- Se completan SÓLO los null, que es el criterio de la migración 0166 y por el
-- mismo motivo: 3.903 productos conservan `receta_archivada` o
-- `estupefaciente_psico_ii`, que el archivo nuevo habría aplanado. El libro de
-- estupefacientes no es el de recetas archivadas.
--
-- PERO la regla así, sin más, también conservaba lo que no hay que conservar:
-- 9 productos que teníamos como venta libre y canal abierto y que SIFACO AHORA
-- declara `N`. Uno —MEDEX INHALADOR, código 696001— estaba publicado en la
-- tienda. Otros dos son IBULGIA 600 mg, ibuprofeno de 600, que va con receta.
--
-- La asimetría: **cerrar es automático, abrir no.** Si SIFACO dice que algo no
-- se vende por canal abierto, se cierra. Que el archivo diga `S` sobre algo que
-- tenemos como `requiere_receta` NO alcanza para publicarlo: eso es regla 9 y
-- lo decide una persona. Hay 1 caso así (código -302681) y queda cerrado.
--
-- Después de aplicar: 0 productos abiertos que el archivo declara `N`.

-- ── LO QUE DEJÓ LA IMPORTACIÓN ──────────────────────────────────────────────
--
--   2.208  productos nuevos en el catálogo (2.195 códigos que agosto no traía)
-- 192.464  filas de stock por sucursal (48.116 × 4)
--  30.127  filas de ventas por sucursal y mes
--     480  filas de demostración de `stock_items`, borradas
--   2.208  condiciones de venta completadas (sólo las que estaban en null)
--       9  canales cerrados porque el archivo los declara con receta
--
-- Y lo que NO entró: las 11 filas de códigos repetidos. Se carga la primera
-- aparición y las otras quedan listadas. Pisar en silencio dejaría la última,
-- que no es más confiable que la primera: es la que quedó.
