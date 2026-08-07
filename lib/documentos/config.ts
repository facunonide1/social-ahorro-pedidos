/**
 * Configuración del motor de documentos.
 *
 * Todo lo ajustable vive acá y sale de variables de entorno, para poder mover
 * modelo y umbrales sin tocar código ni redeployar lógica.
 */

// ── Modelo de extracción ─────────────────────────────────────────────────────

/**
 * Modelo de visión que lee los documentos.
 *
 * Deliberadamente NO es el modelo más chico: las facturas de droguería
 * argentinas son papel térmico, matriz de punto y fotos torcidas. Un modelo
 * chico falla, y reprocesar sale más caro que acertar la primera vez —
 * además de que un número mal leído contamina el histórico de precios.
 */
export const DOC_MODELO = process.env.DOC_MODELO ?? 'claude-opus-5'

/** Tope de salida. Una factura larga puede tener 40+ líneas de JSON. */
export const DOC_MAX_TOKENS = Number(process.env.DOC_MAX_TOKENS ?? 16000)

/**
 * Esfuerzo de razonamiento. `high` por defecto: leer papel térmico torcido es
 * exactamente el caso donde conviene pensar más y equivocarse menos.
 */
export const DOC_EFFORT = process.env.DOC_EFFORT ?? 'high'

// ── Umbrales de matching ─────────────────────────────────────────────────────

/**
 * Similitud mínima para que un alias se aplique SOLO, sin que nadie lo mire.
 *
 * Arranca alto a propósito. Un alias mal aprendido no se equivoca una vez: se
 * propaga a todas las facturas siguientes de ese proveedor. Es más barato
 * revisar de más al principio que limpiar un histórico contaminado después.
 */
export const DOC_UMBRAL_AUTO = Number(process.env.DOC_UMBRAL_AUTO ?? 0.9)

/**
 * Cuántas veces tiene que haberse usado un alias antes de que el motor confíe
 * en él sin revisión. Tres: la primera vez lo matchea una persona, la segunda
 * confirma que no fue casualidad, la tercera ya es un patrón.
 */
export const DOC_USOS_MIN_AUTO = Number(process.env.DOC_USOS_MIN_AUTO ?? 3)

/** Similitud mínima para siquiera ofrecer un candidato en la revisión. */
export const DOC_UMBRAL_SUGERENCIA = Number(process.env.DOC_UMBRAL_SUGERENCIA ?? 0.3)

/** Cuántos candidatos se ofrecen por línea sin match. */
export const DOC_MAX_CANDIDATOS = Number(process.env.DOC_MAX_CANDIDATOS ?? 3)

// ── Archivos ─────────────────────────────────────────────────────────────────

/** Bucket privado donde vive la imagen original: la prueba ante el tercero. */
export const DOC_BUCKET = 'documentos-comerciales'

/** Tamaño máximo aceptado por el servidor (bytes). */
export const DOC_MAX_BYTES = Number(process.env.DOC_MAX_BYTES ?? 12 * 1024 * 1024)

/**
 * A partir de acá el cliente comprime la imagen antes de subir. Por debajo del
 * tope del servidor para que una foto de celular moderna (8–15 MB) entre sin
 * que la persona tenga que hacer nada.
 */
export const DOC_COMPRIMIR_DESDE_BYTES = Number(
  process.env.DOC_COMPRIMIR_DESDE_BYTES ?? 2 * 1024 * 1024,
)

/** Lado mayor máximo tras comprimir. Suficiente para leer un renglón de factura. */
export const DOC_LADO_MAX_PX = Number(process.env.DOC_LADO_MAX_PX ?? 2200)

export const DOC_MIMES_ACEPTADOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const

/** Lo que acepta el `<input type="file">`. */
export const DOC_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

/**
 * La API de Anthropic no acepta HEIC como imagen. Se sube igual (es el original
 * y sirve como prueba), pero la extracción lo rechaza con un mensaje humano.
 */
export const DOC_MIMES_LEGIBLES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

export const TENANT_ACTUAL = '00000000-0000-0000-0000-000000000001'
