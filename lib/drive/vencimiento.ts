import { AVISO_VENCIMIENTO_HORAS, DIAS_REFRESH_TESTING } from './flag'

/**
 * La app de Google queda en Testing: el refresh token dura 7 días. No es un
 * dato que devuelva Google en el token; se calcula desde connected_at.
 * invalid_grant es la confirmación. Esto es el aviso de antes.
 */

export type AvisoPlazo = 'ok' | 'por_vencer' | 'vencido'

export function venceEstimado(connectedAt: Date): Date {
  return new Date(connectedAt.getTime() + DIAS_REFRESH_TESTING * 24 * 60 * 60 * 1000)
}

export function avisoPlazo(ahora: Date, connectedAt: Date): AvisoPlazo {
  const falta = venceEstimado(connectedAt).getTime() - ahora.getTime()
  if (falta <= 0) return 'vencido'
  if (falta <= AVISO_VENCIMIENTO_HORAS * 60 * 60 * 1000) return 'por_vencer'
  return 'ok'
}

/** Backoff: 2, 4 y 8 minutos. Al cuarto fallo ya no se reintenta. */
export function proximoIntento(intentos: number, ahora = new Date()): Date {
  const minutos = 2 ** Math.max(1, intentos)
  return new Date(ahora.getTime() + minutos * 60 * 1000)
}
