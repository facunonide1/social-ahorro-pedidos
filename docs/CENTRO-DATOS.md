# 🔌 Centro de Datos · Puente bidireccional con SIFACO

> NORA HQ **convive** con SIFACO (sistema de facturación/stock legacy, **NO se
> reemplaza**). El intercambio es **por archivos**: SIFACO exporta → NORA importa
> (productos, stock, ventas, clientes); NORA genera archivos en el formato exacto
> que SIFACO espera (ofertas/precios, diferencias de stock). Antesala de la
> integración directa **F20** (los perfiles/mapeos son reutilizables por una
> conexión directa futura).

**Ruta:** `/admin/centro-datos` · **Roles:** super_admin / gerente · Migraciones
`0057` (schema), `0058` (perfiles de sistema), `0059` (agregación de ventas).

**Llave maestra de match en todo el sistema: `CODIGO` (= SKU interno).**
El match es siempre `CODIGO → BARRAS (EAN) → nombre`. Lo que no matchea **no se
descarta**: va a la cola "Sin matchear".

---

## Formato real de SIFACO (export de productos)

`.xls` binario, **26 columnas**, ~5.400 productos. SheetJS (`xlsx`) lee `.xls`,
`.xlsx`, `.csv` y `.txt` (el importador acepta los 4). Columnas:

| Columna | Campo del sistema | Notas |
|---------|-------------------|-------|
| `CODIGO` | `sku` | **LA LLAVE** (cód. interno SIFACO) |
| `BARRAS` | `codigo_barras` | EAN |
| `DESCRIP` | `nombre` | |
| `PRECIO` | `precio` → `productos_catalogo.precio_sugerido` | |
| `STOCK` | `stock` → `stock_items.cantidad_gondola` | góndola por defecto, por sucursal elegida |
| `RUBRO` | `rubro` | |
| `ESTADO`, `TIPO` | `estado`, `tipo` | |
| `MES_ACT` | `venta_mes` | venta del mes actual |
| `ANT_1`..`ANT_6` | `ant_1`..`ant_6` | ventas de los 6 meses previos |
| `NOM_PROMO`, `DEF_PROMO` | `nom_promo`, `def_promo` | promo activa (puente para exportar ofertas) |
| `NOM_LAB`, `NUM_LAB` | `laboratorio` | |
| `DROGA` | `droga` → `droga_principal` | principio activo |
| `DESCU`, `RECAR` | `descuento`, `recargo` | |

`MES_ACT + ANT_1..6` se guardan en `productos_catalogo.ventas_mensuales` (jsonb,
acumulado) y alimentan dinero dormido / análisis. La **fuente fina** de ventas es
`ventas_diarias` (por sucursal y día), que se carga aparte.

---

## Modelo de datos (migración 0057)

- **`perfiles_datos`** — perfil de mapeo reutilizable: `direccion` (import/export),
  `tipo`, `formato`, `mapeo_columnas` (jsonb), `opciones` (separador/decimales/
  encabezado), `frecuencia`, `es_sistema`, `es_demo`. **Import:** `{columna_archivo:
  campo_sistema}`. **Export:** `{campo_sistema: columna_salida}`.
- **`import_jobs`** — historial de importaciones: filas ok/fallidas/sin_match,
  `anomalias` (semáforo), `resumen` (explicación NORA + cambios), `snapshot_id`,
  `estado` (preview/aplicado/revertido/error), `archivo_hash` (idempotencia).
- **`snapshots_import`** — estado previo de las filas afectadas (rollback). Cada
  fila: `{ pk, datos_previos | null(no existía) }` por tabla.
- **`export_jobs`** — historial de exportaciones.
- **`acciones_export`** — botón de exportación: `query_definicion` (entidad +
  filtros + columnas), `perfil_formato_id`, `es_sistema`/`es_demo`.
- **`ventas_diarias`** — fuente fina: `UNIQUE(fecha, sucursal_id, sku)`. Distinta
  por sucursal. Funciones SQL (`0059`): `cd_ranking_vendidos`, `cd_totales_sucursal`,
  `cd_resumen_ventas`.
- **`items_sin_match`** — cola: crear nuevo / vincular / ignorar (con backfill de
  `ventas_diarias.producto_id` por SKU al resolver).

RLS: lectura = admin activo; escritura = super_admin/gerente. Quien carga queda
registrado (`por_usuario`).

---

## Perfiles y acciones de sistema (migración 0058, siempre presentes)

**Import:** `Productos SIFACO` (cada 2hs · catálogo+stock+ventas mes),
`Ventas diarias por sucursal` (diaria), `Clientes SIFACO` (semanal).
**Formato export:** `Ofertas → SIFACO` (CODIGO/PRECIO/NOM_PROMO/DEF_PROMO),
`Diferencias de stock → SIFACO` (CODIGO/STOCK).
**Acciones:** `Precios de ofertas`, `Diferencias de stock`, `Cambios de precio`.

---

## Núcleo reutilizable (F20-ready)

`lib/centro-datos/import.ts` — `mapearFilas` → `analizar` (match + semáforo +
explicación NORA + detección de cambios, **no escribe**) → `aplicar` (snapshot →
upsert catálogo/stock/ventas → import_job → cola sin match) → `revertir`
(rollback). `lib/centro-datos/export.ts` — `obtenerRegistros` (por entidad +
filtros) → `construir` (proyección de columnas + CSV exacto SIFACO).

Las APIs (`/api/centro-datos/{perfiles,import,acciones,export,rollback,sin-match,
demo}`) son finas: gatean y delegan en el núcleo. Un agente directo SIFACO (F20)
puede reusar el mismo núcleo sin la capa de archivos.

---

## Mapeo inteligente de columnas (v0.34)

El perfil ya no necesita que el archivo tenga los nombres exactos. Al subir,
**NORA lee los encabezados + una muestra de filas y propone el mapeo**
columna→campo (`lib/centro-datos/deteccion.ts`):
- **Sinónimos ES** por campo (COD_PROD/CODIGO→sku, DETALLE/DESCRIP→nombre,
  PVENTA/PVP→precio, EXIST→stock, CODBAR/EAN→barras, FAMILIA→rubro…).
- **Análisis de contenido** (13 dígitos→EAN, texto largo→nombre, decimales/altos→
  precio, enteros chicos→stock, `@`→email, 7-11 dígitos→documento) con asignación
  **greedy global** que resuelve ambigüedades (importe→precio vs monto).
- **Refuerzo LLM** (1 sola llamada con headers + muestra) para los campos core que
  quedaron dudosos, con **fallback** a la heurística si no hay API key o falla.
- El perfil guardado se usa como **base** (sus columnas presentes ya vienen ✓).

Flujo: subir → **NORA propone** (pantalla con % de confianza, verde ✓ / amarillo
¿confirmás?, dropdown a cualquier columna o "ninguna", "+N sin usar") → el usuario
corrige lo dudoso → **Confirmar mapeo y validar** → preview (cuántos crear/
actualizar, nuevos a confirmar…) → aplicar con rollback. Si NORA no encuentra el
**SKU** (obligatorio), avisa antes de seguir. **"Guardar como perfil"** persiste el
mapeo (`accion 'mapear'` + perfiles API) para reusarlo con archivos iguales. La UI
maneja 50+ columnas; las que no mapean se ignoran.

## Importador de productos completo (v0.32)

**Ofertas en el archivo.** El perfil de productos mapea, además del precio normal
(`precio`), columnas **opcionales** de oferta (configurables y guardadas en el
perfil): `precio_oferta` (precio con descuento), `descuento` (% off), `oferta_tipo`
(2x1 / % / precio fijo…), `oferta_vigencia` (fecha fin), `nom_promo`/`def_promo`
(nombre/descripción). No todos los productos necesitan tenerlas.

**Crear productos nuevos con confirmación.** En el preview, los productos cuyo SKU
**no existe** se listan aparte con checkbox (default todos los que traen SKU). El
usuario decide cuáles crear → se pasan en `crear_skus` al confirmar. Los que deja
sin tildar van a la cola "Sin matchear" (NO se crean solos). Nunca se crea un
producto sin confirmación.

**Ofertas automáticas.** Si una fila (producto nuevo creado **o** existente) trae
datos de oferta, `construirOferta()` arma la oferta y `crearOfertaDesdeProducto()`
la crea en **borrador**, enlazada al producto por id, con dedup por
`productos_ids @> [id]` + nombre (no duplica en re-imports). Snapshot incluye los
productos y ofertas creados → el rollback los borra.

**Resumen NORA.** "Actualizo X · creo Y de N nuevos · Z con oferta · suben/bajan
precio · sin match". La pantalla final informa creados + ofertas con link a Ofertas.

**SKU global, stock por sucursal.** El SKU/precio es uno para las 4 sucursales; lo
que cambia por sucursal es el stock (`stock_items.cantidad_gondola` en la sucursal
elegida). Nunca se duplica un producto por sucursal.

## Ofertas desde productos ya creados

En **Ofertas → Crear**, el buscador (`/api/ofertas/buscar-producto`) busca por
**SKU / nombre / EAN (BARRAS)** indistintamente (server-side con debounce, escala
al catálogo real), muestra EAN + **precio actual** y enlaza la oferta al producto
por SKU. La oferta creada se exporta a SIFACO con la acción de export existente
(formato de promo).

---

## Las 10 mejoras

1. **Historial** — `import_jobs` / `export_jobs` con detalle (Historial).
2. **Validación/semáforo** — `analizar` marca caída de productos, precios ±>30%,
   stock negativo, sin match (preview antes de aplicar).
3. **Detección de cambios** — `resumen`: nuevos, subieron/bajaron precio, etc.
4. **Match inteligente** — CODIGO → BARRAS → nombre.
5. **Recordatorio de carga** — perfiles con frecuencia vencida (landing + card MC +
   badge sidebar; live, sin cron — Hobby-safe).
6. **Deshacer** — snapshot antes de aplicar; botón "Deshacer" en Historial.
7. **Cola sin matchear** — crear / vincular / ignorar.
8. **NORA explica el archivo** — `resumen.texto` ("5.442 productos, 3.730 con
   stock, rubro farmacia, actualizado hoy").
9. **Programar exportaciones** — `frecuencia` en acciones, con fallback de botón
   manual (plan Hobby).
10. **Terreno F20** — perfiles/mapeos y núcleo reutilizables por la integración
    directa.

---

## Accesos desde sectores

- **Ofertas** → "Exportar a SIFACO".
- **Stock** → "Importar stock" / "Exportar diferencias".
- **CRM Clientes** → "Importar clientes".
- **Operaciones/Análisis** y **Compras/Faltantes** → card "Más vendidos (ventas
  reales)" leyendo de `ventas_diarias` + acceso a "Cargar ventas del día".

Todos pasan el perfil/acción precargado (`?tipo=` / `?perfil=` / `?accion=`).

## NORA tools

`centro_datos_estado` (última carga, sin match, recordatorios), `ventas_dia`
(ranking por sucursal/fecha), `items_sin_match` (cola). Card en Mission Control.

## Demo

`/api/centro-datos/demo` (cargar/borrar, botón en la landing): ventas_diarias
coherentes (5 días × sucursales), 1 import_job con anomalías, 5 items sin match,
2 acciones export custom. Todo `es_demo` → borrable.
