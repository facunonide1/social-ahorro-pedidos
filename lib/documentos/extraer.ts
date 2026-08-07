import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import {
  DOC_BUCKET,
  DOC_EFFORT,
  DOC_MAX_TOKENS,
  DOC_MIMES_LEGIBLES,
  DOC_MODELO,
} from '@/lib/documentos/config'
import {
  PROMPT_EXTRACCION,
  PROMPT_EXTRACCION_VERSION,
  type ExtraccionCruda,
} from '@/lib/documentos/prompt-extraccion'

type Adm = any

export type ResultadoExtraccion =
  | { estado: 'ok'; datos: ExtraccionCruda; confianzaGlobal: number | null }
  | { estado: 'error'; mensaje: string }

/**
 * Mensajes de error en castellano llano. El usuario nunca ve un código, un
 * nombre de tabla ni un stack: ve qué le pasó y qué puede hacer.
 */
const ERRORES = {
  sinModelo: 'La lectura automática no está disponible en este momento. Podés cargar el documento a mano.',
  formato: 'Ese formato de imagen no lo puedo leer. Sacá la foto de nuevo en JPG o PNG, o subí el PDF.',
  archivo: 'No pude abrir el archivo que subiste. Probá subirlo de nuevo.',
  ilegible: 'No pude leer el documento. Suele pasar cuando la foto está movida, muy oscura o cortada: probá sacarla derecha, con buena luz y que entre toda la hoja.',
  modelo: 'Tuve un problema al leer el documento. Probá de nuevo en un momento.',
} as const

/** Quita las cercas ```json que el modelo a veces agrega igual. */
function limpiarJson(texto: string): string {
  return texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

/**
 * Lee un documento con el modelo de visión y devuelve el JSON estructurado.
 *
 * No escribe en la base: eso lo hace `procesarExtraccion`. Acá sólo se lee.
 */
export async function extraerDeArchivo(
  archivo: { base64: string; mime: string },
): Promise<ResultadoExtraccion> {
  if (!hasAnthropicKey()) return { estado: 'error', mensaje: ERRORES.sinModelo }
  if (!DOC_MIMES_LEGIBLES.includes(archivo.mime as any)) {
    return { estado: 'error', mensaje: ERRORES.formato }
  }

  // El PDF viaja como `document`; las imágenes como `image`.
  const bloque =
    archivo.mime === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: archivo.base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: archivo.mime as any, data: archivo.base64 } }

  let texto: string
  try {
    const anthropic = getAnthropic()
    const resp = await anthropic.messages.create({
      model: DOC_MODELO,
      max_tokens: DOC_MAX_TOKENS,
      system: PROMPT_EXTRACCION,
      messages: [
        {
          role: 'user',
          content: [bloque as any, { type: 'text', text: 'Extraé los datos de este documento y devolvé solo el JSON.' }],
        },
      ],
      // `effort` todavía no está tipado en la versión del SDK instalada.
      ...({ output_config: { effort: DOC_EFFORT } } as any),
    } as any)

    texto = (resp.content as any[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (e: any) {
    console.error('[documentos] el modelo falló al leer', e?.message ?? e)
    return { estado: 'error', mensaje: ERRORES.modelo }
  }

  if (!texto) return { estado: 'error', mensaje: ERRORES.ilegible }

  let datos: ExtraccionCruda
  try {
    datos = JSON.parse(limpiarJson(texto))
  } catch {
    console.error('[documentos] el modelo no devolvió JSON válido:', texto.slice(0, 400))
    return { estado: 'error', mensaje: ERRORES.ilegible }
  }

  if (!datos || typeof datos !== 'object' || !Array.isArray(datos.lineas)) {
    return { estado: 'error', mensaje: ERRORES.ilegible }
  }

  const conf = typeof datos.confianza_global === 'number' ? datos.confianza_global : null
  return { estado: 'ok', datos, confianzaGlobal: conf }
}

/**
 * Procesa una extracción ya subida: baja el archivo del bucket, lo lee con el
 * modelo y guarda la respuesta CRUDA.
 *
 * La respuesta cruda se guarda entera, salga bien o mal. Es lo que permite
 * reprocesar cuando el prompt mejore sin volver a pedirle la foto a nadie, y es
 * la evidencia de cómo se leyó ese papel en ese momento.
 *
 * `procesando` actúa como candado: si dos requests entran a la vez sobre el
 * mismo archivo, el segundo no vuelve a pagar la llamada al modelo.
 */
export async function procesarExtraccion(
  adm: Adm,
  extraccionId: string,
): Promise<ResultadoExtraccion> {
  const { data: ext } = await adm
    .from('doc_extracciones')
    .select('id, archivo_path, mime_type, estado, respuesta_cruda, confianza_global')
    .eq('id', extraccionId)
    .maybeSingle()

  if (!ext) return { estado: 'error', mensaje: ERRORES.archivo }

  if (ext.estado === 'ok' && ext.respuesta_cruda?.lineas) {
    return { estado: 'ok', datos: ext.respuesta_cruda as ExtraccionCruda, confianzaGlobal: ext.confianza_global ?? null }
  }
  if (ext.estado === 'procesando') {
    return { estado: 'error', mensaje: 'Ya lo estoy leyendo. Esperá unos segundos y actualizá.' }
  }

  await adm.from('doc_extracciones').update({ estado: 'procesando' }).eq('id', extraccionId)

  const { data: blob, error: eDl } = await adm.storage.from(DOC_BUCKET).download(ext.archivo_path)
  if (eDl || !blob) {
    await adm.from('doc_extracciones').update({ estado: 'error', error: 'no se pudo bajar el archivo del bucket' }).eq('id', extraccionId)
    return { estado: 'error', mensaje: ERRORES.archivo }
  }

  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
  const r = await extraerDeArchivo({ base64, mime: ext.mime_type ?? '' })

  if (r.estado === 'error') {
    await adm
      .from('doc_extracciones')
      .update({ estado: 'error', error: r.mensaje, procesado_at: new Date().toISOString() })
      .eq('id', extraccionId)
    return r
  }

  await adm
    .from('doc_extracciones')
    .update({
      estado: 'ok',
      respuesta_cruda: r.datos,
      confianza_global: r.confianzaGlobal,
      campos_dudosos: r.datos.campos_dudosos ?? null,
      modelo: DOC_MODELO,
      prompt_version: PROMPT_EXTRACCION_VERSION,
      error: null,
      procesado_at: new Date().toISOString(),
    })
    .eq('id', extraccionId)

  return r
}
