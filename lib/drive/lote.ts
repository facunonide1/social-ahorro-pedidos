/**
 * Qué entra en una corrida del cron (maxDuration 60s).
 *
 * Un archivo de más de 12 MB se marca en previa ANTES de descargarlo: no
 * ocupa uno de los 4 lugares. La planilla, un maestro, o cualquier cosa de
 * 2 MB o más, entra de a uno. El resto de la corrida son archivos chicos,
 * mientras no se hayan ido 45 segundos desde que arrancó la ingesta.
 *
 * Si algo quedó en `procesando` más de 10 minutos, el cron murió a la mitad.
 * Vuelve a pendiente con un intento más. Al llegar al tope de intentos, error.
 */

export const TOPE_BYTES = 12 * 1024 * 1024
export const UMBRAL_PESADO = 2 * 1024 * 1024
export const PRESUPUESTO_MS = 45_000
export const MINUTOS_TRABADO = 10

export type ArchivoPlan = {
  bytes: number | null
  clasificacion: string | null
  clasificacionForzada?: string | null
}

export function claseEfectiva(a: ArchivoPlan): string | null {
  return a.clasificacionForzada || a.clasificacion
}

export function superaTope(bytes: number | null | undefined): boolean {
  return bytes != null && Number.isFinite(bytes) && bytes > TOPE_BYTES
}

export function esPesado(a: ArchivoPlan): boolean {
  const c = claseEfectiva(a)
  if (c === 'planilla' || c === 'maestro') return true
  return (a.bytes ?? 0) >= UMBRAL_PESADO
}

export function mensajeTope(mb: number): string {
  return `Pesa ${mb} MB, por encima del tope de 12 MB. No se descarga ni se parsea en el cron: queda en previa para subirlo a mano.`
}

export function sigueEnPresupuesto(transcurridoMs: number, presupuestoMs = PRESUPUESTO_MS): boolean {
  return transcurridoMs < presupuestoMs
}

export function planificarCorrida<T extends ArchivoPlan>(
  archivos: T[],
  opts: { max: number },
): { omitidos: T[]; elegir: T[]; dejar: T[] } {
  const omitidos: T[] = []
  const siguen: T[] = []
  for (const a of archivos) (superaTope(a.bytes) ? omitidos : siguen).push(a)

  const pesados = siguen.filter((a) => esPesado(a))
  const livianos = siguen.filter((a) => !esPesado(a))
  const elegir: T[] = []
  const dejar: T[] = []
  if (opts.max > 0 && pesados[0]) elegir.push(pesados[0])
  dejar.push(...pesados.slice(1))
  for (const a of livianos) {
    if (elegir.length >= opts.max) dejar.push(a)
    else elegir.push(a)
  }
  return { omitidos, elegir, dejar }
}

export function decisionTrabado(opts: {
  updatedAt: string | null
  ahora: Date
  intentos: number
  maxIntentos: number
  minutos?: number
}): { accion: 'esperar' | 'reintentar' | 'error'; intentos: number } {
  const minutos = opts.minutos ?? MINUTOS_TRABADO
  const t = opts.updatedAt ? Date.parse(opts.updatedAt) : NaN
  const edadMin = Number.isFinite(t) ? (opts.ahora.getTime() - t) / 60_000 : Number.POSITIVE_INFINITY
  if (edadMin < minutos) return { accion: 'esperar', intentos: opts.intentos }
  const intentos = opts.intentos + 1
  if (intentos >= opts.maxIntentos) return { accion: 'error', intentos }
  return { accion: 'reintentar', intentos }
}
