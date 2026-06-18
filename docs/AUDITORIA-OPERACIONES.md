# 🔍 Auditoría — Sector Operaciones / Stock · NORA HQ

**Fecha:** 2026-06-18 · **Alcance:** `app/hub/operaciones/*` (stock, vencimientos,
transferencias, inventarios) + `app/hub/compras/devoluciones` + sus tablas.
**Modo:** solo lectura (no se modificó nada). **Build:** verde, 72 rutas.

## 0. TL;DR (lo más importante)

1. **`productos` y `productos_catalogo` son DOS tablas separadas y DESCONECTADAS.**
   Todo el stock usa **`productos`** (F3). `productos_catalogo` (vademécum, F6.5)
   es una **isla**: no tiene ninguna FK ni nadie la referencia. → catálogo
   duplicado, el vademécum (foto, droga, receta, refrigerado, comisión,
   sustitutos) **no está disponible para el stock**.
2. **No hay ningún mecanismo que baje el stock por ventas.** No hay import de
   ventas, no hay conexión a SIFACO, no existe el tipo de movimiento "venta".
   El stock **nunca disminuye por venta**.
3. **Transferencias y devoluciones NO mueven stock.** Crean los registros y
   cambian de estado, pero nunca tocan `stock_sucursal`, `lotes_productos` ni
   `movimientos_stock`. Son, hoy, **decorativas**.
4. **El único flujo que ajusta stock real es el inventario físico** (RPC
   `cerrar_inventario_fisico` → fija `cantidad_actual` + escribe `movimientos_stock`).
5. **El módulo está vacío de datos** (0 productos, 0 stock, 0 lotes; solo 1
   inventario de prueba). El seed demo de F6-T no cargó stock.
6. **No hay FEFO/FIFO, ni ubicaciones internas estructuradas, ni rotación /
   más vendidos** (esperado).

---

## 1. Estado por pantalla

| Pantalla | Archivo | Estado | Detalle |
|----------|---------|--------|---------|
| **Stock — listado** | `operaciones/stock/page.tsx` | 🟢 OK | Lista productos + stock total/sucursales/estado. KPIs (cantidad, crítico, sin stock). Búsqueda (nombre/código/lab) y filtros Todos/Crítico/Sin stock por URL **funcionan**. "Nuevo producto" y "Ver" cableados. Tolera vacío. |
| **Stock — detalle** | `operaciones/stock/[id]/page.tsx` | 🟢 OK | Header + KPIs + stock por sucursal (con `ubicacion`, solo lectura) + **movimientos recientes** (50) + tab Datos editable (super/gerente/comprador/admin). |
| **Stock — nuevo/editar** | `operaciones/stock/nuevo/form.tsx` | 🟢 OK | CRUD de **`productos`** (nombre, códigos, categoría, lab, precios, IVA). Valida nombre y código duplicado (23505). |
| **Vencimientos** | `operaciones/vencimientos/page.tsx` | 🟡 Solo lectura | Lista lotes por vencer (ventana 30/60/90) + KPIs. **Sin acciones**: el propio código comenta (≈L195) que devolver/marcar vencido/promocionar "requieren los flujos de devoluciones y movimientos de stock". |
| **Transferencias — listado** | `operaciones/transferencias/page.tsx` | 🟢 OK (UI) | Lista con estados. "Nueva" y "Ver" cableados. Sin filtros. |
| **Transferencias — detalle** | `.../[id]/page.tsx` + `estado-actions.tsx` | 🔴 Bug lógico | Cambia estado (solicitada→aprobada→en_transito→recibida/cancelada) pero **NO ajusta stock** ni escribe `movimientos_stock`. Una transferencia "recibida" no movió nada. |
| **Transferencias — nueva** | `.../nueva/form.tsx` | 🟡 Parcial | Crea `transferencias_sucursal` + `transferencia_items`. Selector de producto es un **`<select>` simple sin búsqueda** (de `productos`). No reserva ni descuenta stock. |
| **Inventarios — listado** | `operaciones/inventarios/page.tsx` + `iniciar.tsx` | 🟢 OK | Lista + "Iniciar inventario" (sucursal + fecha → `inventarios_fisicos`). |
| **Inventarios — conteo** | `.../[id]/page.tsx` + `conteo.tsx` | 🟢 OK | Conteo editable (sistema vs contado + diferencia). "Guardar conteo" (`inventario_items` upsert) y **"Cerrar y ajustar stock"** → RPC `cerrar_inventario_fisico` (ajusta `stock_sucursal` + escribe `movimientos_stock`). **Único flujo que mueve stock.** |
| **Devoluciones — listado** | `compras/devoluciones/page.tsx` | 🟢 OK (UI) | Lista con estados. "Nueva" y "Ver" cableados. Sin filtros. |
| **Devoluciones — detalle** | `.../[id]/page.tsx` + `estado-actions.tsx` | 🔴 Bug lógico | Cambia estado (registrada→enviada→nota_credito→cerrada) pero **NO descuenta stock** ni escribe movimiento. Tiene `<Comprobantes>` (T13). |
| **Devoluciones — nueva** | `.../nueva/form.tsx` | 🟡 Parcial | Crea `devoluciones_proveedor` + `devolucion_items` (con lote/vencimiento/foto). Selector de producto **`<select>` simple** (de `productos`). No descuenta stock. |

---

## 2. Mapa de tablas y relaciones

```
productos (catálogo OPERATIVO — lo usa el stock)
  ├─1:N→ stock_sucursal      (producto_id, sucursal_id, cantidad_actual,
  │                           stock_minimo/maximo, ubicacion[texto libre])
  ├─1:N→ lotes_productos      (producto_id, sucursal_id, numero_lote,
  │                           fecha_vencimiento, cantidad_actual, recepcion_id)
  ├─1:N→ movimientos_stock    (producto_id, sucursal_id, tipo, cantidad,
  │                           motivo, referencia_tipo, referencia_id)
  ├─1:N→ transferencia_items  (→ transferencias_sucursal)
  ├─1:N→ inventario_items     (→ inventarios_fisicos)
  └─1:N→ devolucion_items     (→ devoluciones_proveedor)

productos_catalogo  ❌ ISLA — sin FK entrante ni saliente
  (sku, codigo_barras, droga_principal, requiere_receta, es_psicotropico,
   es_refrigerado, foto_url, vademecum_data, margen_pct, comision_empleado_pct,
   sustitutos_ids[], droguerias_preferidas[], stock_minimo_global)

lotes_productos.recepcion_id → recepciones_mercaderia  (entrada esperada, sin uso)
```

- **Todas** las FKs `producto_id` (stock_sucursal, lotes, movimientos,
  transferencia_items, inventario_items, devolucion_items) apuntan a **`productos`**.
- `productos_catalogo` comparte `codigo_barras` con `productos` pero **sin relación**.
- `movimientos_stock.tipo` (enum): entrada · salida · ajuste · transferencia ·
  vencido · devolucion · inventario_alta · inventario_baja. **No existe "venta".**
- Triggers: solo `updated_at`. **No hay trigger que recalcule `stock_sucursal`
  desde `movimientos_stock`** → el stock se fija directo (hoy solo por la RPC).

### Datos reales (conteos)
| Tabla | Filas |
|-------|------|
| productos | **0** |
| productos_catalogo | **0** |
| stock_sucursal | **0** |
| lotes_productos | **0** |
| transferencias_sucursal | **0** |
| devoluciones_proveedor | **0** |
| inventarios_fisicos | **1** (prueba) |

→ El módulo no tiene datos; el seed demo (F6-T) no cargó stock/productos.

---

## 3. Respuestas a las preguntas críticas

1. **¿productos y productos_catalogo unificadas o separadas? ¿cuál usa el stock?**
   **Separadas y desconectadas.** El stock usa **`productos`**.
   `productos_catalogo` no se usa en Operaciones (solo en
   `/admin/configuracion/catalogo`).
2. **¿Mecanismo que actualice stock con ventas? ¿import / SIFACO?**
   **No existe.** Ni código SIFACO, ni import de ventas, ni tipo de movimiento
   "venta". El stock no baja por ventas.
3. **¿FEFO, ubicaciones (salón/depósito/heladera), alertas, rotación, más vendidos?**
   - FEFO/FIFO: **no**.
   - Ubicaciones: solo `stock_sucursal.ubicacion` (texto libre, una por
     producto-sucursal, **solo se muestra, no se edita**; sin estructura
     salón/depósito/heladera; los lotes no tienen ubicación).
   - Alertas de stock bajo: **básicas y solo visuales** (badge Crítico/Sin stock
     en la lista; no hay notificación ni cron).
   - Rotación / más vendidos: **no** (depende de ventas, que no existen).
4. **Movimientos de stock: ¿tabla con trazabilidad o edición directa?**
   Existe `movimientos_stock` (con `referencia_tipo`/`referencia_id` para trazar),
   **pero solo la escribe la RPC `cerrar_inventario_fisico`.** Entradas,
   transferencias y devoluciones **no generan movimiento** → trazabilidad
   incompleta y el "historial de movimientos" del detalle casi siempre vacío.

---

## 4. Bugs / gaps concretos

| # | Severidad | Hallazgo | Dónde |
|---|-----------|----------|-------|
| B1 | 🔴 | **Catálogo duplicado**: `productos` (stock) vs `productos_catalogo` (vademécum) sin relación. Doble carga, divergencia, vademécum inaccesible para stock. | schema 0024 vs 0036 |
| B2 | 🔴 | **Sin salida por ventas**: no hay import/SIFACO ni tipo "venta". El stock no refleja la realidad operativa. | (no existe) |
| B3 | 🔴 | **Transferencias no mueven stock**: cambiar a en_transito/recibida no descuenta origen ni suma destino, ni escribe movimiento. | `transferencias/[id]/estado-actions.tsx` |
| B4 | 🔴 | **Devoluciones no descuentan stock** ni lotes ni movimiento al enviarse/cerrarse. | `compras/devoluciones/[id]/estado-actions.tsx` |
| B5 | 🟡 | **Entrada de stock sin flujo**: `lotes_productos.recepcion_id` apunta a recepciones pero recepción de mercadería no escribe stock/lotes/movimiento (verificar en módulo Compras). Hoy el stock solo "entra" por inventario. | `compras/recepciones/*` |
| B6 | 🟡 | **movimientos_stock incompleto**: solo lo escribe inventario → trazabilidad parcial; "Movimientos recientes" del detalle casi siempre vacío. | global |
| B7 | 🟡 | **Vencimientos sin acciones** (devolver/merma/promocionar) — comentado como pendiente. | `vencimientos/page.tsx` ~L195 |
| B8 | 🟡 | **Ubicaciones internas no gestionadas**: `ubicacion` texto libre, solo lectura; sin salón/depósito/heladera; lotes sin ubicación. | `stock_sucursal` |
| B9 | 🟡 | **Selectores de producto sin búsqueda/autocomplete** (`<select>` plano) → no escalan a cientos de SKUs. | transferencias/devoluciones `nueva/form.tsx` |
| B10 | 🟢 | **Alertas de stock solo visuales** (badge); sin notificación ni cron. | `stock/page.tsx` |
| B11 | 🟢 | **Módulo sin datos** (0 productos/stock/lotes); el demo no seedeó stock → pantallas se ven vacías. | seed |

> No se detectaron botones que tiren error: las pantallas toleran tablas vacías
> (alertas controladas) y los CRUD básicos (productos, transferencias,
> devoluciones, inventario) funcionan. Los problemas son **de lógica de negocio
> faltante** (el stock no se mueve), no de UI rota.

---

## 5. Qué falta — priorizado

### P0 — Núcleo del control de stock (sin esto el módulo no es confiable)
1. **Decidir y unificar el catálogo**: una sola tabla de productos (o relacionar
   `productos`↔`productos_catalogo` por SKU/código de barras) para que stock,
   vademécum, comisión y datos regulatorios vivan juntos.
2. **Entrada de stock real**: recepción de mercadería → suma `stock_sucursal`,
   crea `lotes_productos` y escribe `movimientos_stock` (tipo entrada).
3. **Salida por ventas**: import de ventas / conexión SIFACO (o carga manual) →
   descuenta stock (tipo salida/venta). Es la pieza que hoy falta por completo.
4. **Transferencias que muevan stock**: al enviar descuenta origen, al recibir
   suma destino, ambos con `movimientos_stock` (tipo transferencia) y consumo de
   lote.
5. **Devoluciones que descuenten stock** + lote + movimiento (tipo devolucion).

### P1 — Confiabilidad y trazabilidad
6. **`movimientos_stock` como fuente de verdad**: que todo flujo escriba ahí, y
   que `stock_sucursal` se derive (trigger o RPCs consistentes) — no fijar la
   cantidad a mano.
7. **FEFO** en salidas (consumir primero el lote más próximo a vencer).
8. **Acciones de vencimientos**: marcar vencido (baja + movimiento), enviar a
   devolución, promocionar.
9. **Ubicaciones internas estructuradas** (salón/depósito/heladera) por lote, con
   gestión, no texto libre.
10. **Alertas de stock**: notificación/cron cuando cae bajo mínimo (hoy solo badge).

### P2 — Inteligencia y UX
11. **Autocomplete de productos** en los selectores (búsqueda por nombre/código).
12. **Rotación / más vendidos / días de cobertura** (depende de ventas, P0-3).
13. **Datos demo de stock** (productos, stock por sucursal, lotes por vencer,
    críticos) para que el módulo se vea vivo.

---

## 6. Archivos clave (referencia)
- Schema: `supabase/migrations/0024_operaciones_stock.sql`,
  `0025_*transferencias_inventarios_devoluciones.sql`,
  `0032_inventario_cerrar.sql` (RPC), `0036_catalogo_productos.sql` (isla).
- RPC que ajusta stock: `cerrar_inventario_fisico` (0032), llamada en
  `operaciones/inventarios/[id]/conteo.tsx`.
- Pantallas: `app/hub/operaciones/{stock,vencimientos,transferencias,inventarios}/*`,
  `app/hub/compras/devoluciones/*`.
