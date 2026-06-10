# 🗺️ PLAN MAESTRO · NORA HQ

> **Cómo retomar:** una sesión nueva que arranque con **"continuá el plan
> maestro"** debe leer este archivo + `docs/ERP-PROGRESO.md` y seguir desde
> **PRÓXIMA ACCIÓN** sin pedir contexto.
>
> **Regla permanente:** actualizar este archivo después de CADA sub-tanda.

**Última actualización:** 2026-06-10 · **Rama:** `main` · **Sistema:** NORA HQ
(orquestador, NO factura ni reemplaza SIFACO) · single-tenant (Social Ahorro)
con `sucursal_id` en todo para escalar.

---

## 📊 FASES DEL PROYECTO

| Fase | Nombre | Estado |
|------|--------|--------|
| F1 | Bugfix + Cmd+K + notificaciones | ✅ completa |
| F2 | Finanzas (cuentas, cash flow, conciliación, cheques, impuestos) | ✅ completa |
| F3 | Operaciones (stock, vencimientos, transferencias, inventarios, devoluciones) | ✅ completa |
| F4 | IA interna con Claude (chat dock, tools, OCR, resumen) | ✅ completa |
| F5 | Departamentos (CRM B2B, BI, ejecutivo, RRHH, caja, gastos) | ✅ completa |
| F6 | Tareas Enterprise + Empleados + Gamificación | ✅ completa (ver ERP-PROGRESO) |
| F6.5 | **Reestructuración + Admin profundo + Gestor de APIs** | 🔄 **en curso (esta sesión)** |
| F7 | Vencimientos WMS | ⬜ pendiente |
| F8 | Reposición inteligente droguerías | ⬜ pendiente |
| F9 | Compliance regulatorio | ⬜ pendiente |
| F10 | Cadena de frío + EAM (mantenimiento de activos) | ⬜ pendiente |
| F11 | DMS (gestión documental) | ⬜ pendiente |
| F12 | Inbox unificado | ⬜ pendiente |
| F13 | Marketing | ⬜ pendiente |
| F14 | NORA avanzada | ⬜ pendiente |
| F15 | Chat farmacéutico | ⬜ pendiente |
| F16 | IA acústica | ⬜ pendiente |
| F17 | Cámaras Hikvision | ⬜ pendiente |
| F18 | BI predictivo | ⬜ pendiente |
| F19 | WhatsApp / Telegram | ⬜ pendiente |
| F20 | Integración SIFACO | ⬜ pendiente |

---

## 🔄 F6.5 · REESTRUCTURACIÓN (sesión actual)

| Sub-tanda | Detalle | Estado |
|-----------|---------|--------|
| **T1** | Bugfixes visuales (header search overlap + saludo personalizado por hora/rol) | ✅ commit `1467a21` |
| **T2** | Completar rebrand NORA HQ (renames, `NoraBrand`, paleta, metadata) | ✅ |
| **T3** | Reorganización del sidebar — 8 pilares | ✅ |
| **T4** | Mission Control en `/admin` (greeting, KPIs, quick actions, sucursales live, predicciones) | ✅ |
| **T5** | Usuarios y permisos `/admin/configuracion/usuarios` (+ migración `permisos_custom`) | ⬜ |
| **T6** | Catálogo de productos `/admin/configuracion/catalogo` (+ migración `0031`) + importador CSV | ⬜ |
| **T7** | ⭐ Gestor de APIs / Integraciones `/admin/configuracion/integraciones` (+ migración + runner + adapter WooCommerce real + cron) | ⬜ |
| **T8** | Model router de IA `/admin/configuracion/ia` (+ tabla `ia_config` + `getModelFor`) | ⬜ |
| **T9** | Polish (empty states, breadcrumbs, mobile 375px, sacar redundancias) | ⬜ |
| **T10** | Documentación y cierre (OBJETIVOS-NORA-HQ, plan, tag `v0.6.5-reestructuracion`) | ⬜ |

### Detalle T1 ✅
- A1 header: `CrmSearch` (header de `/hub` y CRM) tenía `w-64` fijo + placeholder
  largo sin nowrap → wrap a 2 líneas, ⌘K encima. Fix: "Buscar…" corto + truncate,
  input completo solo ≥lg, ícono Cmd+K abajo, `gap-2 md:gap-3` en cluster derecho.
- A2 saludo: `lib/utils/saludo.ts` (`saludoHora`, zona AR) en `/admin` y `/hub`;
  subtítulo "{rol} · NORA HQ".

### Detalle T2 ✅
- Renames: "SA Hub"→NoraBrand, "Admin Hub"→"NORA HQ" (bootstrap, hub/usuarios,
  Cmd+K nav). Metadata root → "NORA HQ".
- `components/nora/nora-brand.tsx` (símbolo violeta+menta + wordmark, variantes
  sm/md/lg, `showText`, link a `/admin`). Aplicado en `HubTopBar`.
- Paleta Deep Tech verificada en `globals.css` (light/dark/nora): `--nora`,
  `--nora-bg`, `--nora-deep`, `--mint` presentes. ⚠️ En dark `--nora-deep` es
  claro (80%) → para `NoraPredicciones` (T4) usar bg violeta fijo, no el token.
- Pendiente menor: ítem "Admin Hub (nuevo)" del `crm-sidebar` se elimina en T3.

### Detalle T3 ✅
- `lib/constants/navegacion.ts`: nuevo `NAVEGACION` (8 pilares: Mission Control,
  Operación, Finanzas, Compras, Equipo, Clientes, Inteligencia, Administración
  solo-super_admin) + `navegacionParaRol(rol)` + `navItemPorHref`. Se mantiene
  `NAVEGACION_DEPARTAMENTAL` (lo usa `departamentosPermitidos`).
- `components/layout/sidebar.tsx` reescrito: grupos role-filtered, activo
  `bg-nora-bg`+`text-primary`, favoritos/recientes, colapso persistido, slot de
  badge (counts placeholder).
- `components/layout/top-nav.tsx`: sacada la barra horizontal de departamentos
  (ahora en el sidebar); marca `NoraBrand` + selectores + search + drawer mobile
  con los 8 pilares.
- `components/crm/crm-sidebar.tsx`: eliminado el ítem "Admin Hub (nuevo)" (desktop
  + mobile) y limpieza de `showAdminHub`/`adminHubLinkVisibleFor`.
- `components/icon.tsx`: +18 íconos al registry (User, Package, ClipboardCheck,
  CreditCard, Scale, FileBadge, TrendingDown, Truck, Undo2, UserCheck, Ticket,
  Store, Shield, Zap, Plug, Bot, FileSearch, Settings).
- Rutas inexistentes de Administración (usuarios, catálogo, integraciones, ia,
  auditoría, general) → `estado: 'placeholder'` (toast) hasta T5–T8. Sucursales
  apunta al `/hub/sucursales` real.
- ⚠️ Pendiente coherencia: `/hub` y CRM `/dashboard` siguen con su shell/sidebar
  propio; la unificación total a `NoraSidebar` queda como follow-up (no bloqueante).

### Detalle T4 ✅
- `app/(admin)/admin/page.tsx` reescrito a Mission Control: header con saludo,
  `NoraBriefingCard` (con botón "Conversar con NORA"), grid 4 KPIs server-side
  (ventas hoy, tickets+promedio, empleados activos, alertas críticas =
  tareas vencidas + stock crítico), `QuickActions` (6), `SucursalesLive`,
  `NoraPrediccionesPanel`. KPIs/sucursales/predicciones solo para roles
  transversales; operativos ven greeting + quick actions.
- Endpoints: reusa `daily-briefing` y `predictions`; nuevo
  `/api/sucursales/live-status` (tolerante a vacío; `orders` no tiene
  `sucursal_id` → facturado/tickets por sucursal en 0 hasta vincular).
- `ai-chat-dock`: escucha `window 'nora:open'` para abrir el dock desde botones.
- Predicciones en panel violeta oscuro fijo (`hsl(263 55% 12%)`), NO `--nora-deep`.
- Borrada `nora-predictions-card.tsx` (reemplazada por el panel).
- ⚠️ KPIs reales hoy: 21 orders (ninguno necesariamente de hoy), 1 empleado
  activo, 4 sucursales. Valores en 0/gris cuando no hay datos del día.

---

## 🧱 DECISIONES TOMADAS (no re-preguntar)
- NORA HQ es **orquestador**: lee datos externos vía integraciones, gestiona
  operación/equipo/finanzas/compliance/marketing/IA. No factura.
- Paleta Deep Tech: violeta `#6E3CDB` primary + menta `#2EE1A8` accent (ya en
  `globals.css`, valores HSL equivalentes vigentes desde F6.5.2).
- NORA: profesional, cercana, argentina, llama al usuario por nombre.
- Roles: matriz granular por módulo, 3 presets (super_admin, encargado_sucursal,
  empleado). Todos los empleados tendrán login eventualmente.
- Single-tenant; `sucursal_id` en todo.
- Tablas `offers_gestion`/`coupons`/`offers` son de la app cuponera (NO tocar el
  repo cuponera). Módulo de ofertas en el ERP quedó parado: existe
  `lib/types/ofertas.ts` listo para retomar fuera de esta fase.

---

## 🛑 PENDIENTE DEL USUARIO
> Migraciones SQL sin aplicar (no hay acceso DDL confirmado; aplicar en orden):
- _(ninguna nueva aún en esta sesión — se listarán acá a medida que se generen:
  `permisos_custom` en users_admin [T5], `0031_catalogo_productos` [T6],
  integraciones [T7], `ia_config` [T8])_

Heredados de F6 (ver ERP-PROGRESO.md): `CRON_SECRET` en Vercel, configurar
`tareas_triggers_auto`, linkear empleados↔users, RLS coupons/offers.

---

## 👉 PRÓXIMA ACCIÓN
**T5 · Usuarios y permisos `/admin/configuracion/usuarios`.** (1) Migración
`0031_users_admin_permisos.sql`: agregar columna `permisos_custom jsonb default
'{}'` a `users_admin` (intentar aplicar vía MCP Supabase; si no, listar en
PENDIENTE). (2) Página server `requireAdminHubAccess({allowedRoles:['super_admin']})`
con DataTable de usuarios (avatar+nombre, email, rol, sucursales, último login,
activo) — reusar lógica de `app/hub/usuarios` y `lib/supabase/admin-users.ts`.
(3) Form crear/editar: datos básicos, rol (presets), sucursales (multi), matriz
granular permisos (módulos × ver/crear/editar/eliminar/aprobar) que overridea el
preset → `permisos_custom`, activar/desactivar. (4) Crear usuario: invitación vía
Supabase admin SDK con `service_role`, **flag `is_admin_hub:true` en
`raw_user_meta_data`** (evita conflicto con trigger `handle_new_user` de cuponera).
Si falta permiso, dejar lógica lista + documentar acá. Crear el ítem del sidebar
ya existe en NAVEGACION (estado placeholder → pasar a 'activo' al terminar).
Después T6 (catálogo+migración 0032), T7 ⭐ (integraciones), T8 (model router),
T9 (polish), T10 (docs+tag).

> **Nota de sesión:** T1–T4 completadas y pusheadas en esta sesión
> (`1467a21`, `e3e1c8c`, `70b3459`, + commit T4). Retomar T5 con contexto fresco. Reemplazar el dashboard actual
(`app/(admin)/admin/page.tsx`, hoy grilla de departamentos) por:
(a) `NoraGreetingCard` (bg `--nora-bg`, saludo + resumen, botón "Conversar con
NORA" abre el dock); (b) grid 4 KPIs del día (ventas+delta, tickets+promedio,
empleados activos, alertas críticas; $0 gris si tablas vacías, nunca error);
(c) Quick Actions (6 cards con hover scale+borde violeta); (d) Sucursales en
vivo (4 cards con health border-left + endpoint `/api/sucursales/live-status`
tolerante a tablas vacías); (e) `NoraPredicciones` (card bg violeta oscuro —
usar color fijo, NO `--nora-deep` que en dark es claro). Endpoints
`daily-briefing` y `predictions` ya existen (reusar/ajustar). Los `NoraBriefingCard`
y `NoraPredictionsCard` actuales se integran/reemplazan en esta estructura.
