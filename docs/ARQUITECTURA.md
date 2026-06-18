# 🏗️ NORA HQ · Arquitectura (guía para entender y mejorar)

Documento técnico para saber **dónde está cada cosa y dónde tocar para mejorarla**.
Complemento de `RESUMEN-SISTEMA.md` (qué hace) — esto es el **cómo y el dónde**.

---

## 1. Convenciones base (leer primero)

- **Alias de imports:** `@/` = raíz del repo.
- **Supabase server:** `lib/supabase/server.ts` → `createClient()` (sesión del
  usuario, **respeta RLS**) y `createAdminClient()` (service role, **bypassa RLS**,
  solo server). Browser: `lib/supabase/client.ts` → `createClient()`.
- **Auth/gate de páginas:** `lib/admin-hub/auth.ts` → `requireAdminHubAccess({allowedRoles})`.
  Devuelve `HubProfile { id, email, nombre, rol, sucursal_id }`.
- **API routes:** patrón = `getUser()` → leer `users_admin` (rol/activo) → gatear.
  Mutaciones sensibles usan `createAdminClient()` con chequeo a nivel app (ver
  `app/api/admin/usuarios/route.ts` como molde).
- **Formularios:** F2–F6 usan `useState` (no rhf+zod todavía — deuda transversal).
- **Toasts:** `sonner` (`import { toast } from 'sonner'`).
- **Iconos:** Lucide vía registry `components/icon.tsx` (`<Icon name="..."/>`).
  ⚠️ Si usás un ícono nuevo por nombre, **agregalo al registry** o cae a HelpCircle.
- **Formato:** `lib/utils/format.ts` (`formatARS`, `formatDate`, …),
  `lib/utils/saludo.ts` (saludo por hora AR).
- **Fechas AR:** `new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'})`
  para fecha local; los crons usan ese patrón (el server corre en UTC).
- **Migraciones:** numeración correlativa en `supabase/migrations/`. Se aplican vía
  MCP de Supabase (todas las 0035–0040 ya aplicadas). `ADD VALUE` de enums va en
  una transacción aparte del uso.
- **Build gate:** `npm run build` (Next con `ignoreBuildErrors:true`; igual mantené
  TS sano). Hoy: 72 rutas, verde.

---

## 2. Shells y navegación (dónde vive la UI)

| Shell | Layout | Sidebar/Nav | Para qué |
|-------|--------|-------------|----------|
| `/admin/*` | `app/(admin)/layout.tsx` → `components/layout/admin-shell.tsx` | `components/layout/sidebar.tsx` (8 pilares) + `top-nav.tsx` | **NORA HQ (principal)** |
| `/hub/*` | `components/hub/hub-shell.tsx` | `components/hub/hub-sidebar.tsx` + `hub-top-bar.tsx` | Legacy (finanzas, stock, RRHH…) |
| `/dashboard`, `/pedidos`, `/clientes` | `components/crm/*` | `crm-sidebar.tsx` + `crm-top-bar.tsx` | CRM de pedidos |

**Para agregar un ítem al sidebar de NORA HQ:** editar `lib/constants/navegacion.ts`
→ array `NAVEGACION` (grupos × items con `rolesPermitidos`, `estado`, `badge`).
`navegacionParaRol(rol)` filtra. Badges dinámicos: `app/api/admin/badge-counts/route.ts`
+ fetch en `sidebar.tsx`. Estados de item: `activo` | `placeholder` (toast "en
construcción") | `fase2` | `externo`.

> ⚠️ Deuda: `/hub` y CRM tienen su propio sidebar. Unificar todo a `NoraSidebar`
> es un follow-up. `NAVEGACION_DEPARTAMENTAL` (viejo) sigue por
> `departamentosPermitidos`.

### 2.1 Unificación de shells (v0.18 · en curso) — Mapa de migración `/hub → /admin`

**Meta:** `/admin` es el ÚNICO panel (shell `(admin)/layout.tsx` + `NAVEGACION`).
Todo `app/hub/*` se mueve a `app/(admin)/admin/*`. El CRM de pedidos
(`/dashboard`, `/pedidos`, `/clientes` raíz) y la cuponera quedan APARTE
(links externos en el sidebar). `/hub/*` no se borra: **redirige** a su
equivalente `/admin/*` (red de seguridad para links viejos).

**Patrón de move (por página):** `git mv app/hub/X app/(admin)/admin/X` y
**quitar el wrapper `<HubShell profile=…>`** (el layout `(admin)` ya provee
shell). Mantener `requireAdminHubAccess()` para auth/profile/queries. Los
client components co-ubicados viajan con el folder (imports `@/` absolutos).

**Mapa por grupo:**

| Grupo | `/hub/*` → `/admin/*` |
|-------|------------------------|
| Operaciones | `operaciones/{stock,stock/[id],stock/nuevo,transferencias,transferencias/[id],transferencias/nueva,vencimientos,alertas,analisis,importaciones,inventarios,inventarios/[id],reposicion}` → idem en `/admin` |
| Finanzas | `finanzas/*` (índice, caja, calendario, cash-flow, cheques(+nueva), conciliacion, cuentas(+[id]+nueva), documentos, gastos-fijos, impuestos, pagos, proveedores(+[id])) → `/admin/finanzas/*` |
| Finanzas (legacy top-level) | `facturas(+[id]+nueva)`, `pagos(+[id]+nuevo)` → `/admin/facturas/*`, `/admin/pagos/*` |
| Compras | `proveedores(+[id]+nuevo)`→`/admin/proveedores/*`; `recepciones(+[id]+nueva)`→`/admin/recepciones/*`; `compras/devoluciones(+[id]+nueva)`→`/admin/compras/devoluciones/*` |
| Equipo/RRHH | `rrhh/empleados(+[id]+nuevo)`→`/admin/rrhh/empleados/*`; `sucursales/performance`→`/admin/sucursales/performance`; `aprobaciones`→`/admin/aprobaciones` |
| Clientes | `clientes(+[id]+nuevo)`→`/admin/clientes/*`; `ia/tickets`→`/admin/ia/tickets` |
| Inteligencia | `ejecutivo`→`/admin/ejecutivo`; `bi`→`/admin/bi`; `ia/resumen`→`/admin/ia/resumen` |
| Sucursales | `sucursales(+[id]+nueva)`→`/admin/sucursales/*`; `sucursales/caja(+[id])`→`/admin/sucursales/caja/*`; `sucursales/gastos`→`/admin/sucursales/gastos` |
| Root | `/hub` → redirect `/admin` |

**Conflictos resueltos:**
- `/hub/usuarios` es duplicado legacy de `/admin/configuracion/usuarios` →
  **no se mueve**; `/hub/usuarios` redirige a `/admin/configuracion/usuarios`.
- `/admin/empleados` (contexto tareas/gamificación, ya existía) ≠
  `/admin/rrhh/empleados` (RRHH) → conviven, rutas distintas.
- Dos `proveedores` (`/admin/proveedores` compras + `/admin/finanzas/proveedores`)
  y dos `pagos` (`/admin/pagos` legacy + `/admin/finanzas/pagos`) conviven; merge
  futuro opcional.

**Sidebar:** `NAVEGACION` ya estaba unificado (lista todas las secciones), solo
apuntaba a `/hub/*`. Tras mover, se repuntan los `href` a `/admin/*` y se agregan
los links externos (CRM Pedidos ↗, Cuponera ↗). Las APIs (`app/api/*`) no se
tocan (no viven bajo `/hub`).

---

## 3. Mapa por módulo (ruta → archivos → tablas)

### Mission Control — `/admin`
- Página: `app/(admin)/admin/page.tsx` (server, calcula KPIs).
- Componentes: `nora-briefing-card.tsx`, `nora-predicciones-panel.tsx`,
  `quick-actions.tsx`, `sucursales-live.tsx` (todos en `app/(admin)/admin/`).
- APIs: `nora/daily-briefing`, `nora/predictions`, `sucursales/live-status`.
- Tablas: lee `orders`, `empleados`, `tareas`, `stock_sucursal`, `sucursales`.

### Tareas (módulo enterprise F6-T) — el más grande
- **Bandeja** `/admin/tareas`: `page.tsx` (tabs Mi día/Pool/Mi sucursal/Todas) +
  `bandeja-v2-client.tsx` (cards, "La hago yo"). *Viejo `bandeja-client.tsx` sin uso.*
- **Detalle** `/admin/tareas/[id]/page.tsx` → `components/tareas/task-execution-panel.tsx`
  (empezar/evidencias/completar/aprobar/rechazar) + comments/history/stepper.
- **Verificación** `/admin/verificaciones` + `verificaciones-client.tsx`.
- **Reportes** `/admin/tareas/reportes`.
- **APIs:** `tareas/[id]/reclamar` (atómico), `tareas/[id]/accion` (workflow +
  pre-IA + gamificación).
- **Lógica pura:** `lib/tareas/workflow-v2.ts` (estados), `metricas.ts` (fórmulas),
  `gamification.ts` (puntos/badges/nivel), `notificaciones.ts`. `workflow.ts` (F6,
  modelo viejo) sigue para el detalle legacy.
- **Tipos:** `lib/types/tareas-enterprise.ts` (nuevo: turnos, supervisores,
  asignación, evidencias, TipoTareaFull) + `lib/types/tareas.ts` (F6).
- **Tablas:** `tareas`, `tipos_tareas`, `tareas_recurrencias`, `tareas_comentarios`,
  `tareas_historial`, `tareas_adjuntos`, `turnos_sucursal`, `supervisores_tareas`,
  `*_metricas_diarias` (4), `empleados`, `niveles_empleados`, `empleados_badges`,
  `empleados_objetivos`.

### Admin / Configuración (solo super_admin) — `/admin/configuracion/*`
| Ruta | Archivos | API | Tabla |
|------|----------|-----|-------|
| `usuarios` | `usuarios-client.tsx` | `admin/usuarios`(+`[id]`) | `users_admin` (+`permisos_custom`) |
| `catalogo` | `catalogo-client.tsx` | `admin/catalogo/importar` | `productos_catalogo` |
| `tipos-tareas` | `tipos-client.tsx` | `admin/tipos-tareas`(+`[id]`) | `tipos_tareas` |
| `turnos` | `turnos-client.tsx` | (supabase browser) | `turnos_sucursal` |
| `supervisores` | `supervisores-client.tsx` | (supabase browser) | `supervisores_tareas` |
| `recurrencias` | `recurrencias-client.tsx` | `admin/recurrencias`(+`[id]`) | `tareas_recurrencias` |
| `general` | `demo-section.tsx` | `admin/demo` | (es_demo en varias) |

Permisos: `lib/types/permisos.ts` (módulos × acciones, presets, `permisosEfectivos`).

### Finanzas / Operaciones / RRHH / CRM (F2–F5) — `/hub/*`
- Rutas en `app/hub/*`. Tipos/labels en `lib/types/admin.ts`.
- Helpers: `lib/admin-hub/factura.ts`, `pago.ts`.
- Tablas: `facturas_proveedor`, `pagos`, `cuentas_bancarias_propias`,
  `movimientos_bancarios`, `cheques`, `impuestos_obligaciones`, `productos`,
  `stock_sucursal`, `lotes_productos`, `transferencias_sucursal`,
  `inventarios_fisicos`, `devoluciones_proveedor`, `clientes_crm`,
  `caja_diaria`, `gastos_operativos`, `aprobaciones`, `empleados`.

### NORA (IA) — transversal
- Cliente: `lib/ai/client.ts` (`getAnthropic`, `hasAnthropicKey`), `config.ts`
  (`CHAT_MODEL`, `OCR_MODEL`, tokens).
- Chat: `components/ai/ai-chat-dock.tsx` (escucha evento `window 'nora:open'`),
  `app/api/ai/chat`, tools en `lib/ai/tools.ts` (registry `AI_TOOLS`).
- Tareas IA: `lib/ai/verify-evidence.ts` (visión), `nora/parse-task`,
  `nora/verify-evidence`, `nora/employee-coaching/[id]`.
- Prompts/personalidad: `lib/ai/prompts.ts`, `lib/nora/context.ts`.

### Adjuntos / comprobantes — transversal
- Componente drop-in: `components/shared/comprobantes.tsx`.
  *(Ojo: existe también `attachment-uploader.tsx` — legacy de F6 tareas.)*
- Tabla `adjuntos` (polimórfica) + bucket privado `comprobantes`.

---

## 4. Modelo de datos — claves

- **`tareas`** es el corazón. Columnas nuevas (0037): `asignacion_tipo`
  (`usuario_especifico|pool_turno|pool_sucursal|rol`), `turno_id`, `reclamada_por/at`,
  `verificacion_humana`, `verificada_por/at`, `pre_verificacion_ia` (jsonb),
  `rechazos_count`, `hora_limite`, `tiempo_resolucion_min`, `demora_min`,
  `escalamiento_nivel`, `puntos_otorgados`. Conserva las de F6 (responsable_id,
  verificador_id…) → **el detalle viejo usa esas; el flujo nuevo usa las nuevas.**
- **Reclamo atómico:** `UPDATE … WHERE reclamada_por IS NULL` (si 0 filas, ya la
  tomó otro). Patrón en `tareas/[id]/reclamar`.
- **Pre-verificación IA:** `tareas.pre_verificacion_ia = {resultado, motivo,
  analizado_at}` → alimenta el semáforo de la cola de verificación.
- **Métricas:** snapshots diarios (`*_metricas_diarias`) poblados por
  `cron/metricas-nightly`; objetivos mensuales en `empleados_objetivos`.
- **es_demo** (0040) en `tareas`/`recurrencias`/métricas → borrado seguro del demo.
- **RLS:** tablas nuevas (turnos, supervisores, métricas, adjuntos, catálogo) →
  policy "usuario admin activo". `tareas`/`tipos_tareas` (F6) accesibles a activos.
  ⚠️ `coupons`/`offers` (app cuponera) tienen RLS pendiente — decisión del usuario.

---

## 5. Crons (Vercel) — `vercel.json` + `app/api/cron/*`

| Cron | Cuándo (UTC) | Hace | Auth |
|------|--------------|------|------|
| `generar-agenda` | 08:00 (=05 AR) | crea tareas del día desde recurrencias | `isCronRequest` / POST super_admin |
| `marcar-vencidas` | 12:00 | estado→vencida | cron-secret |
| `escalamiento` | 12:30 | escala vencidas + verif estancadas | cron-secret |
| `metricas-nightly` | 03:00 | snapshots del día anterior | cron-secret |
| `reporte-semanal` | lun 10:00 | narrativa → `ai_resumenes_diarios` | cron-secret |
| `calcular-objetivos`, `check-triggers`, `resumen-diario` | varios | F6 | cron-secret |

> ⚠️ Plan **Hobby = solo daily**. Escalamiento ideal (c/30min) y reporte semanal
> real requieren **Vercel Pro**. Auth en `lib/cron/auth.ts` (`CRON_SECRET`).

---

## 6. Cómo extender (recetas)

- **Nuevo tipo de tarea:** UI en `/admin/configuracion/tipos-tareas` (CRUD), o seed
  SQL con `on conflict (codigo) do update` (ver `0038`). Campos: evidencias,
  prompt IA, checklist, puntos, alcance.
- **Nueva recurrencia:** `/admin/configuracion/recurrencias` → la levanta
  `generar-agenda`.
- **Nuevo tipo de evidencia:** `EvidenciaTipo` en `lib/types/tareas-enterprise.ts`
  + render en `components/tareas/task-execution-panel.tsx` (`EvidenceInput`) +
  validación en `lib/tareas/workflow-v2.ts`.
- **Comprobantes en otra entidad:** 1 línea en su detalle:
  `<Comprobantes entidadTipo="gasto" entidadId={x.id} />`.
- **Nueva tool de NORA:** agregar un `ToolDef` y registrarlo en `AI_TOOLS`
  (`lib/ai/tools.ts`).
- **Nuevo ítem de sidebar:** `lib/constants/navegacion.ts` + ícono en
  `components/icon.tsx`.
- **Nueva migración:** archivo `00XX_*.sql` + aplicar vía MCP (o listar en
  PLAN-MAESTRO → PENDIENTE DEL USUARIO si no hay acceso DDL).

---

## 7. Deuda técnica / oportunidades de mejora (priorizado)

1. **Unificar shells:** un solo sidebar/shell para `/admin`, `/hub`, `/dashboard`.
2. **Forms a react-hook-form + zod** (hoy `useState` en F2–F6).
3. **Detalle de gastos y cheques** (faltan páginas `[id]`) → habilita comprobantes.
4. **Kanban** en `/admin/tareas` (instalar `@dnd-kit`).
5. **Scorecards/sparklines** detallados en mi-panel/mi-equipo (hoy barras inline,
   decisión F6 "sin chart lib"; evaluar Tremor).
6. **Crons sub-diarios** → Vercel Pro.
7. **Limpiar legacy:** `bandeja-client.tsx`, `task-quick-actions.tsx`, `workflow.ts`
   (modelo viejo) una vez migrado el detalle al flujo nuevo.
8. **Mobile audit 375px** en pantallas legacy F2–F5.
9. **RLS coupons/offers** (decisión de seguridad pendiente).
10. **F6.5 T7** gestor de integraciones ⭐ y **T8** model router de IA (diferidos).
11. **Vincular `orders.sucursal_id`** (hoy usan `zona_id`) → facturado/tickets por
    sucursal en Mission Control.

---

## 8. Para retomar / orientarse
- `docs/PLAN-MAESTRO.md` — fases, sub-tandas, **PRÓXIMA ACCIÓN** (fuente de verdad).
- `docs/RESUMEN-SISTEMA.md` — qué hace cada cosa (alto nivel).
- `docs/AUDITORIA-GAPS.md` — gaps por ruta con severidad.
- `docs/OBJETIVOS-NORA-HQ.md` — los 8 objetivos.
- **Este doc** (`ARQUITECTURA.md`) — dónde tocar para mejorar.

> Sesión nueva de desarrollo autónomo: **"continuá el plan maestro"**.
