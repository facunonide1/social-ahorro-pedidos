/**
 * Contexto de NORA según la ruta actual. Alimenta las sugerencias
 * proactivas y atajos del dock omnipresente y le dice a NORA dónde
 * está parado el usuario.
 */

export type NoraAtajo = {
  label: string
  /** prompt que se pre-carga en el chat al hacer click */
  prompt: string
}

export type NoraContext = {
  pantalla: string
  /** sugerencias clickables que abren el chat con ese prompt */
  sugerencias: string[]
  atajos: NoraAtajo[]
  /** texto extra para el system prompt: dónde está el usuario */
  systemPromptAddon: string
}

const DEFAULT: NoraContext = {
  pantalla: 'general',
  sugerencias: [
    '¿qué necesita mi atención hoy?',
    '¿hay algo urgente?',
    'resumen del día',
  ],
  atajos: [],
  systemPromptAddon: '',
}

/** Reglas ordenadas: la primera que matchea el pathname gana. */
const RULES: Array<{
  test: (p: string) => boolean
  ctx: (p: string) => NoraContext
}> = [
  {
    test: (p) => /^\/admin\/facturas\/[^/]+$/.test(p),
    ctx: () => ({
      pantalla: 'detalle_factura',
      sugerencias: [
        '¿esta factura es duplicada?',
        '¿cuándo vence?',
        'comparar con facturas anteriores de este proveedor',
      ],
      atajos: [{ label: 'marcar para pagar', prompt: 'Marcá esta factura para pagar' }],
      systemPromptAddon:
        'El usuario está viendo el detalle de una factura de proveedor.',
    }),
  },
  {
    test: (p) => p.startsWith('/admin/facturas'),
    ctx: () => ({
      pantalla: 'facturas',
      sugerencias: [
        '¿qué facturas vencen esta semana?',
        '¿cuánto debemos en total?',
        '¿hay facturas duplicadas?',
      ],
      atajos: [],
      systemPromptAddon: 'El usuario está en el listado de facturas.',
    }),
  },
  {
    test: (p) => /^\/admin\/tareas\/[^/]+$/.test(p),
    ctx: () => ({
      pantalla: 'detalle_tarea',
      sugerencias: [
        '¿qué tengo que hacer en esta tarea?',
        'reasigná esta tarea',
        '¿cuándo vence?',
      ],
      atajos: [],
      systemPromptAddon: 'El usuario está viendo el detalle de una tarea.',
    }),
  },
  {
    test: (p) => p.startsWith('/admin/tareas'),
    ctx: () => ({
      pantalla: 'tareas',
      sugerencias: [
        '¿qué tengo que hacer hoy?',
        '¿cuál es mi siguiente tarea más urgente?',
        'asignale esta tarea a María',
      ],
      atajos: [{ label: 'priorizar mis tareas', prompt: '¿Qué hago primero hoy?' }],
      systemPromptAddon: 'El usuario está en la bandeja de tareas.',
    }),
  },
  {
    test: (p) => p.startsWith('/admin/mi-panel'),
    ctx: () => ({
      pantalla: 'mi_panel',
      sugerencias: [
        '¿cómo vengo con mi objetivo del mes?',
        '¿qué me falta para el próximo nivel?',
        '¿cuál es mi siguiente tarea?',
      ],
      atajos: [],
      systemPromptAddon:
        'El usuario está en su panel personal de empleado. Tono coach motivacional.',
    }),
  },
  {
    test: (p) => p.startsWith('/admin/mi-equipo'),
    ctx: () => ({
      pantalla: 'mi_equipo',
      sugerencias: [
        '¿hay alguna anomalía en mi equipo?',
        '¿quién está sobrecargado?',
        '¿cómo distribuyo las tareas pendientes?',
      ],
      atajos: [],
      systemPromptAddon: 'El usuario es supervisor y mira el panel de su equipo.',
    }),
  },
  {
    test: (p) => p.startsWith('/admin/operaciones/stock'),
    ctx: () => ({
      pantalla: 'stock',
      sugerencias: [
        '¿qué productos están bajo el mínimo?',
        '¿qué tendría que reponer?',
        '¿hay lotes por vencer?',
      ],
      atajos: [],
      systemPromptAddon: 'El usuario está en stock e inventario.',
    }),
  },
  {
    test: (p) => p === '/admin' || p === '/admin/',
    ctx: () => ({
      pantalla: 'mission_control',
      sugerencias: [
        '¿qué necesita mi atención hoy?',
        '¿cómo venimos vs ayer?',
        '¿hay alertas críticas?',
      ],
      atajos: [{ label: 'briefing del día', prompt: 'Dame el resumen ejecutivo del día' }],
      systemPromptAddon:
        'El usuario está en el dashboard ejecutivo (Mission Control). Tono ejecutivo, directo.',
    }),
  },
]

export function getContextForRoute(
  pathname: string,
  _userRole?: string,
): NoraContext {
  for (const rule of RULES) {
    if (rule.test(pathname)) return rule.ctx(pathname)
  }
  return DEFAULT
}
