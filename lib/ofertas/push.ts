/**
 * Push real a clientes del Club al publicar una oferta en cuponera (OS-6b · O-06).
 * Reusa el sink del Club (tabla notifications) que usa el motor de campañas del
 * CRM. Si algo falta, degrada con estado visible (push_ref.pendiente) — no falla
 * silencioso.
 */
type Adm = any

function condicionTexto(oferta: any): string {
  if (oferta.tipo === 'porcentaje_descuento') return `${oferta.valor ?? 0}% de descuento`
  if (oferta.tipo === 'precio_fijo') return `precio especial`
  if (oferta.tipo === '2x1') return '2x1'
  if (oferta.tipo === 'nxm') return `${oferta.nx ?? 0}x${oferta.ny ?? 0}`
  if (oferta.tipo === 'segunda_unidad_pct') return `2ª unidad al ${oferta.valor ?? 0}%`
  return 'oferta especial'
}

export async function enviarPushOferta(adm: Adm, oferta: any): Promise<any> {
  try {
    // Destinatarios: miembros del Club (clientes con cuponera_user_id).
    const { count } = await adm.from('clientes').select('id', { count: 'exact', head: true }).not('cuponera_user_id', 'is', null)
    const destinatarios = count ?? 0
    const { error } = await adm.from('notifications').insert({
      title: `Nueva oferta: ${oferta.nombre}`,
      body: `${condicionTexto(oferta)}. ¡Aprovechá en Social Ahorro!`,
      type: 'campaign',
      related_coupon_id: oferta.cuponera_ref?.offers_id ?? null,
      sent_at: new Date().toISOString(),
      sent_count: destinatarios,
    })
    if (error) return { pendiente: true, motivo: error.message, at: new Date().toISOString() }
    return { enviados: destinatarios, at: new Date().toISOString() }
  } catch (e: any) {
    return { pendiente: true, motivo: e?.message ?? 'push no disponible', at: new Date().toISOString() }
  }
}
