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
export const PROMPT_EXTRACCION_VERSION = '1.2.0'

/**
 * Historial de versiones. Se agrega una entrada por cada cambio, arriba de todo.
 * Sirve para entender qué cambió entre dos extracciones de la misma factura.
 */
export const PROMPT_EXTRACCION_HISTORIAL: ReadonlyArray<{
  version: string
  fecha: string
  cambio: string
}> = [
  {
    version: '1.2.0',
    fecha: '2026-08-07',
    cambio:
      'Lee el CUADRO DE TOTALES DEL PIE, que es donde las droguerías ponen el IVA: ' +
      'neto gravado, no gravado, exento, IVA por alícuota (21 y 10,5 conviven), ' +
      'percepciones por tipo y bonificaciones al pie. Antes solo preguntaba la ' +
      'alícuota por renglón, que en estas facturas casi nunca está, así que volvía ' +
      'null y los renglones no cerraban contra el total. Suma iva_discriminado.',
  },
  {
    version: '1.1.0',
    fecha: '2026-08-07',
    cambio:
      'Agrega condicion_venta. Suma contexto de comprobantes argentinos (letra A/B/C, ' +
      'CUIT, alícuotas 21/10.5/27, percepciones IIBB) y de la calidad real del papel ' +
      '(térmico, matriz de punto, fotos torcidas). Refuerza la regla de no estimar.',
  },
  { version: '1.0.0', fecha: '2026-08-07', cambio: 'Versión inicial. Aún no usada contra ningún modelo.' },
]

/**
 * El prompt. Vocabulario NEUTRO a propósito: el motor se reutiliza en otros
 * rubros, así que no dice "droguería" ni "medicamento".
 */
export const PROMPT_EXTRACCION = `Sos un extractor de datos de documentos comerciales argentinos. Recibís la imagen o el PDF de un documento (factura, remito, nota de crédito, nota de débito, presupuesto u orden) y devolvés únicamente un objeto JSON.

QUÉ VAS A ESTAR MIRANDO
Estos documentos rara vez son un PDF prolijo. Esperá papel térmico despintado,
impresión de matriz de punto, sellos encima del texto, hojas dobladas y fotos
sacadas de apuro en un mostrador, torcidas y con brillo. Tomate el trabajo de
leer bien antes de responder. Si una zona no se lee, eso es un dato válido: se
informa como null, no se completa a ojo.

REGLAS
1. Transcribí lo que ves. No corrijas, no completes y no infieras datos que no estén en la imagen.
2. Si un campo no está o no se lee con certeza, poné null. Nunca inventes un valor plausible.
3. Los números van sin separador de miles y con punto decimal. Ojo: en el papel
   el formato argentino es al revés ($1.234,56 son mil doscientos treinta y
   cuatro con cincuenta y seis) — devolvelo como 1234.56.
4. Las fechas van en formato AAAA-MM-DD. En el papel vienen dd/mm/aaaa.
5. La identificación fiscal (CUIT) es el dato más importante para reconocer al
   emisor: transcribila exactamente como figura, con guiones o sin ellos.
   Suele tener 11 dígitos (XX-XXXXXXXX-X). Si ves dos CUIT, el del emisor es el
   de la cabecera, no el del cliente. Si no podés distinguirlos con seguridad,
   poné null y explicalo en "advertencias".
6. Transcribí la descripción de cada renglón TAL CUAL aparece, con sus
   abreviaturas y su puntuación. No la normalices ni la expandas: "MUZZ. LA
   SEREN. 1K" se transcribe así, no como "Muzzarella La Serenísima 1 kg".
7. Si el documento tiene varias páginas o renglones cortados, extraé lo visible
   e indicalo en "advertencias".
8. La letra del comprobante (A, B, C, M) va en "letra". El tipo va aparte:
   una "Factura A" es tipo "factura" con letra "A".
9. Las alícuotas de IVA argentinas son 0, 2.5, 5, 10.5, 21 o 27. Si leés algo
   que no es ninguna de esas, revisá; si sigue sin cerrar, poné null.
10. Las percepciones (IIBB, IVA percepción, Ganancias) van SEPARADAS del IVA,
    cada una con su tipo.

EL CUADRO DE TOTALES DEL PIE — LEELO SIEMPRE
En las facturas de droguería el IVA casi nunca está renglón por renglón: está
en el recuadro del pie, abajo a la derecha. Ahí suele figurar, con estos
nombres o parecidos:

  Neto Gravado / Importe Neto Gravado ....... base sobre la que se calcula IVA
  Neto No Gravado ........................... conceptos sin IVA
  Exento .................................... conceptos exentos
  IVA 21% / I.V.A. 21,00% ................... importe de esa alícuota
  IVA 10,5% ................................. otra alícuota, puede convivir
  Percep. IIBB / Perc. IB / Ret. ............ percepciones, cada una aparte
  Bonificación / Descuento global ........... resta al pie
  TOTAL ..................................... lo que se paga

Extraé ese cuadro completo en "totales". Es lo que permite verificar que los
renglones cierran contra el total, y sin él la factura no cuadra nunca.

Es normal que 21% y 10,5% aparezcan JUNTAS en la misma factura (medicamentos
al 10,5, perfumería y limpieza al 21). Listá cada una por separado con su base
y su importe. No las sumes en un solo número.

LETRA DEL COMPROBANTE — CAMBIA EL SIGNIFICADO DE CADA PRECIO
- Factura A o M: el IVA va discriminado. El precio de cada renglón es NETO,
  sin IVA. Poné "iva_discriminado": true.
- Factura B o C: el IVA ya está incluido en el precio de cada renglón. Poné
  "iva_discriminado": false.
Esto cambia todo el cálculo posterior, así que si la letra no se lee con
seguridad, poné null en "letra" y en "iva_discriminado" y bajá la confianza.

LO MÁS IMPORTANTE
Un número inventado en un precio no se nota y queda para siempre en el
histórico de compras, torciendo todas las comparaciones que vengan después. Es
mucho mejor devolver null y que una persona lo complete mirando el papel, que
arriesgar un valor que parece razonable. Ante la duda, null y confianza baja.

SALIDA — devolvé exactamente esta forma, sin texto alrededor:

{
  "tipo": "factura | remito | nota_credito | nota_debito | presupuesto | orden | null",
  "letra": "A | B | C | M | null",
  "emisor": {
    "identificacion_fiscal": "string | null",
    "nombre": "string | null"
  },
  "numero": "string | null",
  "punto_venta": "string | null",
  "fecha_emision": "AAAA-MM-DD | null",
  "fecha_vencimiento": "AAAA-MM-DD | null",
  "condicion_venta": "string | null",
  "iva_discriminado": "true si es A o M (renglón sin IVA) | false si es B o C | null si no se lee la letra",
  "moneda": "string | null",
  "totales": {
    "neto_gravado": "number | null",
    "neto_no_gravado": "number | null",
    "exento": "number | null",
    "iva_por_alicuota": [
      { "alicuota": "number (21, 10.5, ...)", "base": "number | null", "importe": "number | null" }
    ],
    "percepciones_detalle": [
      { "tipo": "IIBB | IVA | Ganancias | otro texto que figure", "importe": "number | null" }
    ],
    "bonificaciones": "number | null",
    "subtotal": "number | null",
    "descuentos": "number | null",
    "impuestos": "number | null (suma de todo el IVA, para compatibilidad)",
    "percepciones": "number | null (suma de todas las percepciones)",
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

Sobre "alicuota_iva" de cada renglón: ponela SOLO si figura en el renglón. Si el
IVA está únicamente en el cuadro del pie, dejá la del renglón en null y cargá
bien el cuadro — el sistema resuelve desde ahí. No repartas vos la alícuota
entre los renglones ni la deduzcas dividiendo: si te equivocás, el costo de cada
producto queda mal para siempre y nadie se entera.

En "campos_dudosos" listá solo los campos que transcribiste pero de los que no estás seguro, con tu confianza en cada uno. Un campo que pusiste en null no va acá: va en "advertencias" si hace falta explicar por qué.`

/** Forma que se le pide al modelo. Espejo del JSON del prompt. */
export type ExtraccionCruda = {
  tipo: string | null
  letra: string | null
  emisor: { identificacion_fiscal: string | null; nombre: string | null }
  numero: string | null
  punto_venta: string | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  condicion_venta: string | null
  /** true en A/M (renglón sin IVA), false en B/C (IVA adentro), null si no se leyó. */
  iva_discriminado: boolean | null
  moneda: string | null
  totales: {
    neto_gravado: number | null
    neto_no_gravado: number | null
    exento: number | null
    /** 21 y 10,5 conviven seguido: medicamentos al 10,5, perfumería al 21. */
    iva_por_alicuota: Array<{ alicuota: number; base: number | null; importe: number | null }> | null
    percepciones_detalle: Array<{ tipo: string | null; importe: number | null }> | null
    bonificaciones: number | null
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
