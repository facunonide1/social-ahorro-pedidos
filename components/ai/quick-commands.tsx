/**
 * Comandos rápidos contextuales del chat dock (F4.5).
 *
 * Según la ruta donde está el usuario, sugiere preguntas relevantes.
 */

const FINANZAS = [
  '¿Qué facturas vencen esta semana?',
  '¿Cómo está la posición de caja?',
  '¿Hay cheques rechazados o impuestos vencidos?',
]

const OPERACIONES = [
  '¿Qué productos están en stock crítico?',
  '¿Qué lotes vencen en los próximos 30 días?',
  'Escaneá anomalías de operaciones',
]

const PEDIDOS = [
  'Resumen de ventas de la última semana',
  '¿Cuántos pedidos hay sin entregar?',
  '¿Cuál es el ticket promedio de los últimos 7 días?',
]

const PROVEEDORES = [
  '¿Cuánto le debemos a cada proveedor?',
  '¿Qué facturas de proveedor están vencidas?',
]

const DEFAULT = [
  'Escaneá anomalías del ERP',
  'Resumen de ventas de la última semana',
  '¿Qué facturas vencen pronto?',
]

const MI_PANEL = [
  '¿Qué tengo que hacer hoy?',
  '¿Cómo voy con mis objetivos?',
  'Creame una tarea de cierre de caja para mañana',
]

const MI_EQUIPO = [
  'Resumen del equipo de hoy',
  '¿Quién está más cargado de tareas?',
  '¿Qué tareas del equipo están atrasadas?',
]

const TAREAS = [
  'Listame mis tareas pendientes',
  'Priorizá mis tareas',
  '¿Qué tareas vencen esta semana?',
]

export function quickCommandsForPath(pathname: string): string[] {
  if (pathname.includes('/mi-panel')) return MI_PANEL
  if (pathname.includes('/mi-equipo')) return MI_EQUIPO
  if (pathname.includes('/tareas')) return TAREAS
  if (
    pathname.includes('/finanzas') ||
    pathname.includes('/facturas') ||
    pathname.includes('/pagos')
  )
    return FINANZAS
  if (pathname.includes('/operaciones') || pathname.includes('/stock'))
    return OPERACIONES
  if (pathname.includes('/proveedores') || pathname.includes('/compras'))
    return PROVEEDORES
  if (pathname.includes('/dashboard') || pathname.includes('/pedidos'))
    return PEDIDOS
  return DEFAULT
}
