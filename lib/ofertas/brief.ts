/**
 * Brief al community manager (OS-6b · O-07). Al aprobar una oferta con canal web
 * se genera un brief con token público (vista /brief/[token] sin login) y copy
 * sugerido (plantilla; el motor NORA se puede enchufar después). El aprobador
 * reenvía el link por WhatsApp al CM.
 */
import { randomUUID } from 'crypto'

type Adm = any

function condicion(oferta: any): string {
  if (oferta.tipo === 'porcentaje_descuento') return `${oferta.valor ?? 0}% OFF`
  if (oferta.tipo === 'precio_fijo') return `precio especial $${oferta.valor ?? ''}`
  if (oferta.tipo === '2x1') return '2x1'
  if (oferta.tipo === 'nxm') return `${oferta.nx ?? 0}x${oferta.ny ?? 0}`
  if (oferta.tipo === 'segunda_unidad_pct') return `2ª unidad al ${oferta.valor ?? 0}%`
  return 'promo especial'
}

/** Copy sugerido por plantilla (rioplatense, apto redes). */
function copyPlantilla(oferta: any): string {
  const c = condicion(oferta)
  return `🔥 ${oferta.nombre}\n${c} en Social Ahorro.\n${oferta.fecha_fin ? `Hasta el ${oferta.fecha_fin}. ` : ''}Te esperamos 💚 #SocialAhorro #Ofertas`
}

/** Crea el brief si aún no existe uno para la oferta. Devuelve el token. */
export async function crearBriefOferta(adm: Adm, oferta: any, userId: string | null): Promise<string | null> {
  try {
    const { data: ya } = await adm.from('ofertas_briefs').select('token').eq('oferta_id', oferta.id).limit(1).maybeSingle()
    if (ya?.token) return ya.token
    const token = randomUUID().replace(/-/g, '')
    const { data } = await adm.from('ofertas_briefs').insert({ oferta_id: oferta.id, token, copy: copyPlantilla(oferta), estado: 'generado', generado_por: userId }).select('token').single()
    return data?.token ?? null
  } catch { return null }
}
