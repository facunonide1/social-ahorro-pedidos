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

### Diferido (trabajo de features grande — requiere migraciones + endpoints IA)
- **F6.5.5 · Upgrade pantallas críticas** — Mission Control, mi-panel, tareas y
  detalle a nivel premium. Depende de los endpoints de F6.5.6.
- **F6.5.6 · Diferenciales únicos** — verificación visual por IA (vision),
  coach IA diario, sistema de niveles RPG (tablas `niveles_empleados`,
  `empleados_historial_niveles`, columna `ia_prompt_verificacion`), detección
  de anomalías, creación de tareas por lenguaje natural. Son endpoints IA +
  migraciones nuevas: se hacen en una pasada dedicada para no romper build.

> Motivo del diferimiento: las reglas de la fase exigen build verde y cero
> regresiones entre commits. F6.5.5/5.6 son features sustanciales (5 endpoints
> IA + migraciones + recálculo de niveles) que merecen su propia tanda testeada,
> no un cierre apurado. La base de identidad/diseño ya quedó lista para montarlas.
