/**
 * E.3 · EL PROMPT PARA LEER UNA LIQUIDACIÓN FOTOGRAFIADA.
 *
 * ── POR QUÉ UNO NUEVO Y NO EL DEL MOTOR ─────────────────────────────────────
 *
 * Una liquidación de obra social no es una factura de droguería. No tiene
 * renglones de producto con precio unitario: tiene renglones de débito, cada
 * uno con un comprobante, un importe y un motivo escrito en el idioma de esa
 * obra social.
 *
 * El motor de documentos (v0.93) se reusa entero —la subida, el hash, el
 * deduplicado, la llamada al modelo, la limpieza del JSON, la tabla de
 * extracciones y la confirmación humana—. Lo único propio es este prompt y la
 * forma del JSON que pide. Ver el parámetro `otroPrompt` de
 * `extraerDeArchivo`.
 *
 * ── LA REGLA QUE ESTÁ EN EL PROMPT ──────────────────────────────────────────
 *
 * Se le dice explícitamente que **NO** extraiga nombres de pacientes, de
 * médicos ni diagnósticos, aunque estén en el papel. Es la regla de oro 9, y
 * en este caso particular importa de verdad: una liquidación de obra social
 * suele traer el apellido del afiliado en cada renglón.
 *
 * El modelo lo va a ver. La instrucción es que no lo devuelva.
 */

export const PROMPT_LIQUIDACION_VERSION = 'liquidacion-v1'

export const PROMPT_LIQUIDACION = `Sos un extractor de datos de liquidaciones de obras sociales y prepagas argentinas. Recibís la imagen o el PDF de una liquidación —el papel donde la obra social detalla qué le descontó a la farmacia— y devolvés únicamente un objeto JSON.

REGLA ABSOLUTA, POR ENCIMA DE TODO LO DEMÁS:
NO extraigas, NO transcribas y NO devuelvas en ningún campo:
  · nombres ni apellidos de pacientes o afiliados
  · números de afiliado, DNI, credencial ni plan
  · nombres ni matrículas de médicos
  · diagnósticos, patologías ni nombres de drogas prescriptas

Es muy probable que el papel los tenga. Los vas a ver y los vas a ignorar. El sistema que recibe esto NO tiene dónde guardarlos y no debe tenerlo: registra el hecho administrativo (qué se descontó y por qué), no el acto médico.

Si una columna del papel contiene uno de esos datos, no la devuelvas. No la devuelvas tampoco "para dar contexto".

QUÉ SÍ EXTRAER, renglón por renglón:
  · numero_comprobante: el número de la receta, bono o formulario. Es un número administrativo, no identifica a nadie.
  · fecha: la fecha del renglón (del despacho o de la receta), en formato AAAA-MM-DD.
  · importe: cuánto se debitó en ESE renglón, como número. Si el papel lo trae en negativo o entre paréntesis, devolvelo positivo: lo que importa es cuánto se descontó.
  · motivo_texto: el motivo del débito TAL CUAL está escrito, incluido el código si lo hay. No lo interpretes, no lo normalices y no lo traduzcas. Si dice "DEB. S/COD 4471", devolvé "DEB. S/COD 4471".
  · sucursal_texto: si el renglón o el encabezado indican la farmacia o sucursal, el texto tal cual. Si no está, null.

Y del encabezado de la liquidación:
  · obra_social: el nombre tal cual figura.
  · periodo: el período que liquida, como texto.
  · fecha_liquidacion: la fecha de la liquidación, AAAA-MM-DD.
  · total_debitado: el total descontado que declare el papel, si lo declara.

REGLAS DE LECTURA:
1. Un número que no se puede leer con seguridad va en null. NO adivines un importe: un importe inventado se convierte en un reclamo inventado.
2. Los importes argentinos usan punto para miles y coma para decimales: 1.234,56 es 1234.56.
3. Si la liquidación tiene varias páginas en el PDF, devolvé los renglones de todas.
4. Si no podés leer el papel, devolvé renglones como lista vacía y poné en "ilegible" por qué.
5. No sumes ni calcules nada. Devolvé lo que dice el papel.

FORMATO (solo JSON, sin texto alrededor):
{
  "obra_social": "string | null",
  "periodo": "string | null",
  "fecha_liquidacion": "AAAA-MM-DD | null",
  "total_debitado": "number | null",
  "confianza_global": "number entre 0 y 1",
  "ilegible": "string | null",
  "renglones": [
    {
      "numero_comprobante": "string | null",
      "fecha": "AAAA-MM-DD | null",
      "importe": "number | null",
      "motivo_texto": "string | null",
      "sucursal_texto": "string | null"
    }
  ]
}`

export interface LiquidacionLeida {
  obra_social: string | null
  periodo: string | null
  fecha_liquidacion: string | null
  total_debitado: number | null
  confianza_global: number | null
  ilegible: string | null
  renglones: {
    numero_comprobante: string | null
    fecha: string | null
    importe: number | null
    motivo_texto: string | null
    sucursal_texto: string | null
  }[]
}

/**
 * Los campos que el modelo NO tiene que devolver.
 *
 * El prompt se lo dice, y esto lo verifica. Un prompt es una instrucción, no
 * una garantía: si el modelo devuelve un apellido de todas formas, se tira la
 * clave antes de que llegue a la base.
 */
const CLAVES_PROHIBIDAS =
  /(paciente|afiliad|benefici|apellido|dni|documento|credencial|plan_|medic|matricula|diagnost|patolog|droga)/i

export function limpiarDeDatosDePersonas(datos: any): { datos: any; saco: string[] } {
  const saco: string[] = []
  const limpiar = (o: any): any => {
    if (Array.isArray(o)) return o.map(limpiar)
    if (!o || typeof o !== 'object') return o
    const r: any = {}
    for (const [k, v] of Object.entries(o)) {
      if (CLAVES_PROHIBIDAS.test(k)) { saco.push(k); continue }
      r[k] = limpiar(v)
    }
    return r
  }
  return { datos: limpiar(datos), saco: Array.from(new Set(saco)) }
}
