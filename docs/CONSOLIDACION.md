# 🧹 Consolidación + Dashboards por sector (v0.19)

Ordena los módulos que quedaron mezclados tras la unificación de shells (v0.18):
elimina duplicados (un módulo por función) y agrega un dashboard de entrada a
cada sector. **No** construye sectores nuevos.

## Hallazgo clave: NO hay duplicación de datos

Todas las parejas duplicadas comparten la **misma tabla**. Verificado en la DB:
tablas únicas `proveedores`, `pagos`, `facturas_proveedor`, `empleados` (no hay
`proveedores_compras` ni similares). → **Cero migración de datos**: la
consolidación es solo de UI + redirects 308. Riesgo bajo.

## Plan de merge (cuál queda / cuál se elimina)

| # | Función | Canónico (queda) | Se elimina → redirect | Tabla compartida | Acción extra |
|---|---------|------------------|------------------------|-------------------|--------------|
| 1 | Proveedores | `/admin/proveedores` (Compras; ficha rica: contactos, cuentas, documentos, editor) | `/admin/finanzas/proveedores` → `/admin/proveedores` | `proveedores` | Portar tab **Cuenta corriente** (de finanzas) a la ficha canónica `[id]` |
| 2 | Pagos | `/admin/finanzas/pagos` (mueve dinero real con origen) | `/admin/pagos`, `/nuevo`, `/[id]` → `/admin/finanzas/pagos` | `pagos` | — |
| 3 | Facturas/Documentos | `/admin/finanzas/documentos` (factura A/B/C + NC/ND) | `/admin/facturas`, `/nueva`, `/[id]` → `/admin/finanzas/documentos` | `facturas_proveedor` | — |
| 4 | Empleados | `/admin/rrhh/empleados` (legajos + ausencias + turnos; en sidebar) | `/admin/empleados` (lista gamificación, fuera del sidebar) → `/admin/rrhh/empleados` | `empleados` | — *(duplicado no listado por el usuario, reportado)* |
| 5 | Dashboard ejecutivo | se absorbe: vistazo → Mission Control, análisis → BI | `/admin/ejecutivo` → `/admin/bi` | varias | Mover lo útil a MC/BI |

**Clientes B2B** (`/admin/clientes`, tabla `clientes`): se **conserva**; se marca
con nota de que el futuro CRM unificado lo reemplazará (no se borran datos).

**Gastos** (T6): `gastos operativos` (Sucursales, variables del local) vs
`gastos fijos` (Finanzas, recurrentes mensuales) son conceptos distintos →
**conviven** con etiquetas clarificadas en menú y pantallas.

## Dashboards por sector (T4)

Componente reutilizable `<SectorDashboard>` (header + KPIs reales + NoraCard +
grid de accesos rápidos). Página índice de cada sector lo usa:

| Sector | Ruta índice | KPIs |
|--------|-------------|------|
| Operaciones | `/admin/operaciones` (nuevo) | valor de stock, quiebres, por vencer, dinero dormido |
| Finanzas | `/admin/finanzas` (reemplaza tablero actual por patrón común) | deuda proveedores, vence esta semana, saldo bancos, caja general |
| Compras | `/admin/compras` (nuevo) | órdenes/devoluciones abiertas, recepciones pendientes, proveedores |
| Sucursales | `/admin/sucursales` (índice → dashboard) | sucursales activas, caja del día, gastos del mes |
| RRHH/Equipo | `/admin/rrhh` (nuevo) | empleados activos, ausentes hoy, docs por vencer |
| Clientes | `/admin/clientes` (índice → dashboard) | clientes, tickets a validar |
| IA/Inteligencia | `/admin/ia` (nuevo) | resumen, tickets IA |
| Aprobaciones | `/admin/aprobaciones` | pendientes por tipo |

## Jerarquía de dashboards (3 niveles)

1. **Mission Control** (`/admin`) = home global (vistazo 30s: ventas, 4 sucursales,
   alertas críticas consolidadas, quick actions, NORA, predicciones).
2. **Dashboard de sector** (T4) = nivel intermedio.
3. **Secciones** del sector.

`BI` (`/admin/bi`) = análisis profundo (recibe lo analítico de Ejecutivo).
