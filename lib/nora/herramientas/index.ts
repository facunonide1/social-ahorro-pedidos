/**
 * Registro de herramientas de NORA + motor de slot-filling determinista.
 * El modelo (Claude) solo hace NLU (intención + extracción); el backend resuelve
 * las opciones reales, arma la confirmación y ejecuta. N-07: agregar un sector =
 * sumar herramientas acá.
 */
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { HERRAMIENTAS_FINANZAS } from './finanzas'
import { HERRAMIENTAS_TAREAS } from './tareas'
import { HERRAMIENTAS_STOCK } from './stock'
import { HERRAMIENTAS_COMPRAS } from './compras'
import { HERRAMIENTAS_CLIENTES } from './clientes'
import { HERRAMIENTAS_OFERTAS } from './ofertas'
import { HERRAMIENTAS_COMUNICACION } from './comunicacion'
import { HERRAMIENTAS_PEDIDOS } from './pedidos'
import { HERRAMIENTAS_PERSONAS } from './personas'
import { HERRAMIENTAS_CENTRO_DATOS } from './centro_datos'
import { HERRAMIENTAS_MISSION_CONTROL } from './mission_control'
import { matchOpciones, type Herramienta, type NoraCtx, type Opcion, type Valores } from './tipos'

export * from './tipos'

export const TODAS_HERRAMIENTAS: Herramienta[] = [
  ...HERRAMIENTAS_FINANZAS.map((h) => ({ ...h, subapp: h.subapp ?? 'finanzas' })),
  ...HERRAMIENTAS_TAREAS,
  ...HERRAMIENTAS_STOCK,
  ...HERRAMIENTAS_COMPRAS,
  ...HERRAMIENTAS_CLIENTES,
  ...HERRAMIENTAS_OFERTAS,
  ...HERRAMIENTAS_COMUNICACION,
  ...HERRAMIENTAS_PEDIDOS,
  ...HERRAMIENTAS_PERSONAS,
  ...HERRAMIENTAS_CENTRO_DATOS,
  ...HERRAMIENTAS_MISSION_CONTROL,
]

/**
 * Herramientas que el usuario PUEDE ejecutar en su contexto. Filtra por permiso
 * y por sub-app: en cada sub-app el modelo solo ve sus herramientas, más las
 * lecturas marcadas como cruzables (lecturaGlobal). Sin subapp → todas.
 */
export function herramientasParaUsuario(rol: AdminRole, custom: PermisosCustom | null, subapp?: string | null): Herramienta[] {
  return TODAS_HERRAMIENTAS.filter((h) => {
    if (h.permiso && rol !== 'super_admin' && !puede(rol, custom, h.permiso.modulo, h.permiso.accion)) return false
    if (h.roles && rol !== 'super_admin' && !h.roles.includes(rol)) return false
    if (!subapp) return true
    return h.subapp === subapp || (!!h.soloLectura && !!h.lecturaGlobal)
  })
}

/** Definiciones de tools para la API de Claude (evidencia no se extrae de texto). */
export function toolDefs(herrs: Herramienta[]) {
  return herrs.map((h) => ({
    name: h.id,
    description: h.descripcion,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(h.slots.filter((s) => s.tipo !== 'evidencia').map((s) => [s.nombre, { type: s.tipo === 'numero' ? 'number' : 'string', description: s.descripcion }])),
      required: [] as string[],
    },
  }))
}

export type PasoSlot =
  | { estado: 'slot'; slot: string; tipo: string; descripcion: string; opciones?: Opcion[]; nota?: string; valores: Valores }
  | { estado: 'completo'; valores: Valores }
  | { estado: 'sin_opciones'; slot: string; texto: string; valores: Valores }

/**
 * Avanza el slot-filling: para el primer slot faltante devuelve sus opciones
 * reales (chips) o pide input; auto-resuelve hints de una sola coincidencia y
 * auto-selecciona cuando hay una sola opción.
 */
export async function resolverSlots(adm: any, h: Herramienta, valoresIn: Valores, ctx: NoraCtx): Promise<PasoSlot> {
  const valores: Valores = { ...valoresIn }
  for (const slot of h.slots) {
    if (slot.requeridoSi && !slot.requeridoSi(valores)) continue
    const val = valores[slot.nombre]

    if (slot.tipo === 'evidencia') {
      if (val) continue
      return { estado: 'slot', slot: slot.nombre, tipo: 'evidencia', descripcion: slot.descripcion, valores }
    }
    if (slot.tipo === 'numero' || slot.tipo === 'texto') {
      if (val != null && String(val).trim() !== '') continue
      return { estado: 'slot', slot: slot.nombre, tipo: slot.tipo, descripcion: slot.descripcion, valores }
    }
    // opción
    const opciones = slot.queryOpciones ? await slot.queryOpciones(adm, valores, ctx) : []
    if (val && opciones.some((o) => o.valor === val)) continue
    if (val) {
      const m = matchOpciones(opciones, String(val))
      if (m.length === 1) { valores[slot.nombre] = m[0].valor; continue }
      if (m.length > 1) return { estado: 'slot', slot: slot.nombre, tipo: 'opcion', descripcion: slot.descripcion, opciones: m, valores }
      // sin match → mostrar todas con nota
      if (opciones.length === 0) return { estado: 'sin_opciones', slot: slot.nombre, texto: `No encontré opciones para ${slot.descripcion.toLowerCase()}.`, valores }
      return { estado: 'slot', slot: slot.nombre, tipo: 'opcion', descripcion: slot.descripcion, opciones, nota: `No encontré "${val}", elegí de la lista.`, valores }
    }
    if (opciones.length === 0) return { estado: 'sin_opciones', slot: slot.nombre, texto: `No hay opciones disponibles para ${slot.descripcion.toLowerCase()}.`, valores }
    if (opciones.length === 1) { valores[slot.nombre] = opciones[0].valor; continue }
    return { estado: 'slot', slot: slot.nombre, tipo: 'opcion', descripcion: slot.descripcion, opciones, valores }
  }
  return { estado: 'completo', valores }
}

export function systemPrompt(nombre: string | null, rol: string, herrs: Herramienta[], subapp: string | null, hoy?: string): string {
  return `Sos NORA, la asistente del ERP de Social Ahorro (una cadena de farmacias). Hablás en español rioplatense, profesional y cercana, en frases cortas.

${nombre ? `Estás hablando con ${nombre} (rol: ${rol}).` : `Rol del usuario: ${rol}.`}${subapp ? ` Está en la sub-app ${subapp}.` : ''}${hoy ? ` Hoy es ${hoy} (zona horaria Argentina). Usá esta fecha para resolver expresiones como "hoy", "mañana", "antes de las 3" a ISO 8601.` : ''}

Tu trabajo es EJECUTAR ACCIONES por conversación usando SOLO las herramientas disponibles (ya están filtradas por lo que este usuario puede hacer). Reglas:
- Si el usuario quiere hacer algo que tenés como herramienta, LLAMÁ la herramienta con los datos que puedas extraer del mensaje (proveedor, factura, monto, etc.). El sistema se encarga de pedir lo que falte con opciones reales — no inventes proveedores, facturas, montos ni cuentas.
- Si el pedido no matchea ninguna herramienta disponible, respondé en texto con amabilidad y explicá qué sí podés hacer (o sugerí usar el botón +).
- Nunca ejecutes nada sin confirmación (el sistema muestra una tarjeta de confirmación antes; vos no la generás).
- Si te falta contexto para elegir la herramienta, preguntá breve.

Herramientas disponibles: ${herrs.map((h) => h.nombre).join(' · ') || '(ninguna — este usuario no tiene permisos de acción)'}.`
}
