# Identidad · NORA HQ

**Nombre:** NORA HQ
**Tagline:** Tu centro de mando inteligente
**Subtagline (login):** Powered by NORA · IA para tu cadena

NORA HQ es el sistema de gestión interno de Social Ahorro Farmacias. No es
"un ERP más": es un centro de mando con NORA (la IA) presente en cada pantalla.

---

## Paleta · Deep Tech

Tokens en `app/globals.css` como triples HSL (`H S% L%`), consumidos por shadcn
vía `hsl(var(--token))` y expuestos en Tailwind (`tailwind.config.ts`).

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `--primary` | `263 70% 50%` | `263 70% 65%` | Violeta de marca: botones, links, foco |
| `--ring` | `263 70% 50%` | `263 70% 65%` | Anillo de foco |
| `--nora` | `263 70% 50%` | `263 70% 65%` | Acento NORA (logo, NoraCard, pills) |
| `--nora-bg` | `263 70% 97%` | `263 70% 12%` | Fondo sutil de NoraCard |
| `--nora-deep` | `263 70% 30%` | `263 70% 80%` | Paneles "deep" (predicciones, objetivo) |
| `--mint` | `158 64% 52%` | `158 64% 62%` | Verde menta: punto del logo, highlights |
| `--accent` | `240 5% 96%` | `240 6% 14%` | **Neutral** — hovers de menús (no es la menta) |

> **Decisión:** `--accent` se mantiene neutral. En shadcn `accent` es el color de
> *hover* de dropdowns/ghost buttons; ponerlo verde menta saturado rompería esos
> estados. La menta vive en `--mint`/`--nora`.

**NORA Mode** (`.nora`): variante "command center" sólo para super_admin/gerente.
Negros puros (`--background: 0 0% 0%`), violeta intensificado (`263 90% 68%`) y
bordes con tinte violeta.

---

## Tipografía

| Familia | Variable | Cuándo |
|---------|----------|--------|
| Geist Sans | `--font-geist-sans` (`font-sans`) | UI general, body |
| Geist Mono | `--font-geist-mono` (`font-mono`) | Números tabulares, códigos, remitos |
| Fraunces | `--font-fraunces` (`font-display`) | SOLO headers premium: hero del login, H1 de Mission Control / reportes ejecutivos |

`font-display` es decorativa: no usarla en UI densa ni en mobile chico.

---

## Personalidad de NORA

Profesional cercana, argentina natural. Definida en `lib/ai/prompts.ts`.

- Trata al usuario por nombre cuando lo sabe.
- Primera persona plural: "tenemos", "vemos", "te recomiendo".
- Cálida pero eficiente. Sin muletillas ni relleno.
- Concisión > verbosidad. Lo urgente, primero.
- Si no sabe, lo dice. No inventa datos (usa tools).
- Sin emojis salvo que aporten (uno ocasional, no en cada respuesta).
- Montos `$84.300` (miles con punto), fechas `jueves 14 de mayo`.

**Tono por contexto:** dueño → ejecutivo/bullets · empleado → coach motivacional ·
mostrador → rápido · reportes → editorial.

✅ "Buen día Facu. Tenemos 3 facturas que vencen hoy por $128.400. Te las priorizo."
❌ "¡Hola!! 😊 Claro que sí, con gusto te ayudo. Déjame revisar eso para vos..."

---

## Componentes NORA (`components/nora/`)

| Componente | Qué es |
|-----------|--------|
| `NoraLogo` | Símbolo: círculo violeta + punto verde menta. Estados idle/thinking/speaking/error, tamaños sm–xl |
| `NoraCard` | Wrapper de mensajes de NORA: fondo `nora-bg`, borde izq violeta, label "NORA · {contexto}" |
| `NoraCoachingCard` | Variante coach para el panel del empleado (avatar + saludo + highlights + CTA) |
| `NoraTyping` | 3 puntos en pulso secuencial ("NORA está analizando…") |
| `NoraSuggestionPill` | Sugerencia contextual clickable |

`lib/nora/context.ts` → `getContextForRoute(pathname, rol)` devuelve pantalla,
sugerencias proactivas, atajos y addon de system prompt según la ruta.

---

## Microinteracciones

- Botones: `hover:scale-1.02` / `active:scale-0.98`, transición 150ms (respeta `prefers-reduced-motion`).
- Inputs: anillo de foco violeta (`--ring`).
- Skeleton: shimmer violeta sutil (`animate-shimmer`).
- Logo NORA "pensando": `animate-nora-pulse` (scale 1→1.3, opacity 1→0.6).

---

## Don'ts

- No hardcodear hex en componentes nuevos — usar las CSS vars / clases Tailwind.
- No poner `--accent` saturado (rompe hovers de menús).
- No usar `font-display` en UI densa.
- No emojis en respuestas de NORA por defecto.
- No romper contraste/accesibilidad por estética: si un cambio baja el contraste, revertir.
- Iconografía: Lucide outline, tamaño `size-4` por defecto.
