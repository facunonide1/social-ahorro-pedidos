/**
 * EL REGISTRO DE CADA CORRIDA DE UN CRON.
 *
 * Antes ningún cron dejaba rastro: un timeout se veía sólo como un 504 en
 * Vercel, sin saber cuánto había tardado ni hasta dónde llegó. `conRegistro`
 * envuelve el handler y escribe una línea JSON al empezar y otra al terminar
 * (nombre, duración, status, error). No cambia la respuesta y no escribe en
 * la base: va a los logs de Vercel, que se pueden filtrar por `"cron":`.
 *
 * Si el handler tira, responde 500 con el mensaje (antes cada ruta lo hacía a
 * mano o directamente se caía).
 */
import { NextResponse } from 'next/server'

export type LineaCorrida = {
  cron: string
  evento: 'inicio' | 'fin'
  corrida: string
  ms?: number
  status?: number
  ok?: boolean
  error?: string
}

type Escritor = (linea: LineaCorrida) => void

const escribirPorDefecto: Escritor = (l) => {
  const txt = JSON.stringify(l)
  if (l.evento === 'fin' && l.ok === false) console.error(txt)
  else console.log(txt)
}

export function conRegistro<A extends unknown[]>(
  cron: string,
  handler: (...args: A) => Promise<Response>,
  { escribir = escribirPorDefecto, reloj = () => Date.now() }: { escribir?: Escritor; reloj?: () => number } = {},
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const corrida = Math.random().toString(36).slice(2, 10)
    const t0 = reloj()
    escribir({ cron, evento: 'inicio', corrida })
    try {
      const res = await handler(...args)
      escribir({ cron, evento: 'fin', corrida, ms: reloj() - t0, status: res.status, ok: res.status < 400 })
      return res
    } catch (e: any) {
      const error = String(e?.message ?? e ?? 'falló')
      escribir({ cron, evento: 'fin', corrida, ms: reloj() - t0, status: 500, ok: false, error })
      return NextResponse.json({ error }, { status: 500 })
    }
  }
}
