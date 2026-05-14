# ERP Social Ahorro · Progreso autónomo

**Última actualización:** 2026-05-14
**Última rama:** `feature/crm-redesign`
**Último commit:** `5c694fa` (F3 Operaciones completo)

---

## ✅ Hecho

### F1 · Bugfix + completar (4/4)
| ID | Commit | Notas |
|----|--------|-------|
| F1.1 Dashboard | `0f00d7b` | KPIs respetan rango activo, grid `xl:grid-cols-6`, header "KPIs · {rango}" |
| F1.2 Huérfanas | (existente) | Verificado — ya estaba wired desde CRM-C.1 |
| F1.3 Cmd+K | `0f41d34` | `components/crm/crm-search.tsx` global con 5 categorías. En CrmTopBar + HubTopBar |
| F1.4 Notificaciones | `0f41d34` | `components/crm/notifications-bell.tsx` con realtime sobre `notificaciones_admin` |

### F2 · Finanzas (6/6) — commits `903142e`, `b197df6`
- F2.1 Cuentas bancarias: listado + nueva + detalle (tabs Movimientos/Datos)
- F2.2 Cash flow: proyección semanal saldo inicial + egresos + ingresos estimados
- F2.3 Conciliación: MVP manual con upload CSV + parser genérico
- F2.4 Cheques: tabs Emitidos/Recibidos/En cartera/Vencidos + alta
- F2.5 Impuestos: KPIs + alta inline + marcar pagado
- F2.6 Sidebar Finanzas: 5 items nuevos

### F3 · Operaciones (6/6) — commit `5c694fa`
- F3.1 Stock: listado consolidado + nuevo producto + detalle con tabs
- F3.2 Vencimientos: lotes por ventana 30/60/90d con badges de severidad
- F3.3 Transferencias: listado + nueva + detalle con flujo de estados
- F3.4 Inventarios: listado + iniciar (cabecera). Conteo completo = TODO
- F3.5 Devoluciones: listado + nueva con items
- F3.6 Sidebar: secciones Operaciones + Devoluciones

### Migraciones SQL (0020-0027) — commit `05acb24`
8 migraciones aditivas con RLS. **NO APLICADAS.** Ver "Acciones requeridas".

---

## 🛑 Bloqueado

### F4 · IA con Claude — BLOQUEADO
**No tengo `ANTHROPIC_API_KEY`** (regla 5: credenciales que no están en .env → parar).
Para desbloquear:
```bash
vercel env add ANTHROPIC_API_KEY preview
vercel env add ANTHROPIC_API_KEY production
# y agregarla a .env.local
```
Una vez cargada, F4 completo (setup SDK, chat dock, /api/ai/chat, 8 tools,
comandos rápidos, resumen diario, OCR tickets) se puede construir. Schema
`ai_conversaciones` / `ai_resumenes_diarios` / `tickets_validacion` ya está
en migración 0027.

---

## 🚧 Pendiente

### F5 · Departamentos restantes (0/8)
Migraciones ya generadas (0026 RRHH/caja/gastos, 0027 aprobaciones/tickets).
- [ ] F5.1 CRM B2B interno — **necesita decisión:** ¿`customers` es B2C cuponera? Si sí, crear `clientes_crm`
- [ ] F5.2 BI — `/admin/bi` con KPIs ejecutivos + charts
- [ ] F5.3 Dashboard ejecutivo — `/admin` para C-level
- [ ] F5.4 RRHH — `/hub/rrhh/empleados` + turnos + ausencias (schema en 0026)
- [ ] F5.5 Caja diaria — `/hub/sucursales/caja` (schema en 0026)
- [ ] F5.6 Gastos operativos — `/hub/sucursales/gastos` (schema en 0026)
- [ ] F5.7 Performance sucursales — `/hub/sucursales/performance`
- [ ] F5.8 Centro de aprobaciones — `/admin/aprobaciones` (schema en 0027)

### Detalle/flujos incompletos de fases hechas
- F3.4 Inventarios: falta el flujo de conteo (cargar `inventario_items`, aplicar ajustes a `stock_sucursal`, cerrar)
- F3.3 Transferencias: el cambio de estado no mueve stock todavía (necesita triggers o lógica en API)
- F2.2 Cash flow: ingresos sin ajuste manual (solo promedio 30d)
- F2.3 Conciliación: sin matching automático (es MVP a propósito)

---

## 🛑 Acciones requeridas del usuario

### Prioridad 1 — Bloquean que las UIs funcionen
1. **Aplicar migraciones 0020-0027** contra Supabase. Necesito uno de:
   - Autenticar el MCP de Supabase (ya dejé `.mcp.json` — falta OAuth en browser), o
   - Darme `SUPABASE_ACCESS_TOKEN`, o
   - Darme `DATABASE_URL` / connection string con password
   El `SUPABASE_SERVICE_ROLE_KEY` que está en `.env` **no sirve** para DDL.
   Mientras tanto: las páginas de F2/F3 muestran un alert "aplicá la migración X"
   en vez de crashear.

2. **Subir `ANTHROPIC_API_KEY`** → desbloquea toda F4.

### Prioridad 2 — Decisión de scope
3. **F5.1**: ¿`customers` es la base B2C de la cuponera? Si sí → creo `clientes_crm`. Si está vacía/legacy → la reuso.

---

## 📋 Cómo retomar

```bash
git checkout feature/crm-redesign && git pull
cat docs/ERP-PROGRESO.md

# Si ya aplicaste migraciones y cargaste ANTHROPIC_API_KEY:
#   → arrancá F4 (IA). Empezá por F4.1 setup lib/ai/client.ts + prompts.ts
#   → seguí con F5 (RRHH, caja, gastos tienen schema listo en 0026)
# Si NO:
#   → las UIs de F2/F3 ya están, solo necesitan las tablas
```

---

## 🎯 Estado de calidad
- Build local: verde (último post `5c694fa`)
- TS strict: sin errores en archivos nuevos
- Mobile + dark mode: sí en todo lo nuevo
- Commits pushed: 0f00d7b, 0f41d34, 05acb24, e67bb1a, 903142e, b197df6, 5c694fa

## 💡 Decisiones tomadas sin validación
- Páginas de F2/F3 detectan `error.message.includes('does not exist')` y muestran
  qué migración aplicar — en vez de crashear. Permite mergear antes de aplicar SQL.
- Transferencias: las fechas (`fecha_envio`, `fecha_recepcion`) se setean automático
  al cambiar de estado.
- Inventarios: solo registro de cabecera por ahora (el conteo es un flujo grande).
- Cash flow: ingresos = promedio diario de ventas últimos 30d (no hay forecast manual).

## 🐛 Deuda técnica
1. Trigger SQL `movimientos_stock` → `stock_sucursal.cantidad_actual` (consistencia).
2. Trigger/lógica para que transferencias muevan stock real entre sucursales.
3. Generadores automáticos de notificaciones (cron: facturas a vencer, stock crítico).
4. Flujo de conteo de inventarios físicos.
5. Matching automático en conciliación bancaria.
