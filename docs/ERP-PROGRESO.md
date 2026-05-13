# ERP Social Ahorro · Progreso autónomo

**Última actualización:** 2026-05-13
**Última rama:** `feature/crm-redesign`
**Último commit:** `05acb24` (SQL migrations 0020-0027)

---

## ✅ Hecho en esta sesión

### F1 · Bugfix + completar lo iniciado (4/4)

| ID | Estado | Commit | Notas |
|----|--------|--------|-------|
| F1.1 Dashboard bugfix | ✅ | `0f00d7b` | KPIs respetan rango activo (no más hardcoded today). Grid `xl:grid-cols-6` (era `lg:` muy denso). PageActions con `justify-end` para que no compita con el title. Header "KPIs · {hoy/todos/<fecha>}". |
| F1.2 Funcionalidades huérfanas | ✅ | (existente) | **No requirió cambios** — Buscar/Alertas/CSV/Nuevo pedido/Sincronizar ya estaban wired desde CRM-C.1. |
| F1.3 Cmd+K global | ✅ | `0f41d34` | Movido `GlobalSearch` (solo /dashboard) a `components/crm/crm-search.tsx` reusable. Agregadas categorías Proveedores + Acciones rápidas + Navegación. Montado en CrmTopBar y HubTopBar — Cmd+K ahora funciona en TODA la app. |
| F1.4 Notificaciones reales | ✅ | `0f41d34` | `components/crm/notifications-bell.tsx` con Popover + realtime subscription a `notificaciones_admin`. Badge con count, click marca leída + navega a `url_accion`. CrmTopBar usa filtro por `user_id`; HubTopBar agrega filtro por `rol_destinatario` para broadcasts. |

### F2-F5 · Migraciones SQL (8/8)

Generadas pero **no ejecutadas** contra Supabase. Ver sección "Acciones requeridas" abajo.

| Migration | Tablas / Tipos | Fase |
|-----------|----------------|------|
| `0020_finanzas_cuentas_movimientos.sql` | `cuentas_bancarias_propias`, `movimientos_bancarios`, view `cuentas_bancarias_con_saldo` | F2.1 |
| `0021_finanzas_cheques.sql` | `cheques` con tipo emitido/recibido | F2.4 |
| `0022_finanzas_impuestos.sql` | `impuestos_obligaciones` | F2.5 |
| `0023_finanzas_conciliacion.sql` | `extracto_lineas_pendientes` | F2.3 |
| `0024_operaciones_stock.sql` | `productos`, `stock_sucursal`, `movimientos_stock`, `lotes_productos` (+ enums) | F3.1 + F3.2 |
| `0025_operaciones_transferencias_inventarios_devoluciones.sql` | `transferencias_sucursal`+items, `inventarios_fisicos`+items, `devoluciones_proveedor`+items | F3.3 + F3.4 + F3.5 |
| `0026_rrhh_caja_gastos.sql` | `empleados`, `empleado_turnos`, `empleado_ausencias`, `cajas_diarias`, `movimientos_caja`, `gastos_operativos` | F5.4 + F5.5 + F5.6 |
| `0027_ia_aprobaciones_tickets.sql` | `ai_conversaciones`, `ai_resumenes_diarios`, `aprobaciones`, `tickets_validacion` | F4 + F5.8 + F4.7 |

Todas son **aditivas** (no modifican tablas existentes), todas con RLS por rol de `users_admin`, y reusan `tg_set_updated_at` y enums existentes (`admin_role`).

---

## 🚧 Pendiente

### F2 · Finanzas (UIs)
- [ ] **F2.1 UI Cuentas bancarias** — `/hub/finanzas/cuentas` (listado + nueva + detalle con tabs)
- [ ] **F2.2 Cash flow proyectado** — `/hub/finanzas/cash-flow` con timeline + Tremor LineChart
- [ ] **F2.3 Conciliación** — `/hub/finanzas/conciliacion` (upload CSV + matching). MVP sin matching automático.
- [ ] **F2.4 Cheques** — `/hub/finanzas/cheques` (tabs Emitidos/Recibidos/En cartera/Vencidos)
- [ ] **F2.5 Impuestos** — `/hub/finanzas/impuestos` (calendario + lista)
- [ ] **F2.6 Sidebar Finanzas** — agregar 5 items al hub-nav-config

### F3 · Operaciones (UIs)
- [ ] **F3.1 Stock** — `/hub/operaciones/stock` (listado consolidado + detalle + alta producto)
- [ ] **F3.2 Vencimientos** — `/hub/operaciones/vencimientos` (DataTable filtros 30/60/90)
- [ ] **F3.3 Transferencias** — `/hub/operaciones/transferencias` (con flujo de estados)
- [ ] **F3.4 Inventarios físicos** — `/hub/operaciones/inventarios` (snapshot + arqueo)
- [ ] **F3.5 Devoluciones a proveedor** — `/hub/compras/devoluciones`
- [ ] **F3.6 Sidebar Operaciones** — agregar items al hub-nav-config

### F4 · IA con Claude
- [ ] **F4.1 Setup `@anthropic-ai/sdk` + `lib/ai/client.ts` + `lib/ai/prompts.ts`** — bloqueado por `ANTHROPIC_API_KEY` (no está en `.env`)
- [ ] **F4.2 Chat dock flotante** — `components/ai/ai-chat-dock.tsx` montado en CrmShell
- [ ] **F4.3 `/api/ai/chat`** — streaming + tool use + logging en `ai_conversaciones`
- [ ] **F4.4 Tools** — `get_pedidos`, `get_resumen_ventas`, `get_facturas_vencer`, `get_cash_flow_resumen`, `get_stock_critico`, `get_vencimientos_proximos`, `get_proveedor_resumen`, `get_anomalias`
- [ ] **F4.5 Comandos rápidos** — chips contextuales según pathname
- [ ] **F4.6 Resumen diario** — endpoint on-demand + tabla `ai_resumenes_diarios` (cron en TODO)
- [ ] **F4.7 OCR tickets** — `/hub/comercial/tickets-validacion` con Vision API

### F5 · Departamentos restantes
- [ ] **F5.1 CRM B2B interno** — definir vs cuponera (decidir: usar `customers` o crear `clientes_crm`)
- [ ] **F5.2 BI** — `/admin/bi` con KPIs ejecutivos + Tremor charts
- [ ] **F5.3 Dashboard ejecutivo** — `/admin` para C-level
- [ ] **F5.4 RRHH** — `/hub/rrhh/empleados` + turnos + ausencias
- [ ] **F5.5 Caja diaria** — `/hub/sucursales/caja` con apertura/cierre
- [ ] **F5.6 Gastos operativos** — `/hub/sucursales/gastos`
- [ ] **F5.7 Performance sucursales** — `/hub/sucursales/performance`
- [ ] **F5.8 Centro de aprobaciones** — `/admin/aprobaciones`

---

## 🛑 Acciones requeridas del usuario

### Prioridad 1 — Bloquean construir UIs

1. **Aplicar migraciones 0020-0027** contra Supabase:
   ```bash
   # opción local
   npx supabase db push

   # opción dashboard
   # subir cada .sql al editor de SQL en supabase.com → ejecutar en orden
   ```
   Sin esto, las UIs de F2-F5 van a tirar `relation does not exist`.

2. **Subir `ANTHROPIC_API_KEY`** a Vercel + `.env.local`:
   ```bash
   vercel env add ANTHROPIC_API_KEY preview
   vercel env add ANTHROPIC_API_KEY production
   ```
   Sin esto, F4 (IA) no se puede ni iniciar.

### Prioridad 2 — Decisiones de scope

3. **Cuponera vs CRM interno** (F5.1): ¿la tabla `customers` actual es B2C de cuponera o B2B internos? Si es B2C, hay que crear `clientes_crm` para B2B. Si es B2B (vacía / legacy), reusar.
4. **Categorías de gastos operativos** (F5.6): el enum `categoria_gasto` tiene `alquiler/servicios/sueldos/mantenimiento/limpieza/insumos/otros`. ¿Falta alguna?
5. **Umbrales de aprobaciones** (F5.8): qué monto requiere aprobación de gerente vs super_admin. **Decisión razonable propuesta:** > $100k AR requiere gerente, > $1M requiere super_admin.

### Prioridad 3 — Integraciones que mencionás pero no especificás cómo

6. **SIFACO** (F3.1): ¿es API externa? ¿usuario/clave? Si no, todo el stock vive en Supabase.
7. **AFIP** (futuro): no estaba en scope.
8. **Bancos** (F2.3): conciliación pide subir extracto manual. ¿Hay bancos con API que querés conectar? Si no, MVP manual va bien.

---

## 📋 Cómo retomar en próxima sesión

```bash
git checkout feature/crm-redesign
git pull
cat docs/ERP-PROGRESO.md  # este archivo

# 1. Aplicá migraciones 0020-0027 (ver "Acciones requeridas")
# 2. Empezá por F2.1 — UI cuentas bancarias.
#    Schema en 0020. Componentes a crear:
#    - app/hub/finanzas/cuentas/page.tsx (server, listado de cards)
#    - app/hub/finanzas/cuentas/nueva/page.tsx + form.tsx
#    - app/hub/finanzas/cuentas/[id]/page.tsx (tabs Movimientos / Datos)
#    - app/hub/finanzas/cuentas/[id]/movimiento-form.tsx (alta movimiento)
#    Reusá HubShell + PageHeader + KpiCard (saldo) + Table (movimientos).
#    Agregá link en components/hub/hub-nav-config.ts sección Finanzas.
# 3. Después F2.4 cheques (similar pattern).
# 4. F2.5 impuestos con calendario.
# 5. F2.2 cash flow + F2.3 conciliación (más complejos).
# 6. F4.1 si la API key ya está cargada.
```

---

## 🎯 Estado de calidad

- **Build local:** verde (último `next build` post commit `0f41d34`)
- **TypeScript strict:** sin errores en archivos nuevos
- **TS warnings:** solo deprecation `[6385]` del SDK Supabase en `.returns<T>()` — preexistente, no bloqueante
- **Mobile responsive:** sí (mantiene patrones de CRM-redesign)
- **Dark mode:** sí (todos los nuevos componentes usan tokens `bg-background/foreground/border/etc`)
- **Push a remote:** ✅ commits 0f00d7b, 0f41d34, 05acb24

---

## 💡 Decisiones tomadas sin validación

1. **`tipo_cuenta_bancaria_propia`** en migration 0020 — nombre largo para no chocar con el enum `tipo_cuenta_bancaria` ya existente que es para cuentas de proveedores.
2. **`moneda` enum** — solo ARS y USD por ahora. Si necesitan EUR/BRL, agregarlo a 0020.
3. **Saldos via VIEW** (no columna cacheada) — más simple y siempre correcto. Si hay problemas de performance con miles de movimientos, migrar a trigger + columna.
4. **`extracto_lineas_pendientes` separada** de `movimientos_bancarios` — el usuario carga extracto, intentamos match, después se promueve a movimiento real al conciliar. Mantiene la tabla principal limpia.
5. **`stock_sucursal` con UNIQUE(producto_id, sucursal_id)** — un row por par. Cantidad acumulada se actualiza con triggers de movimientos (TODO).
6. **Generated column `inventario_items.diferencia`** — automática, evita errores de cálculo en cliente.
7. **Tickets validación con `cliente_id` UUID sin FK** — porque la tabla `customers` puede vivir en otro repo (cuponera). Match por `dni`/`telefono`.

---

## 🐛 Deuda técnica detectada (no fixed)

1. Trigger SQL para auto-update de `stock_sucursal.cantidad_actual` desde `movimientos_stock` — sería ideal para mantener consistencia. Por ahora: aplicar lógica en API route al insertar movimiento.
2. Generadores automáticos de notificaciones (F1.4 prompt) — quedaron como TODO. Implementar cron job cada hora que detecte: facturas a vencer, pedidos atrasados, stock crítico, y haga `INSERT INTO notificaciones_admin`.
3. La tabla `customers` (CRM B2C) no tiene index en `name`/`phone`/`email` para búsqueda. La búsqueda de Cmd+K hace `ilike` sin índice — lento si crece >10k.
4. SyncButton (Sincronizar Woo) está en el header del dashboard pero también podría vivir en topbar como acción global.
