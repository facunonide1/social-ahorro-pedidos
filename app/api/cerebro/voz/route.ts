import { createHash } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { tieneMontos } from '@/lib/cerebro/conversacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * E · LA VOZ, CON ELEVENLABS, DESDE EL SERVIDOR.
 *
 * ── E.1 · LA CLAVE NUNCA VA AL NAVEGADOR ────────────────────────────────────
 *
 * El navegador pide `/api/cerebro/voz?t=…` y recibe audio. La clave vive en
 * `ELEVENLABS_API_KEY` del servidor y no aparece en ninguna respuesta.
 *
 * ── E.2 · EN STREAMING ──────────────────────────────────────────────────────
 *
 * Con `eleven_flash_v2_5` y el endpoint `/stream`: los bytes se le pasan al
 * navegador a medida que llegan, y el `<audio>` empieza a sonar con el primer
 * pedazo. Si el audio tardara dos segundos en arrancar, se rompe la sensación.
 *
 * ── E.4 Y E.5 · TOPE Y CACHÉ ────────────────────────────────────────────────
 *
 * Primero la caché: lo que ya se dijo no se vuelve a generar y no consume
 * tope. Si no está, se RESERVA el gasto antes de pedir (`voz_gasto_reservar`,
 * atómico) y recién después se llama a ElevenLabs. Al terminar el stream, el
 * audio se guarda en la caché ANTES de cerrar la respuesta: cerrarla primero
 * dejaría a la función congelada a mitad de la subida.
 *
 * Todo con la sesión del dueño: el bucket tiene políticas de super_admin.
 *
 * ── E.7 · SI FALLA, EL TEXTO SIGUE ──────────────────────────────────────────
 *
 * Cualquier falla devuelve JSON con `razon` y el navegador escribe igual.
 */

const MODELO = 'eleven_flash_v2_5'
/** Una voz de las premade, multilingüe. Se cambia con ELEVENLABS_VOICE_ID. */
const VOZ_POR_DEFECTO = 'EXAVITQu4vr4xnSDxMaL'
const BUCKET = 'voz-cache'

function falla(status: number, razon: string, texto: string) {
  return NextResponse.json({ ok: false, razon, texto }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return falla(401, 'sesion', 'no hay sesión')

  const url = new URL(req.url)
  const clave = process.env.ELEVENLABS_API_KEY
  const voz = process.env.ELEVENLABS_VOICE_ID || VOZ_POR_DEFECTO

  // Para la pantalla: cómo va el gasto, y si hay voz configurada. Sin generar nada.
  if (url.searchParams.get('solo_estado')) {
    const { data: gasto } = await sb.rpc('voz_gasto_estado')
    return NextResponse.json(
      { ok: true, hay_clave: !!clave, modelo: MODELO, gasto },
      { headers: { 'cache-control': 'no-store' } })
  }

  const t = (url.searchParams.get('t') ?? '').trim().slice(0, 400)
  if (!t) return falla(400, 'vacio', 'no hay nada que decir')
  // D.4 · un monto no se dice en voz alta. Si llega uno, es un error de quien
  // armó la frase: no se habla, se escribe.
  if (tieneMontos(t)) return falla(422, 'montos', 'la frase tiene un monto: va escrita, no hablada')
  if (!clave) return falla(503, 'sin_clave', 'la voz no está configurada: falta la clave de ElevenLabs en el servidor')

  const huella = createHash('sha256').update(`${MODELO}|${voz}|${t}`).digest('hex')
  const ruta = `${huella.slice(0, 2)}/${huella}.mp3`

  // E.5 · lo que ya se dijo, de la caché. No consume tope.
  const { data: guardado } = await sb.storage.from(BUCKET).download(ruta)
  if (guardado) {
    return new Response(guardado.stream(), {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400', 'x-voz': 'cache' },
    })
  }

  // E.4 · el tope, antes de pedir.
  const { data: reserva, error: eR } = await sb.rpc('voz_gasto_reservar', { p_caracteres: t.length, p_huella: huella })
  if (eR) return falla(500, 'tope', `no se pudo verificar el tope: ${eR.message}`)
  if (!reserva?.ok) return falla(402, 'tope', reserva?.por_que ?? 'se llegó al tope de voz del mes')

  let el: Response
  try {
    el = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}/stream?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': clave, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: t, model_id: MODELO, language_code: 'es' }),
    })
  } catch {
    return falla(502, 'red', 'no hay red hasta ElevenLabs')
  }
  if (!el.ok || !el.body) {
    const detalle = el.status === 401 ? 'la clave no es válida'
      : el.status === 402 || el.status === 429 ? 'no queda crédito o hay demasiados pedidos'
      : `respondió ${el.status}`
    return falla(502, 'proveedor', `ElevenLabs ${detalle}`)
  }

  const lector = el.body.getReader()
  const pedazos: Uint8Array[] = []
  const salida = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const { value, done } = await lector.read()
      if (done) {
        // Se guarda antes de cerrar: después la función puede quedar congelada.
        try {
          const total = pedazos.reduce((a, p) => a + p.length, 0)
          const buf = new Uint8Array(total)
          let o = 0
          for (const p of pedazos) { buf.set(p, o); o += p.length }
          await sb.storage.from(BUCKET).upload(ruta, buf, { contentType: 'audio/mpeg', upsert: false })
        } catch { /* la caché es un ahorro, no un requisito */ }
        ctrl.close()
        return
      }
      pedazos.push(value)
      ctrl.enqueue(value)
    },
    cancel() { void lector.cancel() },
  })

  return new Response(salida, {
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'no-store',
      'x-voz': 'nueva',
      'x-voz-uso-pct': String(reserva.pct ?? ''),
      'x-voz-cerca': String(!!reserva.cerca),
    },
  })
}

/** E.4 · el tope es configurable: lo cambia el dueño desde el cerebro. */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return falla(401, 'sesion', 'no hay sesión')
  let body: any
  try { body = await req.json() } catch { return falla(400, 'body', 'body inválido') }
  const tope = Math.round(Number(body?.tope))
  if (!Number.isFinite(tope) || tope < 0) return falla(400, 'tope', 'el tope tiene que ser un número de caracteres')
  const { data, error } = await sb.rpc('voz_tope_definir', { p_tope: tope, p_aviso_pct: null })
  if (error) return falla(500, 'tope', error.message)
  return NextResponse.json(data)
}
