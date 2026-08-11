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

  /* ── De negocio, y todavía sin declarar ─────────────────────────────── */
  //
  // Declarar un parámetro no es agregar una línea: es elegirle el peso, el
  // rango, la unidad y verificar dónde se consume. Hacerlo de apuro para nueve
  // a la vez es exactamente el trabajo que este proyecto no hace bien.
  { nombre: 'DOC_UMBRAL_SUGERENCIA', motivo: 'pendiente', porque: 'Confianza mínima para sugerir una asociación. Pendiente de peso, rango y unidad.' },
  { nombre: 'DOC_MAX_CANDIDATOS', motivo: 'pendiente', porque: 'Cuántas alternativas se ofrecen al revisar. Pendiente.' },
  { nombre: 'DOC_DIAS_VOLUMEN', motivo: 'pendiente', porque: 'Ventana para medir cuánto se compró y ponderar el ahorro. Pendiente.' },
  { nombre: 'DOC_ALERTA_MONTO_MINIMO', motivo: 'pendiente', porque: 'Plata mínima en juego para molestar a alguien con una alerta. Pendiente.' },
  { nombre: 'DOC_CONC_VENTANA_DIAS', motivo: 'pendiente', porque: 'Cuántos días atrás se buscan órdenes candidatas. Del circuito de conciliación. Pendiente.' },
  { nombre: 'DOC_CONC_TOL_CANTIDAD', motivo: 'pendiente', porque: 'Tolerancia de cantidad al conciliar. Pendiente.' },
  { nombre: 'DOC_CONC_TOL_PRECIO_PCT', motivo: 'pendiente', porque: 'Tolerancia de precio en porcentaje al conciliar. Pendiente.' },
  { nombre: 'DOC_CONC_TOL_PRECIO_ARS', motivo: 'pendiente', porque: 'Tolerancia de precio en pesos al conciliar. Pendiente.' },
  { nombre: 'DOC_CONC_MONTO_MINIMO', motivo: 'pendiente', porque: 'Monto mínimo para abrir una conciliación. Pendiente.' },
  { nombre: 'DOC_CONC_DIAS_TAREA', motivo: 'pendiente', porque: 'Plazo de la tarea que abre una conciliación con diferencia. Pendiente.' },
]

export const ES_EXCLUIDA = new Set(EXCLUIDAS.map((e) => e.nombre))

export function resumenExclusiones() {
  return {
    tecnicas: EXCLUIDAS.filter((e) => e.motivo === 'tecnica').length,
    pendientes: EXCLUIDAS.filter((e) => e.motivo === 'pendiente').length,
  }
}
