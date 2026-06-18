# 📋 NORA HQ · Resumen del sistema

**Qué es:** el **centro de mando inteligente** de Social Ahorro Farmacias. NO
factura ni reemplaza a SIFACO — es el **orquestador**: lee datos externos vía
integraciones y gestiona todo lo demás (operación, equipo, finanzas, compliance,
marketing, IA). Single-tenant, con `sucursal_id` en todo para escalar.

**Stack:** Next.js (App Router) · TypeScript · Supabase (Postgres + Auth + Storage
+ RLS) · Tailwind + shadcn/ui · Claude (Anthropic) para IA · Vercel (deploy + cron).

**Identidad:** paleta Deep Tech (violeta `#6E3CDB` + verde menta `#2EE1A8`),
tipografía Geist + Fraunces. **NORA** = asistente IA, profesional y cercana,
voseo argentino, llama al usuario por su nombre. Mobile-first.

**Estado:** F1–F6 ✅ · F6.5 (reestructuración) parcial ✅ · **F6-T (tareas
enterprise) ✅ completo** — tag `v0.7-tareas-completo`. Build verde (72 rutas).

---

## 🧱 Arquitectura de navegación

Tres shells conviven durante la transición:
- **`/admin/*`** — NORA HQ (shell principal nuevo): TopNav + **Sidebar de 8 pilares**
  (Mission Control · Operación · Finanzas · Compras · Equipo · Clientes ·
  Inteligencia · Administración), filtrado por rol, con favoritos/recientes y
  badges dinámicos (mis pendientes, cola de verificación, aprobaciones).
- **`/hub/*`** — shell legacy (finanzas, operaciones, RRHH, etc.), aún en uso.
- **`/dashboard`** — CRM operativo de pedidos.

**Roles:** super_admin, gerente, comprador, administrativo, tesoreria, auditor,
sucursal. Matriz de permisos granular (7 módulos × 5 acciones) con presets por rol
y overrides por usuario (`permisos_custom`).

---

## 📦 Módulos desarrollados

### F1 · Base
Bugfixes, búsqueda global Cmd+K, sistema de notificaciones.

### F2 · Finanzas
Cuentas bancarias + saldos, movimientos, **cash flow**, **conciliación**
bancaria, **cheques** (e-cheq), **impuestos/obligaciones** (IVA, IIBB, ganancias),
facturas de proveedor y **pagos** (con parciales).

### F3 · Operaciones / Stock
Productos, **stock por sucursal** (mínimos, críticos), **lotes + vencimientos**,
**transferencias** entre sucursales, **inventarios físicos** (conteo + cierre con
ajuste vía RPC), **devoluciones** a proveedor.

### F4 · IA interna (NORA)
Chat dock con streaming, tools sobre datos del ERP, **OCR de tickets**, resumen
diario automático. Modelo Claude.

### F5 · Departamentos
**CRM B2B** (clientes, segmentos, LTV), **BI**, dashboard ejecutivo, **RRHH**
(empleados, turnos, ausencias), **caja diaria** por sucursal, **gastos
operativos**, performance, centro de aprobaciones.

### F6 · Tareas + Empleados + Gamificación (base)
Tablas de tareas/tipos/recurrencias/comentarios/historial, empleados con
**9 niveles RPG** + **badges**, objetivos con KPIs, workflow engine.

### F6.5 · Reestructuración + Admin profundo (parcial)
- **Bugfixes visuales**: overlap del buscador en el header; **saludo
  personalizado** por hora del día y rol.
- **Rebrand NORA HQ** completo: componente `NoraBrand`, renames, metadata, paleta.
- **Sidebar de 8 pilares** unificado (reemplaza el modelo viejo).
- **Mission Control** (`/admin`): saludo + briefing IA, **4 KPIs del día**,
  **6 quick actions**, **sucursales en vivo** (health + tareas hoy), **panel de
  predicciones** de NORA.
- **Usuarios y permisos** (`/admin/configuracion/usuarios`): alta vía Supabase
  admin SDK, matriz de permisos granular.
- **Catálogo de productos / vademécum** (`/admin/configuracion/catalogo`):
  CRUD + filtros + **importador CSV** con mapeo de columnas y manejo de conflictos.
- *Diferido:* T7 gestor de integraciones/APIs ⭐, T8 model router de IA.

### F6-T · Módulo de tareas enterprise ✅ (lo último, completo)
El sistema operativo para el equipo de las farmacias:

| Capa | Qué hace |
|------|----------|
| **Configuración** | Turnos por sucursal, supervisores por sucursal, **16 tipos de tarea de farmacia** seedeados (apertura, cierre de caja, cadena de frío, limpiezas, psicotrópicos, góndolas, recepción, etc.) con evidencias, prompts de IA, checklists y puntos. |
| **Recurrencias + agenda** | Plantillas (diaria/semanal/mensual/única) → **cron `generar-agenda`** crea la agenda del día (idempotente). Botón "Regenerar agenda" manual. |
| **Bandeja** | Tabs por rol: **Mi día / Pool de mi turno / Mi sucursal / Todas**. Asignación híbrida: usuario fijo o **pool** que se reclama con un tap ("La hago yo", reclamo **atómico**). Countdown con color, progreso del día. |
| **Ejecución** | Captura de evidencias: **foto (cámara), firma (canvas), GPS, foto de termómetro, checklist, monto de arqueo, archivo, nota** → bucket privado. |
| **Verificación** | Cola del supervisor: evidencias inline + **semáforo de pre-verificación de NORA** (IA con visión) + aprobar/rechazar, con **aprobación en lote** de las que NORA pre-aprobó. |
| **Escalamiento** | Cron que marca vencidas y escala por nivel (responsable → supervisor → super_admin) + notificaciones. |
| **Métricas** | Snapshots diarios (empleados + sucursales) → cumplimiento, SLA, velocidad, calidad, racha, proactividad; objetivos mensuales con proyección. |
| **Gamificación** | Al completar: puntos + badges + nivel RPG con notificación de subida. Ranking. |
| **NORA en tareas** | Pre-verifica evidencias con IA automáticamente, **reporte semanal** narrativo, tools de tareas en el chat. |

### Transversal · Adjuntos / comprobantes
Tabla **polimórfica** + bucket privado + componente drop-in `<Comprobantes>`
(subir foto/PDF, ver con URL firmada, borrar) en **facturas, pagos, recepciones
y devoluciones**.

---

## 🗄️ Migraciones SQL (todas aplicadas)

| # | Contenido |
|---|-----------|
| 0016–0034 | Base F1–F6 (admin hub, finanzas, stock, CRM, tareas, niveles RPG, etc.) |
| **0035** | `permisos_custom` en `users_admin` |
| **0036** | `productos_catalogo` (catálogo/vademécum) |
| **0037** | Tareas enterprise v2 (turnos, supervisores, métricas, asignación híbrida, buckets) |
| **0038** | Seed 16 tipos de tarea de farmacia |
| **0039** | `adjuntos` polimórficos |
| **0040** | Marca `es_demo` para datos de demostración |

---

## ⏰ Crons (Vercel, daily por plan Hobby)
`generar-agenda` (agenda del día) · `marcar-vencidas` · `escalamiento` ·
`metricas-nightly` · `reporte-semanal` · `calcular-objetivos` · `check-triggers` ·
`resumen-diario`.

---

## 🧪 Datos demo
Botón en **Configuración → General → Datos demo**: carga 30 días de métricas por
sucursal + agenda de hoy (pool, verificaciones, vencidas), todo marcado `es_demo`
y borrable de un click sin tocar datos reales. (Ya cargado en la base.)

---

## 🚦 Pendientes (no bloqueantes)
- Adjuntos en **gastos y cheques** (faltan páginas de detalle).
- **Kanban** en tareas (requiere `@dnd-kit`).
- Crons **sub-diarios** (escalamiento c/30min, reporte semanal real) → requieren
  **Vercel Pro** (hoy daily por Hobby).
- Scorecards/sparklines detallados en mi-panel/mi-equipo.
- **F6.5 T7** gestor de integraciones ⭐ y **T8** model router de IA.
- Decisión de seguridad: RLS en `coupons`/`offers` (tablas de la app cuponera).
- Mobile audit 375px de pantallas legacy F2–F5.

---

## 🗺️ Roadmap futuro (F7–F20)
Vencimientos WMS · Reposición inteligente de droguerías · Compliance regulatorio ·
Cadena de frío + EAM · DMS documental · Inbox unificado · Marketing · NORA
avanzada · Chat farmacéutico · IA acústica · Cámaras Hikvision · BI predictivo ·
WhatsApp/Telegram · Integración SIFACO.

---

## 📚 Documentación del repo
- `docs/PLAN-MAESTRO.md` — tracker vivo de fases y sub-tandas (fuente de verdad).
- `docs/ERP-PROGRESO.md` — historial de progreso.
- `docs/AUDITORIA-GAPS.md` — auditoría de gaps por ruta.
- `docs/OBJETIVOS-NORA-HQ.md` — los 8 objetivos del sistema.
- `docs/IDENTIDAD-NORA-HQ.md` / `docs/CHANGELOG.md` — identidad y cambios.
- `docs/RESUMEN-SISTEMA.md` — **este documento**.

> Para retomar el desarrollo en una sesión nueva: **"continuá el plan maestro"**.
