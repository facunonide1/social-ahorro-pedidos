/**
 * Prompt de extracción de documentos comerciales — fuente única.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * REGLA: TODO CAMBIO EN EL TEXTO DEL PROMPT SUBE LA VERSIÓN.
 * Nunca se edita el prompt sin subir `PROMPT_EXTRACCION_VERSION`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Por qué importa: cada fila de `doc_extracciones` guarda con qué versión se
 * leyó ese documento. Eso es lo que permite, cuando el prompt mejore, saber
 * exactamente qué documentos se leyeron con la versión vieja y reprocesarlos
 * sin volver a pedirle las fotos a nadie.
 *
 * Si se edita el texto sin subir la versión, dos documentos quedan marcados
 * como leídos igual habiéndose leído distinto, y el reproceso deja de ser
 * confiable. No hay forma de detectarlo después.
 *
 * Versionado semántico:
 *   MAYOR  cambia la forma de la salida (rompe a quien la consume)
 *   MENOR  agrega un campo o una instrucción nueva, compatible hacia atrás
 *   PARCHE corrige redacción sin cambiar la forma de la salida
 *
 * ⚠️ Este módulo TODAVÍA NO se usa para llamar a ningún modelo. Existe, está
 * exportado y tipado, y espera al motor de lectura.
 */

/** Versión semántica del prompt. Subir SIEMPRE que cambie `PROMPT_EXTRACCION`. */
export const PROMPT_EXTRACCION_VERSION = '1.0.0'

/**
 * Historial de versiones. Se agrega una entrada por cada cambio, arriba de todo.
 * Sirve para entender qué cambió entre dos extracciones de la misma factura.
 */
export const PROMPT_EXTRACCION_HISTORIAL: ReadonlyArray<{
  version: string
  fecha: string
  cambio: string
}> = [
  { version: '1.0.0', fecha: '2026-08-07', cambio: 'Versión inicial. Aún no usada contra ningún modelo.' },
]

/**
 * El prompt. Vocabulario NEUTRO a propósito: el motor se reutiliza en otros
 * rubros, así que no dice "droguería" ni "medicamento".
 */
export const PROMPT_EXTRACCION = `Sos un extractor de datos de documentos comerciales. Recibís la imagen de un documento (factura, remito, nota de crédito, nota de débito, presupuesto u orden) y devolvés únicamente un objeto JSON.

REGLAS
1. Transcribí lo que ves. No corrijas, no completes y no infieras datos que no estén en la imagen.
2. Si un campo no está o no se lee con certeza, poné null. Nunca inventes un valor plausible.
3. Los números van sin separador de miles y con punto decimal.
4. Las fechas van en formato AAAA-MM-DD.
5. La identificación fiscal (CUIT) es el dato más importante para reconocer al emisor: transcribila exactamente como figura, con guiones o sin ellos, tal cual está.
6. Transcribí la descripción de cada renglón TAL CUAL aparece, con sus abreviaturas y su puntuación. No la normalices ni la expandas.
7. Si el documento tiene varias páginas o renglones cortados, extraé lo visible e indicalo en "advertencias".

SALIDA — devolvé exactamente esta forma, sin texto alrededor:

{
  "tipo": "factura | remito | nota_credito | nota_debito | presupuesto | orden | null",
  "emisor": {
    "identificacion_fiscal": "string | null",
    "nombre": "string | null"
  },
  "numero": "string | null",
  "punto_venta": "string | null",
  "fecha_emision": "AAAA-MM-DD | null",
  "fecha_vencimiento": "AAAA-MM-DD | null",
  "moneda": "string | null",
  "totales": {
    "subtotal": "number | null",
    "descuentos": "number | null",
    "impuestos": "number | null",
    "percepciones": "number | null",
    "total": "number | null"
  },
  "lineas": [
    {
      "nro_linea": "number",
      "codigo": "string | null",
      "descripcion": "string",
      "cantidad": "number | null",
      "unidad": "string | null",
      "precio_unitario": "number | null",
      "descuento_pct": "number | null",
      "alicuota_iva": "number | null",
      "total_linea": "number | null"
    }
  ],
  "confianza_global": "number entre 0 y 1",
  "campos_dudosos": { "nombre_del_campo": "number entre 0 y 1" },
  "advertencias": ["string"]
}

En "campos_dudosos" listá solo los campos que transcribiste pero de los que no estás seguro, con tu confianza en cada uno. Un campo que pusiste en null no va acá: va en "advertencias" si hace falta explicar por qué.`

/** Forma que se le pide al modelo. Espejo del JSON del prompt. */
export type ExtraccionCruda = {
  tipo: string | null
  emisor: { identificacion_fiscal: string | null; nombre: string | null }
  numero: string | null
  punto_venta: string | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  moneda: string | null
  totales: {
    subtotal: number | null
    descuentos: number | null
    impuestos: number | null
    percepciones: number | null
    total: number | null
  }
  lineas: Array<{
    nro_linea: number
    codigo: string | null
    descripcion: string
    cantidad: number | null
    unidad: string | null
    precio_unitario: number | null
    descuento_pct: number | null
    alicuota_iva: number | null
    total_linea: number | null
  }>
  confianza_global: number
  campos_dudosos: Record<string, number>
  advertencias: string[]
}

/**
 * Reprocesa una extracción ya guardada con una versión nueva del prompt.
 *
 * ⚠️ NO IMPLEMENTADA — la firma existe para fijar el contrato antes de que se
 * escriba el motor de lectura.
 *
 * Contrato previsto:
 * - Lee `doc_extracciones` por id y toma `archivo_path` del bucket
 *   `documentos-comerciales`. No requiere que nadie vuelva a subir la foto.
 * - Vuelve a llamar al modelo con `PROMPT_EXTRACCION` en la versión indicada.
 * - Inserta una FILA NUEVA en `doc_extracciones` (una por intento), nunca pisa
 *   la anterior: la extracción vieja es la evidencia de cómo se leyó entonces.
 * - No toca `doc_documentos` ni `doc_lineas`: aplicar el resultado es una
 *   decisión humana posterior, en la pantalla de revisión.
 *
 * @param extraccionId      fila de `doc_extracciones` a reprocesar
 * @param nuevaPromptVersion versión con la que se relee (default: la actual)
 * @returns el id de la NUEVA fila de `doc_extracciones`
 */
export async function reprocesarExtraccion(
  extraccionId: string,
  nuevaPromptVersion: string = PROMPT_EXTRACCION_VERSION,
): Promise<string> {
  throw new Error(
    `reprocesarExtraccion no implementada (extraccion=${extraccionId}, version=${nuevaPromptVersion}). ` +
      'Llega con el motor de lectura.',
  )
}
