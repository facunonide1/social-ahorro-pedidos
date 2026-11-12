/**
 * La ingesta nace apagada. Solo corre si DRIVE_INGESTA_ENABLED es exactamente
 * 'true'. Cualquier otro valor —vacío, '1', 'yes'— la deja quieta: la pantalla
 * dice «deshabilitado» y el cron contesta 200 sin tocar Drive ni la base.
 *
 * DRIVE_PRECIOS_AUTO_APLICAR, si no está, sigue a la ingesta: con la ingesta
 * prendida, una lista confiable se aplica sola. 'false' la deja en previa.
 */

export function ingestaHabilitada(): boolean {
  return process.env.DRIVE_INGESTA_ENABLED === 'true'
}

export function preciosAutoAplicar(): boolean {
  const v = process.env.DRIVE_PRECIOS_AUTO_APLICAR
  if (v === 'false' || v === '0') return false
  if (v === 'true') return true
  return ingestaHabilitada()
}

/** Porcentaje de filas con match para animarse a aplicar una lista. */
export function umbralMatchLista(): number {
  const n = Number(process.env.DRIVE_PRECIOS_UMBRAL_MATCH ?? 60)
  return Number.isFinite(n) ? n : 60
}

/** Score 0–1 de un nombre contra el catálogo. Debajo, la fila queda sin match. */
export function umbralScoreNombre(): number {
  const n = Number(process.env.DRIVE_MATCH_SCORE ?? 0.62)
  return Number.isFinite(n) ? n : 0.62
}

export const DIAS_REFRESH_TESTING = 7
export const AVISO_VENCIMIENTO_HORAS = 24
export const DIAS_LISTA_VIEJA = 30
export const MAX_PROFUNDIDAD = 5
export const ARCHIVOS_POR_CORRIDA = 4
export const MAX_INTENTOS = 3
