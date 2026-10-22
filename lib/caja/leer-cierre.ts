import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { DOC_MAX_TOKENS, DOC_MIMES_LEGIBLES, DOC_MODELO } from '@/lib/documentos/config'

/**
 * LEER LA FOTO DEL CIERRE DE SIFACO.
 *
 * ── POR QUÉ ESTO EXISTE, Y QUÉ REUSA ────────────────────────────────────────
 *
 * El cierre se fotografía desde la v0.20 y la foto se guardaba sin leerse: los
 * totales se escribían a mano mirándola. Eso es doble carga y es donde se
 * cuelan los errores de tipeo que después el control de caja marca como
 * diferencia.
 *
 * NO se reimplementa el motor de documentos: se reusa su cliente, su modelo,
 * sus límites y su manejo de formatos. Lo único propio es el prompt, porque un
 * cierre de caja no es una factura — no tiene CUIT, no tiene renglones, y lo
 * que hay que sacar son cuatro totales.
 *
 * ── LA CONFIRMACIÓN HUMANA, LA PRIMERA VEZ ──────────────────────────────────
 *
 * Igual que el match de productos en la v0.93: lo leído se propone, no se
 * guarda. Quien cierra ve los números al lado de la foto y confirma o corrige.
 * Un total mal leído que entra solo es peor que no leer nada, porque después
 * el control va a marcar una diferencia que no existe y alguien va a salir a
 * buscar plata que está.
 */

export interface CierreLeido {
  efectivo: number | null
  tarjetas: number | null
  mercadopago: number | null
  otros: number | null
  total: number | null
  /** La hora que figura en el cierre, tal como se lee. */
  hora: string | null
  /** Qué no se pudo leer y por qué. Se muestra al lado de los números. */
  dudas: string[]
}

export type ResultadoCierre =
  | { estado: 'ok'; datos: CierreLeido }
  | { estado: 'error'; mensaje: string }

const PROMPT = `Sos un lector de cierres de caja de SIFACO, el sistema de gestión de una farmacia argentina.

Te mando la FOTO de la pantalla de cierre de caja. Tenés que devolver SOLO un JSON con los totales.

QUÉ BUSCAR
- El total en EFECTIVO
- El total en TARJETAS (débito y crédito juntos, si vienen separados sumalos)
- El total de MERCADOPAGO o QR, si aparece
- OTROS medios, si aparecen
- El TOTAL general
- La HORA del cierre, si figura

REGLAS QUE NO SE NEGOCIAN
1. Si un número no se ve o no estás seguro, poné null y explicá en "dudas".
   NUNCA pongas 0 por un número que no pudiste leer: 0 quiere decir "ese medio
   no cobró nada", y eso es una afirmación distinta.
2. Los montos en formato argentino (1.234,56) van como número: 1234.56
3. No inventes un medio de pago que no está en la foto.
4. Si la foto está movida, cortada o no es un cierre de caja, devolvé todos los
   campos en null y decilo en "dudas".

FORMATO (solo el JSON, sin texto alrededor):
{
  "efectivo": number | null,
  "tarjetas": number | null,
  "mercadopago": number | null,
  "otros": number | null,
  "total": number | null,
  "hora": "HH:MM" | null,
  "dudas": ["..."]
}`

export async function leerCierreDeFoto(
  archivo: { base64: string; mime: string },
): Promise<ResultadoCierre> {
  if (!hasAnthropicKey()) {
    return { estado: 'error', mensaje: 'La lectura automática no está disponible. Cargá los totales a mano.' }
  }
  if (!DOC_MIMES_LEGIBLES.includes(archivo.mime as any)) {
    return { estado: 'error', mensaje: 'Ese formato no lo puedo leer. Sacá la foto en JPG o PNG.' }
  }

  const bloque = archivo.mime === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: archivo.base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: archivo.mime as any, data: archivo.base64 } }

  let texto: string
  try {
    const anthropic = getAnthropic()
    const resp = await anthropic.messages.create({
      model: DOC_MODELO,
      max_tokens: DOC_MAX_TOKENS,
      system: PROMPT,
      messages: [{
        role: 'user',
        content: [bloque as any, { type: 'text', text: 'Leé los totales de este cierre y devolvé solo el JSON.' }],
      }],
    })
    texto = resp.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
  } catch {
    return { estado: 'error', mensaje: 'Tuve un problema al leer la foto. Probá de nuevo en un momento.' }
  }

  try {
    const limpio = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const j = JSON.parse(limpio) as CierreLeido
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return {
      estado: 'ok',
      datos: {
        efectivo: num(j.efectivo),
        tarjetas: num(j.tarjetas),
        mercadopago: num(j.mercadopago),
        otros: num(j.otros),
        total: num(j.total),
        hora: typeof j.hora === 'string' ? j.hora : null,
        dudas: Array.isArray(j.dudas) ? j.dudas.map(String) : [],
      },
    }
  } catch {
    return {
      estado: 'error',
      mensaje: 'Leí la foto pero no entendí la respuesta. Cargá los totales a mano: no quiero adivinar un número de caja.',
    }
  }
}
