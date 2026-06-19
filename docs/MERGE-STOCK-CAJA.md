# 🔀 Merge stock + caja duplicados (v0.20)

Consolida los 2 modelos de datos que aún convivían tras v0.19 y agrega
**depósito por sucursal** + **reposición interna**. Toca datos sensibles (stock):
detección y respaldo ANTES de migrar; no se borra nada hasta verificar totales.

## T1 · Detección (qué modelo es canónico)

### Stock — verificado en DB
| Tabla | Filas | Stock total | Veredicto |
|-------|-------|-------------|-----------|
| `stock_items` | 144 | **7607 u** | ✅ **CANÓNICA** (WMS nuevo, con datos) |
| `stock_sucursal` | 0 | 0 | ❌ legacy vacía |

- El WMS activo (Stock, importador, inventarios, transferencias, alertas,
  rotación) **lee/deriva `stock_items`**. `stock_sucursal` solo la leían pantallas
  legacy que mostraban 0 (Mission Control KPI, performance, NORA tools, ex-ejecutivo).
- **Ningún código escribe `stock_items.cantidad` directamente** — todas las
  escrituras pasan por `movimientos_stock` (firmado) + trigger
  `tg_aplicar_movimiento_stock` que acumula. → `cantidad` puede pasar a columna
  **generada** (total) sin romper nada.
- Detección **inequívoca** → migración de bajo riesgo.

### Caja — verificado en DB
| Tabla | Filas | Veredicto |
|-------|-------|-----------|
| `cajas_diarias` | 0 | ❌ legacy vacía → eliminar |
| `caja_general` / `caja_turnos` / `caja_general_movimientos` | 4 / 2 / 2 | ✅ modelo nuevo (multinivel Finanzas) |

→ Sin datos que migrar en caja: se elimina `cajas_diarias` + páginas legacy
`/admin/sucursales/caja/*`, redirect a la caja nueva `/admin/finanzas/caja`.

### Respaldo (migración 0046)
`backup_stock_items_v20` (144 filas / 7607 u), `backup_movimientos_stock_v20`
(1680 filas), `backup_stock_sucursal_v20` (0). **No borrar hasta cerrar v0.20.**

## Modelo de depósito elegido

`stock_items` mantiene grano `(producto_id, sucursal_id)` con **dos columnas**:
`cantidad_gondola` + `cantidad_deposito`; `cantidad` pasa a **generada** =
góndola + depósito (total). Menos disruptivo: todas las lecturas de `cantidad`
(total) siguen funcionando.

- `movimientos_stock.ubicacion` (enum `gondola`/`deposito`, default `gondola`)
  indica a qué columna impacta cada movimiento; el trigger aplica el signo a la
  columna correcta.
- Todo el stock existente migra como **góndola** (depósito arranca en 0).
- `sucursales.usa_deposito` (bool, default false): si false, la UI oculta depósito.
- **Reposición interna** (depósito→góndola, misma sucursal) = 2 movimientos
  `reposicion_interna`: −X en `deposito` y +X en `gondola` (neto 0).

## Resultado (v0.20 — entregado)

**Stock (migraciones 0046–0049):**
- `stock_items` canónica con `cantidad_gondola` + `cantidad_deposito`; `cantidad`
  generada = total. `movimientos_stock.ubicacion` (gondola/deposito). Trigger
  reescrito. `sucursales.usa_deposito`. Tipo `reposicion_interna` + alerta
  `reponer_gondola`.
- **Chequeo de integridad:** stock total **7607 = 7607 (backup)** ✓ — todo migró
  a góndola, depósito en 0. 1680 movimientos intactos. Trigger + reposición
  verificados (test con rollback: góndola+5/depósito+5 OK).
- UI: ficha de producto muestra G/D por sucursal + botón "Reponer góndola"
  (API `/api/inventario/reposicion-interna`, 2 movimientos firmados). Export con
  Góndola/Depósito/Total.
- Lectores activos de `stock_sucursal` (vacía) repuntados a `stock_items`:
  Mission Control, NORA daily-briefing/predictions, performance, `lib/ai/tools`,
  alertas (mostraban 0 contra tabla vacía; ahora datos reales).
- `stock_sucursal` se **deja en su lugar** (vacía, backup en 0046) porque la
  página huérfana `/admin/operaciones/stock/[id]` (legacy, usa `productos` viejo)
  aún la referencia. **Drop diferido** hasta retirar esa página.

**Caja (migración 0050):**
- `cajas_diarias` (vacía) **eliminada**. Canónico = `caja_general` /
  `caja_turnos` / `caja_general_movimientos` (`/admin/finanzas/caja`).
- Páginas legacy `/admin/sucursales/caja/*` borradas + **redirect 308** →
  `/admin/finanzas/caja` (verificado). Cron `check-triggers` y `performance`
  repuntados a `caja_turnos`. Sidebar "Caja" → caja multinivel.

**Respaldos vigentes:** `backup_stock_items_v20`, `backup_movimientos_stock_v20`,
`backup_stock_sucursal_v20`. Conservar hasta validación en producción.

**Pendientes:** (1) retirar la página huérfana `stock/[id]` (usa `productos`
legacy) y luego `drop table stock_sucursal`. (2) Cargar `usa_deposito=true` en las
sucursales que tengan depósito (default false). (3) Recepción/transferencia con
elección de ubicación (góndola/depósito) — follow-up.
