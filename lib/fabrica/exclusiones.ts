/**
 * LO QUE SE MIRÓ Y SE DECIDIÓ DEJAR AFUERA.
 *
 * ── POR QUÉ VIVE EN lib/ Y NO EN UN SCRIPT ──────────────────────────────────
 *
 * Hasta v0.71 los motivos de exclusión estaban dentro del relevamiento: se
 * podían CORRER pero no CONSULTAR. Alguien que abría el portal veía qué está
 * declarado y no tenía forma de saber qué se revisó y se dejó afuera a
 * propósito.
 *
 * Y esa es la contracara del denominador honesto: si sólo se publica lo
 * declarado, lo no declarado se lee como olvido. Saber que una constante se
 * miró y se decidió excluir vale tanto como saber que otra se declaró.
 *
 * ── DOS MOTIVOS, Y NO SON LO MISMO ──────────────────────────────────────────
 *
 *   tecnica     no es una decisión de negocio. No va a declararse nunca, y eso
 *               es una respuesta cerrada.
 *   pendiente   es de negocio y todavía no se declaró. Es deuda con fecha
 *               abierta, y tiene que verse como deuda y no como decisión.
 *
 * Meterlas en la misma bolsa haría que nueve pendientes se lean como resueltas.
 */

/**
 * En v0.71 había dos motivos: `tecnica` y `pendiente`. Las diez pendientes se
 * declararon en v0.73, así que hoy sólo queda uno — y `pendiente` se deja en el
 * tipo a propósito: la próxima constante de negocio que aparezca va a pasar por
 * ese estado, y sacarlo obligaría a reinventarlo.
 */
export type MotivoExclusion = 'tecnica' | 'pendiente'

export interface ConstanteExcluida {
  nombre: string
  motivo: MotivoExclusion
  porque: string
}

export const EXCLUIDAS: ConstanteExcluida[] = [
  /* ── Técnicas: no son decisiones de negocio ─────────────────────────── */
  { nombre: 'DOC_MODELO', motivo: 'tecnica', porque: 'Qué modelo usa el motor de documentos. Decisión técnica y de costo, no del negocio.' },
  { nombre: 'DOC_MAX_TOKENS', motivo: 'tecnica', porque: 'Techo técnico de la llamada al modelo.' },
  { nombre: 'DOC_EFFORT', motivo: 'tecnica', porque: 'Esfuerzo de razonamiento del modelo.' },
  { nombre: 'DOC_MAX_BYTES', motivo: 'tecnica', porque: 'Tamaño máximo de archivo aceptado.' },
  { nombre: 'DOC_COMPRIMIR_DESDE_BYTES', motivo: 'tecnica', porque: 'A partir de qué tamaño se comprime una imagen.' },
  { nombre: 'DOC_LADO_MAX_PX', motivo: 'tecnica', porque: 'Lado máximo de la imagen que se manda al modelo.' },
  { nombre: 'DOC_CONCURRENCIA_LOTE', motivo: 'tecnica', porque: 'Cuántos documentos se procesan en paralelo.' },
  {
    nombre: 'DOC_MAX_ARCHIVOS_LOTE',
    motivo: 'tecnica',
    porque:
      'Cuántos archivos entran en una carga. Roza lo operativo —quien carga lo siente— pero el límite existe por memoria y tiempo de proceso, no por una decisión del negocio.',
  },

]

export const ES_EXCLUIDA = new Set(EXCLUIDAS.map((e) => e.nombre))

export function resumenExclusiones() {
  return {
    tecnicas: EXCLUIDAS.filter((e) => e.motivo === 'tecnica').length,
    pendientes: EXCLUIDAS.filter((e) => e.motivo === 'pendiente').length,
  }
}
