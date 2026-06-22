/**
 * Motor de puntos (CRM · v0.29). Las REGLAS viven en NORA HQ (puntos_reglas);
 * el saldo y el canje siguen en la cuponera. Al sumar puntos, escribimos en
 * `puntos_movimientos` (HQ) y sincronizamos con la cuponera respetando su
 * formato: `point_transactions` (ledger) + `user_points` (saldo).
 */
import type { PuntosEvento } from '@/lib/types/crm'

type Adm = any

/** Calcula los puntos de un evento según la regla activa. */
export async function puntosDe(adm: Adm, evento: PuntosEvento, monto?: number): Promise<number> {
  const { data: regla } = await adm.from('puntos_reglas').select('puntos, ratio_monto, activa').eq('evento', evento).maybeSingle()
  if (!regla || !regla.activa) return 0
  if (evento === 'compra' && regla.ratio_monto && monto) return Math.floor(Number(monto) / Number(regla.ratio_monto))
  return Number(regla.puntos ?? 0)
}

export type ResultadoPuntos = { ok: boolean; puntos: number; sincronizado: boolean }

/**
 * Suma puntos a un cliente por un evento. Idempotencia opcional por
 * (referencia_tipo, referencia_id) para no duplicar (ej. el mismo ticket).
 */
export async function sumarPuntos(
  adm: Adm,
  clienteId: string,
  evento: PuntosEvento,
  opts: { monto?: number; puntos?: number; referenciaTipo?: string; referenciaId?: string; esDemo?: boolean } = {},
): Promise<ResultadoPuntos> {
  // anti-duplicado
  if (opts.referenciaTipo && opts.referenciaId) {
    const { data: ya } = await adm.from('puntos_movimientos').select('id')
      .eq('cliente_id', clienteId).eq('referencia_tipo', opts.referenciaTipo).eq('referencia_id', opts.referenciaId).maybeSingle()
    if (ya) return { ok: true, puntos: 0, sincronizado: false }
  }

  const puntos = opts.puntos != null ? opts.puntos : await puntosDe(adm, evento, opts.monto)
  if (!puntos) return { ok: true, puntos: 0, sincronizado: false }

  const { data: cli } = await adm.from('clientes').select('id, puntos, cuponera_user_id').eq('id', clienteId).maybeSingle()
  if (!cli) return { ok: false, puntos: 0, sincronizado: false }

  // sincronizar con la cuponera (si el cliente es socio del Club)
  let sincronizado = false
  if (cli.cuponera_user_id) {
    try {
      await adm.from('point_transactions').insert({ user_id: cli.cuponera_user_id, points: puntos, type: evento, description: `NORA HQ · ${evento}` })
      const { data: up } = await adm.from('user_points').select('user_id, points').eq('user_id', cli.cuponera_user_id).maybeSingle()
      if (up) await adm.from('user_points').update({ points: Number(up.points ?? 0) + puntos, updated_at: new Date().toISOString() }).eq('user_id', cli.cuponera_user_id)
      else await adm.from('user_points').insert({ user_id: cli.cuponera_user_id, points: puntos })
      sincronizado = true
    } catch { sincronizado = false }
  }

  await adm.from('puntos_movimientos').insert({
    cliente_id: clienteId, evento, puntos, referencia_tipo: opts.referenciaTipo ?? null,
    referencia_id: opts.referenciaId ?? null, sincronizado, es_demo: !!opts.esDemo,
  })
  await adm.from('clientes').update({ puntos: Number(cli.puntos ?? 0) + puntos }).eq('id', clienteId)

  return { ok: true, puntos, sincronizado }
}
