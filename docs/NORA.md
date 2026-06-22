# 🤖 NORA — IA transversal (3 capas)

NORA está presente en todo el sistema con **3 capas**:

1. **EXPLICA** (lee y traduce, sin riesgo): las tools de lectura + las NoraCards de
   cada sector y Mission Control narran qué pasa en lenguaje claro.
2. **SUGIERE** (propone, el dueño aprueba): el **feed de NORA** (`/admin/nora/feed`)
   junta las propuestas/avisos; cada sector también muestra sus sugerencias.
3. **HACE** (agente): ejecuta acciones **reversibles y registradas**. Por defecto
   TODO pide confirmación; el dueño habilita lo que quiera soltar (`nora_config`).

## Núcleo (`lib/ai/`)
- **Tools** (`tools.ts`, registry `AI_TOOLS`): cada una corre server-side contra
  Supabase con la sesión del usuario (RLS → NORA solo ve lo que el usuario ve).
- **Metadata** (`tool-meta.ts`): clasifica cada tool por **capa** (lectura/acción)
  y **módulo** (permiso fino). `usuarioPermiteTool()` → NORA no hace lo que el
  usuario no puede.
- **Core** (`nora.ts`): `modoDeAccion` (confirmar/auto), `registrarAccion`
  (auditoría → `nora_acciones`), `emitirAviso` (feed → `nora_avisos`, con dedup).
- **Personalidad** (`prompts.ts` · `chatSystemPrompt`): profesional cercana
  argentina, proactiva, voseo; acciones que modifican datos piden confirmación.
- **Chat** (`/api/ai/chat`, streaming + tool loop, persiste en `ai_conversaciones`).

## Tablas (migr. 0065)
- `nora_acciones`: auditoría de la capa "hace" (qué, cuándo, por quién, reversible,
  revertida).
- `nora_config`: por acción, `modo` (confirmar/auto) + `habilitada`. Default todo
  confirma; el dueño suelta de a poco.
- `nora_avisos`: feed de sugerencias + avisos del auditor (severidad, acción
  sugerida, dedup por clave).

## Chat central — `/admin/nora`
Canvas completo: preguntá de TODO el negocio. Usa las tools (datos reales).
Botón flotante global (dock en el shell, evento `nora:open`) + historial de
conversaciones. Sugerencias rápidas.

## Auditor proactivo (`lib/ai/auditor.ts`)
`correrAuditor()` revisa el negocio y emite avisos al feed: caja descuadrada,
VIP inactivo, quiebres por velocidad, dinero dormido, oferta por vencer,
documentos por pagar, ventas del día sin cargar. Cron diario `nora-auditor`
(07:00 UTC) + botón **"Revisar ahora"** (plan Hobby). Card en Mission Control
(`NoraFeedCard`) + badge `noraAvisosPendientes`.

## Cómo soltar más autonomía
En `nora_config`, poné `modo='auto'` en las acciones que quieras que NORA haga
sola (siguen registradas y, donde se pueda, reversibles). Las acciones arrancan
conservadoras: generar CSV SIFACO, borrador de orden/campaña/oferta, crear tarea,
reponer góndola.

> NORA con IA real requiere `ANTHROPIC_API_KEY`. Sin ella, las NoraCards,
> sugerencias y el auditor funcionan igual (datos reales); solo el chat
> conversacional queda deshabilitado con aviso.
