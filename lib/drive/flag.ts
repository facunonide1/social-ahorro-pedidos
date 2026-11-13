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

// ── Corrida acotada (12/11/2026) ────────────────────────────────────────────
// La función tiene 60 s. Antes se procesaban hasta 4 archivos sin mirar el
// reloj: un xls de 42 MB o la planilla grande mataban la corrida a mitad de
// camino y el archivo quedaba «procesando» para siempre.

/** Tiempo que una corrida se da para EMPEZAR archivos nuevos (el resto es margen). */
export function presupuestoMs(): number {
  const n = Number(process.env.DRIVE_PRESUPUESTO_MS ?? 40_000)
  return Number.isFinite(n) && n > 0 ? n : 40_000
}

/**
 * Lock de un archivo en «procesando»: vence a los 5 minutos (más que la vida
 * de cualquier función). Vencido, se libera solo en la próxima corrida.
 */
export const LOCK_MS = 5 * 60_000

/** Se olfatea el contenido (primeras filas) solo de planillas de hasta esto. */
export const OLFATEO_MAX_BYTES = 8 * 1024 * 1024

/** Nada más grande que esto se baja en una corrida automática. */
export const DESCARGA_MAX_BYTES = 30 * 1024 * 1024

/** Los maestros no traban la cola: van al final y de a uno por corrida. */
export const MAESTROS_POR_CORRIDA = 1

/** La planilla «Compras y precios por droguería» se procesa de a estos grupos. */
export const GRUPOS_PLANILLA_POR_CORRIDA = 4

/** Las carpetas de compras que la ingesta tiene que leer (con subcarpetas). */
export function carpetasDeCompras(): string[] {
  const v = process.env.DRIVE_CARPETAS_COMPRAS
  const lista = v ? v.split('|') : ['compras farmacias', 'compras farmacias (privado)']
  return lista.map((s) => s.trim()).filter(Boolean)
}
