# ERP Social Ahorro · Progreso autónomo

**Última actualización:** 2026-05-21
**Rama productiva:** `main` (feature/crm-redesign mergeada — prod al día)
**Último commit:** `356709e` — triggers de stock crítico y lote por vencer

> Sesión 2026-05-19→21: se mergeó todo F1–F6 a `main` y se desplegó a
> producción (`vercel deploy --prod`). Se arreglaron los crons al plan Hobby
> (daily). Se completó F3.4 (conteo + cierre de inventario con ajuste de
> stock vía RPC `cerrar_inventario_fisico`), F3.5 (detalle de devolución con
> avance de estado) y se conectaron 2 eventos de check-triggers
> (`stock_critico_detectado`, `lote_proximo_vencer`).

---

## ✅ Hecho — F1 + F2 + F3 + F4 + F5 + F6 (6/6 fases)

### Sesiones previas (F1–F5)
- **F1** Bugfix + Cmd+K + notificaciones (4/4)
- **F2** Finanzas: cuentas, cash flow, conciliación, cheques, impuestos (6/6)
- **F3** Operaciones: stock, vencimientos, transferencias, inventarios, devoluciones (6/6)
- **F4** IA Interna con Claude: chat dock, API streaming, 8 tools, resumen diario, OCR tickets (7/7)
- **F5** Departamentos: CRM B2B, BI, ejecutivo, RRHH, caja, gastos, performance, aprobaciones (8/8)

### F6 · Tareas Enterprise + Empleados + Gamificación (esta sesión — todas las sub-tandas)

| Sub-tanda | Commit | Pantallas / módulos |
|-----------|--------|---------------------|
| F6.1 Schema completo | `79bc7b1` | Migración `0030` — 10 tablas + 9 enums + RLS + indexes |
| F6.3 Seed 16 tipos | `79bc7b1` | Migración `0031` upsert con on conflict |
| F6.4 Types + constants | `79bc7b1` | `lib/types/{tareas,empleados}.ts` + `lib/constants/{tareas,badges,kpis}.ts` |
| F6.5 Componentes base | `5fa3f28` | task-card, badges (status/priority/SLA), workflow-stepper, comments con menciones, history-timeline, quick-actions, empleado-avatar, score-progress, badge-display |
| F6.9 Workflow engine | `5fa3f28` | `lib/tareas/workflow.ts` — 11 acciones, 3 niveles, validación de evidencia, ejecutarAccion atómica |
| F6.6+F6.7+F6.8 Bandeja+detalle+form | `bf2f578` | `/admin/tareas` con tabs y filtros, `/admin/tareas/[id]` con stepper y quick actions, Sheet derecho para crear |
| F6.13 Mi panel | `7e5ac84` | `/admin/mi-panel` — hero + KPIs + tabs Hoy/Objetivos/Mis tareas/Badges/Legajo |
| F6.14 Mi equipo | `7e5ac84` | `/admin/mi-equipo` para supervisores · `/admin/ranking` con medallero · `/admin/empleados` · `/admin/objetivos` |
| F6.19 NORA tools | `2a81757` | 8 tools nuevas: crear/listar/actualizar/asignar/priorizar/get_performance/get_ranking/get_objetivos + AdminShell ahora monta NORA |
| F6.15+F6.16 Crons + gamificación | `cca7eb6` | `/api/cron/{marcar-vencidas,recurrencias,calcular-objetivos,check-triggers}` + `lib/tareas/gamification.ts` (puntos, badges, ranking) wireado al workflow |
| F6.17+F6.18+F6.20+F6.22 | `dda7818` | Notificaciones (asignación, verificación, aprobación, menciones), reportes con KPIs y tendencias, TareasRelacionadas embebible, PWA manifest + sw |
| F6.11+F6.12 Config UIs | `a8e935d` | `/admin/configuracion/{tipos-tareas,triggers-tareas}` (vista listado) |
| F6.21 Sidebar Equipo | `79bc7b1` | Departamento nuevo en el AdminShell con 7 items (Tareas, Mi panel, Mi equipo, Empleados, Objetivos, Ranking, Reportes) |

### NORA (rename del asistente IA)
- Renombrado de "Asistente IA" → **NORA** en prompts, chat dock, saludo, aria-labels.
- Identidad: profesional pero cercana, voseo argentino, conciso. No usa emojis innecesarios.
- Acciones que modifican datos requieren confirmación humana antes de ejecutar (`crear_tarea`, `actualizar_estado_tarea`, `asignar_tarea`).
- AdminShell del nuevo ERP `/admin/*` también monta NORA — antes solo estaba en `/hub/*`.

---

## 🛑 Acciones pendientes del usuario (no bloqueantes — el build pasa)

> Las migraciones `0028`–`0032` ya están aplicadas en Supabase (proyecto
> `hrjxjbirajbsurobqdca`). Esto es lo que queda y depende de vos:

1. **Setear `CRON_SECRET` en Vercel** (Settings → Environment Variables).
   Sin esto los 5 crons —incluido `check-triggers`— responden 401 y nunca
   corren. **Bloquea** que los triggers automáticos generen tareas.
2. **Configurar los triggers en `tareas_triggers_auto`** — para que
   `stock_critico_detectado` y `lote_proximo_vencer` (recién implementados)
   generen tareas, tiene que existir una fila activa con ese `evento` y un
   `tipo_tarea_id` (ej. tarea de reposición). El builder visual sigue
   read-only, así que se cargan por SQL.
3. **Linkear empleados con users**: `update empleados set user_id = ... where dni = ...;`.
   Sin esto el scoring/objetivos/mi-panel no encuentran al empleado del user logueado.
4. **Cargar productos y stock** (Operaciones → Stock). Sin datos en
   `productos`/`stock_sucursal`/`lotes_productos`, el inventario físico y los
   triggers de stock no tienen sobre qué operar.
5. **Decisión de seguridad: RLS en `coupons`/`offers`** — hoy están con RLS
   deshabilitado (advisor crítico de Supabase). Habilitarlo sin policies
   rompe la cuponera pública; hay que diseñar las policies primero.
6. (Opcional) **Upgrade a Vercel Pro** para volver los crons a sub-diarios
   (`marcar-vencidas` cada 30', `check-triggers` horario). Hoy son daily por
   el límite del plan Hobby.
7. (Opcional) Agregar `public/icon-192.png` y `public/icon-512.png` para el
   install prompt de la PWA.

---

## 📊 Estado de calidad
- **Build local:** verde después de cada commit (`✓ Compiled successfully`).
- **TS strict:** sin errores en archivos nuevos; un diagnostic preexistente de `globals.css` no bloquea (next.config.mjs tiene `ignoreBuildErrors: true`).
- **Mobile + dark mode:** sí en todas las pantallas F6.
- **RLS:** tareas accesibles a cualquier user activo; tareas tools de NORA corren con la sesión del usuario.
- **Auditoría:** cada cambio de estado, asignación o creación queda en `tareas_historial` + comentario de cambio.
- **PWA:** installable; SW network-first sin caching agresivo (datos del ERP no deben cachearse offline).

---

## 💡 Decisiones tomadas en esta sesión

- **Forms con `useState`** en F6, consistente con F2-F5 (rhf+zod queda como mejora futura unificada).
- **Workflow engine puro** (`lib/tareas/workflow.ts`) — separado de UI; se invoca tanto desde quick actions como desde NORA tools y crons.
- **Gamificación hookeada al workflow** — al transicionar a 'completada' se otorgan puntos y se evalúan badges sin código extra en la UI.
- **Tools de NORA con `ToolCtx`** — las que modifican datos reciben `{userId, rol}` para el workflow engine (permisos por usuario, no por service role).
- **Sin chart lib** — visualizaciones inline con bars/progress consistentes con BI/Performance de F5.
- **`/admin/empleados/[id]` linkea a `/hub/rrhh/empleados/[id]`** — evita duplicar la ficha completa; el detalle vive en el shell legacy mientras el resto del módulo Equipo vive en el shell nuevo.
- **Editor visual de tipos/triggers diferido** — las pantallas de configuración son listado read-only; los tipos se gestionan vía SQL (`0031_seed_tipos_tareas.sql` con `on conflict do update`). Implementar el builder visual es una sub-tanda futura porque requiere form schema dinámico, drag-and-drop y preview en vivo.
- **Evidencias avanzadas diferidas** — el quick-actions exige las evidencias declaradas en el tipo pero solo soporta comentario/motivo en el dialog inline. Captura de foto, firma canvas, GPS y QR (F6.10) requieren componentes específicos cada uno y bucket dedicado; quedan como sub-tanda futura.

---

## 🐛 Deuda técnica (priorizada)

1. **F6.10 evidencias completas** — `tareas-evidencias` bucket + 11 componentes (foto cámara, firma canvas, checklist, GPS, QR, archivo, monto arqueo, duración, nota, foto termómetro, firma digital). El workflow ya valida que estén las evidencias requeridas; falta el flujo de captura/upload.
2. **F6.11+F6.12 builder visual completo** — alta/edición de tipos con campos custom + builder de triggers visual ("cuando … y … entonces …"). Las pantallas listado ya están; falta el editor.
3. **F6.17 escalamiento de notificaciones** — hoy se notifica al responsable. Faltan reglas de escalamiento al supervisor cuando la tarea está próxima a vencer.
4. **Eventos de check-triggers aún sin conectar**: pago_pendiente_aprobacion, pedido_atrasado, diferencia_recepcion, conciliacion_pendiente, empleado_ausente, empleado_no_ficho_apertura, cliente_vip_sin_compra_60d, habilitacion_proxima_vencer, matricula_proxima_vencer, temperatura_fuera_rango. Ya implementados: factura_proxima_vencer, factura_vencida_sin_pagar, caja_no_cerrada_eod, **stock_critico_detectado**, **lote_proximo_vencer**. Falta agregar el case de cada uno en `detectarEventos`.
5. **Badges con streak/compliance** — `super_responsable` (SLA 30 días seguidos) y `compliance` (todas las regulatorias del mes) — su cálculo necesita ventanas históricas que hoy `evaluarBadges` no implementa.
6. **Drag-and-drop kanban + vista calendario** en `/admin/tareas` — hoy solo lista. Requiere @dnd-kit y un reordenamiento por columnas.
7. **Tag de sucursal en `orders`** (heredado de F5) — sin esto las ventas por sucursal en BI siguen sin poder calcularse.
8. **Export CSV/Excel** en los reportes (deferred).
9. **Iconos PNG reales para la PWA** (192, 512).

---

## 🚀 Próximos pasos sugeridos

- **Aplicar las 4 migraciones pendientes** (0028, 0029, 0030, 0031) y linkear empleados↔users.
- **F6.10 evidencias completas** — el módulo de tareas es la columna vertebral del ERP de campo (sucursal), y sin captura real de foto/firma/GPS pierde valor regulatorio.
- **F6.11+F6.12 builder visual** — para que el equipo (no técnico) pueda crear/editar tipos y triggers sin tocar SQL.
- **Conectar los eventos de check-triggers** al resto del ERP — el momento "wow" del sistema: stock cae bajo mínimo → automáticamente aparece tarea de reposición asignada al comprador.
- Fase 7 (cuando me la pases) — el módulo Equipo está listo para ser la base de capacitaciones, evaluaciones y formación.

---

## 📋 Cómo retomar

```bash
git checkout feature/crm-redesign && git pull
cat docs/ERP-PROGRESO.md
cat supabase/migrations/README.md   # cómo aplicar las pendientes
```
