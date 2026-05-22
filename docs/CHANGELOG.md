# Changelog · NORA HQ

## FASE 6.5 · Rebrand NORA HQ + Design Upgrade (2026-05-22)

Rebrand del ERP a **NORA HQ** + identidad visual premium. No agrega features
de negocio nuevos; eleva identidad, diseño y consistencia. Build verde y sin
regresiones en F1–F6.

### Hecho
- **F6.5.1 · Rebrand identity** — system prompt de NORA reescrito (personalidad
  oficial), header con NoraLogo + "NORA HQ" + tagline, metadata de `(admin)`,
  textos del chat dock.
- **F6.5.2 · Paleta Deep Tech** — primary/ring a violeta `263 70%`, tokens de
  marca `--nora*` y `--mint`, colores Tailwind `nora`/`mint`, keyframes
  `nora-pulse` y `shimmer`. `--accent` se mantiene neutral a propósito.
- **F6.5.3 · Tipografía premium** — Geist Sans/Mono + Fraunces (display).
- **F6.5.4 · Componentes NORA** — `NoraLogo`, `NoraCard`, `NoraCoachingCard`,
  `NoraTyping`, `NoraSuggestionPill` + `lib/nora/context.ts`.
- **F6.5.7 · Login** — split 50/50 con identidad NORA HQ (lógica auth/MFA intacta).
- **F6.5.8 · Microinteracciones** — scale en botones, shimmer en skeleton.
- **F6.5.9 · NORA Mode** — 4º tema "command center" (negros + violeta intenso),
  gated a super_admin/gerente.
- **F6.5.10 · Documentación** — `docs/IDENTIDAD-NORA-HQ.md` + este changelog.

### F6.5.6 · Diferenciales únicos (segunda pasada)

- **Diferencial 1 — Verificación visual por IA** ✅ migración `0034`
  (`ia_prompt_verificacion` + `verificacion_ia` en `tipos_tareas` con seed de
  prompts para limpieza/cadena de frío/apertura) + `lib/ai/verify-evidence.ts`
  + `POST /api/nora/verify-evidence` (Claude vision, traza como comentario).
- **Diferencial 2 — Coach IA personal diario** ✅ `GET /api/nora/employee-coaching/[id]`
  con datos reales (score, nivel actual + siguiente, tareas hoy, ranking sucursal).
- **Diferencial 3 — Sistema de niveles RPG** ✅ migración `0033` con tabla
  `niveles_empleados` (9 niveles seedeados Aprendiz→Leyenda),
  `empleados_historial_niveles`, columna `nivel_actual_id`, RPC
  `recalcular_nivel_empleado()`, integración en `gamification.alCompletarse`
  con notificación de subida + componente `NivelBadge`.
- **Diferencial 4 — NORA omnipresente** ✅ ya cubierto por `AiChatDock` (F4) +
  `lib/nora/context.ts` (F6.5.4).
- **Diferencial 6 — Tareas por lenguaje natural** ✅ `POST /api/nora/parse-task`
  convierte descripción libre en draft estructurado (elige IDs reales del catálogo).

### Diferido (necesita su pasada dedicada)
- **F6.5.5 · Upgrade pantallas críticas** — Mission Control, mi-panel, tareas
  premium. Los endpoints (verify-evidence, coaching, parse-task) ya están —
  falta wiring de UI + 2 endpoints más: `daily-briefing` y `predictions`.
- **F6.5.6 · Diferencial 5 — Detección de anomalías** — necesita tracking
  histórico de SLA diario (no existe hoy) para detectar tendencias.
