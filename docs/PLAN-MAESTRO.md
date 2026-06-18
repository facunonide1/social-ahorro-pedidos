# 🗺️ PLAN MAESTRO · NORA HQ

> **Cómo retomar:** una sesión nueva que arranque con **"continuá el plan
> maestro"** debe leer este archivo + `docs/ERP-PROGRESO.md` y seguir desde
> **PRÓXIMA ACCIÓN** sin pedir contexto.
>
> **Regla permanente:** actualizar este archivo después de CADA sub-tanda.

**Última actualización:** 2026-06-18 · **Rama:** `main` · **Sistema:** NORA HQ
(orquestador, NO factura ni reemplaza SIFACO) · single-tenant (Social Ahorro)
con `sucursal_id` en todo para escalar.

---

## 🟣 SESIÓN ACTUAL — OPERACIONES/STOCK → WMS (en curso)

Reconstrucción del sector Operaciones a WMS con import de Excel diario, ventas
por diferencia, análisis y disparadores de tareas. Ver auditoría previa en
`docs/AUDITORIA-OPERACIONES.md`.

| Sub-tanda | Estado |
|-----------|--------|
| T0 · Fix header /hub (buscador) | ✅ `87edf4b` |
| T1 · Unificar productos → productos_catalogo (raíz del bug, FKs 0041) | ✅ `0c3ebc2` |
| T2 · Schema WMS (0042: stock_items + trigger, movimientos firmados, lotes, rotacion, imports, config, alertas) | ✅ aplicada |
| T3 · Importador stock diario (ventas por diferencia) ⭐ | ✅ |
| T4 · Importador vencimientos | ✅ |
| T5 · Stock (rehacer: Productos + Kárdex) | ✅ |
| T6 · Análisis ventas + dinero dormido + cron metricas-stock | ✅ |
| T7 · Reposición ⭐ | ✅ |
| T8 · Alertas ⭐ (9 tipos + stock fantasma) | ✅ |
| T9 · Vencimientos (acciones transferir/devolver/ofertar) | ✅ |
| T10 · Transferencias + redistribución (mueven stock) | ⬜ |
| T11 · Inventarios (4 sucursales reales) | ⬜ |
| T12 · CrearTareaRapida + recepción→stock + NORA tools + demo + tag v0.8 | ⬜ |

### 👉 PRÓXIMA ACCIÓN: **T10 · Transferencias + redistribución** (`/hub/operaciones/transferencias`). Workflow que MUEVE stock: borrador→solicitada→aprobada→en_transito (movimiento transferencia_out, descuenta origen)→recibida (receptor confirma ítem por ítem, transferencia_in, suma destino; diferencias→recibida_con_diferencias+alerta+tarea). Reescribir estado-actions para insertar movimientos firmados. Caja violeta "NORA sugiere N redistribuciones" (>45d stock en una suc y <10 en otra → mover diferencia, botón Crear). Form nueva con autocomplete SKU + stock disponible inline. Remito PDF. Export. Luego T11 inventarios 4 sucursales (ajustan stock vía movimientos conteo), T12 CrearTareaRapida + recepción→stock + NORA tools + demo 60d + tag v0.8-operaciones-completo.
Prerrequisitos: **`npm i xlsx`** (SheetJS, no instalado) + helper
`lib/utils/export-excel.ts` (regla global: toda pantalla de productos exporta
.xlsx con SKU). Lógica de procesamiento reusable en
`lib/inventario/procesar-stock-import.ts` (separada del upload, para el futuro
agente SIFACO F20). Modelo ya listo: el import calcula `delta = stock_nuevo −
stock_items.cantidad` por producto e inserta un movimiento firmado
(`venta` si bajó, `import_diferencia` si subió, `discrepancia` si la
cantidad_vendida declarada difiere de la baja) — el **trigger
`movimientos_stock_aplicar` deriva `stock_items`** (no setear absoluto a mano).
Idempotente por `hash_archivo`. Matching SKU→EAN→fuzzy nombre→`matcheos_aprendidos`.
Mapeo configurable guardado en `config_import_stock`. Menú Operación (8 secciones)
y nav se wirean a medida que cada pantalla T3–T11 existe (patrón placeholder).

> Decisiones tomadas: catálogo único = `productos_catalogo`; `productos` (vieja,
> vacía) en desuso. `movimientos_stock.cantidad` = delta FIRMADO. Stock screen
> vieja (form a `productos`) superseded por T5.

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
| **T5** | Usuarios y permisos `/admin/configuracion/usuarios` (+ migración `permisos_custom`) | ✅ (migración 0035 aplicada) |
| **T6** | Catálogo de productos `/admin/configuracion/catalogo` + importador CSV | ✅ (migración 0036 aplicada) |
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

### Detalle T6 ✅
- Migración `0036_catalogo_productos.sql` (tabla `productos_catalogo` + enum
  categoría + RLS users_admin activo + trigger updated_at) — **aplicada vía MCP**.
- `lib/types/catalogo.ts`: tipo + categorías + labels + `VademecumData`.
- `/admin/configuracion/catalogo` (super_admin): tabla + filtros (categoría,
  laboratorio, receta, psicotrópico) + search (nombre/SKU/barras) + alta/edición
  (form completo + vademécum 4 campos) vía supabase browser. Foto = URL por ahora
  (upload a bucket queda como mejora futura).
- `/admin/configuracion/catalogo/importar`: parser CSV propio (comillas/`,`/`;`/CRLF),
  auto-mapeo de columnas, preview, modo de conflicto por SKU
  (saltear/actualizar/abortar) → `POST /api/admin/catalogo/importar` (gate
  super_admin, normaliza categoría/boolean/número, dedup por SKU, upsert/insert).
- Ítem del sidebar a 'activo'.

### Detalle T5 ✅
- Migración `0035_users_admin_permisos.sql` (col `permisos_custom jsonb`) —
  **aplicada vía MCP Supabase** (no pendiente).
- `lib/types/permisos.ts`: 7 módulos × 5 acciones, presets por rol,
  `permisosEfectivos(rol, custom)` + `puede(...)`.
- `lib/supabase/admin-users.ts`: `updateAdminUser` (rol/sucursal/activo/permisos/
  nombre) + `permisos_custom` en alta.
- API `POST /api/admin/usuarios` + `PATCH /api/admin/usuarios/[id]` (gate
  super_admin; salvaguarda anti-autobloqueo). Reusa `createAdminUser`
  (flag `is_admin_hub:true`).
- Página `/admin/configuracion/usuarios` (super_admin): tabla enriquecida con
  auth (nombre/email/último login) + cliente con alta/edición y matriz de
  permisos (toggle "personalizar" → guarda matriz completa en `permisos_custom`).
- Ítem del sidebar pasó a 'activo'.

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

## 🧩 FASE 6-T · MÓDULO DE TAREAS ENTERPRISE + AUDITORÍA + DEMO (sesión actual)

### PASO 0 · Inventario auditoría F6 (qué existe / qué falta / contradicciones)

**Existe en DB (migr. 0030/0031/0033/0034):**
- `tareas` (workflow responsable/verificador/aprobador_final, evidencias jsonb,
  recurrencia_id, puntos_obtenidos, tiempo_resolucion_horas…)
- `tipos_tareas` (categoria, evidencia_requerida, niveles_workflow,
  ia_prompt_verificacion, verificacion_ia, puntos_completar, plantillas…)
- `tareas_recurrencias` (patron/dias_semana/dia_mes/hora_creacion,
  responsable_default_id, sucursal_id…), `tareas_triggers_auto`,
  `tareas_comentarios` (menciones), `tareas_historial`, `tareas_adjuntos`
- `empleados` (+score_total, nivel_actual_id, badges_obtenidos, sucursales_acceso),
  `empleados_badges` (10 seed), `niveles_empleados` (9 seed ✅),
  `empleados_objetivos` (kpis jsonb, score_pct, estado), `empleados_kpis_catalogo`,
  `empleados_historial_niveles`, `empleados_evaluaciones`
- Enums: `tarea_estado` (pendiente/asignada/en_progreso/en_verificacion/
  en_aprobacion/bloqueada/completada/descartada/vencida/rechazada),
  `tarea_origen` (auto_sistema/manual/plantilla/recurrencia),
  `tarea_categoria` (…+limpieza/seguridad/inventario, **falta cadena_frio**),
  `tarea_prioridad`, `tarea_historial_accion`
- Buckets: covers, delivery-proofs, proveedor-documentos, tickets-validacion
  (**faltan** tareas-evidencias, comprobantes)

**Código existente:** `app/(admin)/admin/tareas/{page,[id],reportes,bandeja-client,
nueva-tarea-sheet}`, mi-panel, mi-equipo, objetivos, ranking, empleados ·
`components/tareas/*` (task-card, workflow-stepper, comments, history-timeline,
quick-actions, badges, relacionadas) · `components/empleados/*` ·
`lib/tareas/{workflow,gamification,notificaciones}.ts` · crons
{marcar-vencidas, recurrencias, calcular-objetivos, check-triggers} ·
endpoints nora {parse-task, verify-evidence, employee-coaching}.

**FALTA (crear):** `turnos_sucursal`, `supervisores_tareas`, las 4 tablas de
métricas snapshot (`empleados/sucursales/supervisores_metricas_diarias`,
`tipos_tareas_metricas_mensuales`), buckets tareas-evidencias + comprobantes,
tabla `adjuntos` polimórfica (T13), `lib/tareas/metricas.ts`, pantallas
configuracion/{turnos,supervisores,recurrencias}, /admin/verificaciones, crons
generar-agenda/escalamiento/metricas-nightly/reporte-semanal.

**CONTRADICCIONES con el diseño nuevo (este diseño MANDA → ALTER, no duplicar):**
- `tareas`: el modelo nuevo usa **asignación híbrida** (asignacion_tipo
  usuario_especifico/pool_turno/pool_sucursal/rol + turno_id + reclamada_por/at)
  vs el viejo responsable/verificador/aprobador. → ALTER agrega columnas nuevas,
  conservando las viejas (no romper bandeja/workflow actuales).
  Faltan: verificacion_humana, verificada_por/at, pre_verificacion_ia,
  rechazos_count, hora_limite, tiempo_resolucion_min, demora_min,
  escalamiento_nivel, puntos_otorgados, creado_por_nombre. estado +`reclamada`,
  origen +`auto_recurrencia`/`nora`.
- `tipos_tareas`: faltan alcance(global/por_sucursal)+sucursales_ids,
  verificacion_humana, checklist_items. categoria +`cadena_frio`.
- `tareas_recurrencias`: faltan asignacion_tipo, turno_id, usuario_fijo_id,
  hora_limite, titulo_override (existe titulo_plantilla → reusar).
- `empleados_objetivos`: faltan proyeccion_pct, comentario_nora.
- Decisión: **score/nivel viven en `empleados`** (ya existe score_total +
  nivel_actual_id), NO en users_admin.

### Sub-tandas F6-T
| # | Sub-tanda | Estado |
|---|-----------|--------|
| 0 | Auditoría/inventario | ✅ (acá arriba) |
| T1 | Schema definitivo (migración ALTER+CREATE) | ✅ (0037 aplicada) |
| T2 | Admin turnos + supervisores | ✅ |
| T3 | Tipos de tareas CRUD + seed 16 | ✅ (0038 aplicada) |
| T4 | Motor recurrencias + agenda + crons | ✅ |
| T5 | Bandeja + pool + reclamar | ✅ |
| T6 | Ejecución + evidencias + workflow | ✅ |
| T7 | Cola de verificación supervisor | ✅ |
| T8 | Escalamiento + notificaciones | ✅ |
| T9 | Motor de métricas | ✅ |
| T10 | Scorecards y objetivos UI | ✅ |
| T11 | Gamificación | ✅ (cableada en T6 + ranking F6) |
| T12 | NORA en tareas | ✅ (pre-verif IA auto + reporte semanal) |
| T13 | Auditoría gaps + adjuntos/comprobantes | ✅ (0039; 4/6 entidades + gaps doc) |
| T14 | Datos demo | ✅ (es_demo 0040; seed tareas+métricas cargado) |
| T15 | Cierre + tag v0.7-tareas-completo | ✅ |

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
**T7 ⭐ · Gestor de APIs / Integraciones `/admin/configuracion/integraciones`.**
(1) Migración `0037_integraciones.sql`: tablas `integraciones` (codigo, nombre,
tipo [api_rest/db_directa/csv_programado/webhook], estado, config jsonb [solo
refs a env vars, NUNCA secrets], ultima_sincronizacion, activa, timestamps),
`integraciones_logs`, `integraciones_mapeos` + seed (SIFACO, WooCommerce, AFIP,
Mercado Pago, WhatsApp Business, Telegram, Hikvision, Email/Resend) + RLS
super_admin. Aplicar vía MCP. (2) Grid de cards con estado/dot/última sync +
acciones Configurar/Test/Logs/Activar. (3) Wizard 4 pasos. (4)
`lib/integraciones/runner.ts` con interfaz (testConnection/sync/getLogs) +
adapter pattern; **adapter WooCommerce REAL** (env WOOCOMMERCE_URL/CONSUMER_KEY/
SECRET; reusar sync existente en `lib/woo/sync.ts`, no romperlo); resto stubs
"pendiente". (5) Cron `/api/cron/run-integrations` (cada 15min, según frecuencia).
Pasar ítem sidebar a 'activo'. Luego T8 (model router), T9 (polish), T10 (docs+tag).

### Sub-tandas previas
**T5 · Usuarios y permisos** ✅ · **T6 · Catálogo + importador CSV** ✅.
**F6.5 T7 (integraciones) y T8 (model router) quedaron DIFERIDOS** detrás de
la fase F6-T (módulo de tareas), por pedido del usuario.

---

## 👉 PRÓXIMA ACCIÓN
**F6-T COMPLETA (T1–T15) ✅ — tag `v0.7-tareas-completo`.** Módulo de tareas
enterprise operativo end-to-end. **Próxima fase sugerida: F7 · Vencimientos WMS.**
Pendientes de pulido (no bloqueantes): adjuntos en gastos/cheques (sin detalle),
scorecards detallados, Kanban (`@dnd-kit`), crons sub-diarios (plan Pro), tools
NORA extra, y F6.5 T7 (integraciones) / T8 (model router) diferidos.

<details><summary>Referencia histórica T12</summary>

**T12 · NORA en tareas.** Agregar tools en `lib/ai/tools.ts`: `crear_tarea`
(preview→confirmación), `listar_tareas`, `reclamar_tarea` (reusa
`/api/tareas/[id]/reclamar`), `estado_cumplimiento(scope,id,periodo)` (lee
snapshots T9), `quien_esta_en_riesgo` (proyección<80% de empleados_objetivos),
`resumen_cola_verificacion`. `parse-task` y `verify-evidence` YA existen (F6) —
falta: wirear verify-evidence automático al subir la última evidencia (en
`task-execution-panel`/`/api/tareas/[id]/accion`), y el bloque "Crear con NORA"
en `NuevaTareaSheet`. Cron `reporte-semanal` (lunes, daily-aprox por Hobby) →
`ai_resumenes` + notif. Detección de patrones en `metricas-nightly`.

Después: **T13 ⭐ Auditoría integral del ERP + adjuntos/comprobantes** (tabla
`adjuntos` polimórfica + bucket comprobantes [ya creado en 0037] +
`<ComprobanteUploader/>`/`<ComprobantesList/>` en facturas/pagos/recepciones/
gastos/cheques/devoluciones + `docs/AUDITORIA-GAPS.md` + fixes) — GRANDE, fresca.
**T14 ⭐ Datos demo 60 días** (columna `es_demo` + `scripts/seed-demo.ts` +
endpoints cargar/borrar en config general) — GRANDE, fresca.
**T15 Cierre** (`docs/OBJETIVOS-NORA-HQ.md`, reconciliar este plan + ERP-PROGRESO,
tag `v0.7-tareas-completo`).

> ESTADO F6-T: T1–T10 ✅ · T11 (gamificación) ✅ por cableado: el workflow
> (`/api/tareas/[id]/accion` → `premiar()` → `gamification.alCompletarse`) ya
> otorga puntos, evalúa badges (10 seed) y recalcula nivel con notificación de
> subida; `/admin/ranking` (F6) muestra el ranking. Badges de racha/compliance
> necesitan ventana histórica (deuda F6, diferido). T12–T15 pendientes.

> NOTA T10: Mission Control muestra "Tareas C/T · %" por sucursal con health
> (amarillo <70%, rojo si hay escalado nivel 3) vía `/api/sucursales/live-status`.
> Scorecards/sparklines detallados se apoyan en mi-panel/mi-equipo/reportes (F6)
> + snapshots T9; charts con barras inline (decisión F6 "sin chart lib").

> NOTA T4: cron `generar-agenda` (GET cron-secret / POST super_admin), idempotente
> por recurrencia+día, dispara por patrón (diaria/semanal·dias/mensual·dia/única).
> `vercel.json` daily por plan Hobby (generar-agenda 08:00 UTC = 05:00 AR; se sacó
> el cron `recurrencias` legacy del schedule, el archivo queda pero no se agenda).
> CRUD recurrencias en `/admin/configuracion/recurrencias` + RegenerarAgendaButton.
> Escalamiento/métricas/reporte-semanal: sus crons se agregan en T8/T9/T12 (daily
> por Hobby; el de 30min y el semanal quedan documentados como ideal-Pro). (1) `app/api/cron/generar-agenda/route.ts`
(05:00 AR): lee `tareas_recurrencias` activas → las que tocan HOY (patron/dias_
semana/dia_mes) → crea `tareas` con asignacion_tipo/turno/sucursal/hora_limite/
fecha_vencimiento. Idempotente (no duplicar por recurrencia+día: chequear existencia
por recurrencia_id + rango del día). Auth: header `x-cron-secret`/CRON_SECRET o
super_admin. (2) `vercel.json`: generar-agenda 05:00, escalamiento cada 30min,
metricas-nightly 02:00, reporte-semanal lunes 07:00 (registrar paths aunque los
crons se construyan en T8/T9/T12). (3) Botón super_admin "Regenerar agenda de hoy"
en /admin/tareas (llama al endpoint). (4) CRUD recurrencias en
`/admin/configuracion/recurrencias` (listar/pausar/editar/eliminar) + toggle
"repetir" en el form de tarea (T5). Recurrencias usan columnas 0037
(asignacion_tipo, turno_id, usuario_fijo_id, hora_limite). Luego T5–T15.

> NOTA T3: CRUD de tipos vía API admin (`/api/admin/tipos-tareas` POST + [id]
> PATCH, gate super_admin/gerente). Form con evidencias multi + checklist builder
> + prompt IA. 16 tipos farmacia seedeados (0038, on conflict do update). 25 tipos
> totales activos. `/admin/configuracion/tipos-tareas` ya
existe (listado read-only de F6). Completar a CRUD: form con básicos, apariencia
(icono/color), alcance global/por_sucursal (+sucursales_ids), workflow
(verificacion_humana + verificacion_ia + ia_prompt_verificacion), evidencias
multi-select (foto/firma/checklist/gps/qr/monto_arqueo/foto_termometro/archivo/nota),
checklist builder, puntos, plantillas. Migración seed `0038_seed_tipos_farmacia.sql`
con los 16 tipos (apertura/cierre/caja/cadena_frío/limpiezas/psicotrópicos/
góndolas/recepción/conciliación/depósito/mantenimiento/capacitación/VIP/libre) —
usar `on conflict (codigo) do update`. Aplicar vía MCP. Tipos usan columnas de
0037 (alcance, verificacion_humana, checklist_items). Luego T4 (recurrencias +
generar-agenda + crons), T5–T15.

> NOTA T2: turnos y supervisores escriben vía supabase browser (RLS 0037:
> super_admin/gerente). Solapamiento de turnos = warning, no bloquea. `/admin/configuracion/turnos` (selector
sucursal → cards de turnos + form con chips de días, validación de solapamiento
warning) y `/admin/configuracion/supervisores` (tabla + form sucursal→user→
categorías + resumen "hoy supervisan…" con vacantes en warning). API o supabase
browser con RLS ya creada (super_admin/gerente escriben). Migración 0037
**aplicada** (turnos_sucursal, supervisores_tareas + 8 turnos seed). Ítems de
sidebar nuevos en grupo Administración. Luego T3 (tipos+seed 16), T4 (recurrencias
+ generar-agenda + crons), T5–T15. (1) Migración
`0036_catalogo_productos.sql`: tabla `productos_catalogo` (sku unique,
codigo_barras, nombre, descripcion, categoria enum
[medicamento/perfumeria/cuidado_personal/dermocosmetica/maternidad/ortopedia/otros],
subcategoria, laboratorio, presentacion, droga_principal, requiere_receta,
es_psicotropico, es_refrigerado, foto_url, vademecum_data jsonb, precio_sugerido,
precio_costo_promedio, margen_pct, comision_empleado_pct, sustitutos_ids uuid[],
droguerias_preferidas text[], stock_minimo_global int, activo, timestamps,
created_by) + RLS admin/employee. Aplicar vía MCP. (2) Listado DataTable +
filtros (categoría, laboratorio, receta, psicotrópico) + search nombre/SKU/barras.
(3) Form alta/edición (upload foto + editor vademécum). (4) `/importar`: CSV drop
zone + mapeo columnas→campos + preview + conflictos por SKU (skip/actualizar/
abortar). Pasar ítem sidebar a 'activo'. Luego T7 ⭐ (integraciones), T8 (model
router), T9 (polish), T10 (docs+tag).

### Sub-tandas previas
**T5 · Usuarios y permisos** ✅ (ver detalle arriba). (1) Migración
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

> **Nota de sesión:** T1–T6 completadas y pusheadas (`1467a21`, `e3e1c8c`,
> `70b3459`, `899857a`, `7bac8f5`, `4d9e5cf`). Migraciones `0035` y `0036`
> aplicadas vía MCP. Build verde (67/67). Retomar **T7** con contexto fresco. Reemplazar el dashboard actual
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
