/**
 * Motor de aprobación de ofertas (módulo Ofertas · T3).
 *
 * Al aprobarse una oferta dispara TODO: tareas (cartel + góndola por sucursal +
 * publicar cuponera), publicación a canales, notificación + confirmaciones de
 * lectura del equipo, y pasa la oferta a activa/aprobada. Nada se dispara antes
 * de la aprobación. Idempotente por estado (no re-dispara si ya está activa).
 */
import { sucursalesDeOferta } from './comun'

type Adm = any

function tareaCodigo(prefix: string) {
  // sin colisión: OFE + timestamp base36 + random-ish por índice
  return `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}`
}

export async function aprobarOferta(adm: Adm, ofertaId: string, aprobadorId: string) {
  const { data: oferta } = await adm.from('ofertas').select('*').eq('id', ofertaId).maybeSingle()
  if (!oferta) throw new Error('oferta inexistente')
  if (!['borrador', 'pendiente_aprobacion', 'pausada', 'rechazada'].includes(oferta.estado)) {
    return { ok: true, yaActiva: true }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const canales: string[] = oferta.canales ?? []
  // Solo las sucursales participantes (O-03); si no declara, todas las activas.
  const sucIds = await sucursalesDeOferta(adm, oferta)
  const [{ data: sucs }, { data: empleados }] = await Promise.all([
    adm.from('sucursales').select('id, nombre').in('id', sucIds.length ? sucIds : ['00000000-0000-0000-0000-000000000000']),
    adm.from('users_admin').select('id').eq('activo', true),
  ])

  // 1) Tareas automáticas (reusa módulo de tareas)
  const tareas: any[] = []
  let i = 0
  for (const s of (sucs ?? []) as any[]) {
    if (canales.includes('cartel')) {
      tareas.push({
        codigo: tareaCodigo(`OFE${i++}`), tipo_origen: 'auto_sistema', titulo: `Poner cartel: ${oferta.nombre}`,
        descripcion: `Colocar el cartel de la oferta en ${s.nombre} (sacá foto como evidencia).`,
        prioridad: 'alta', estado: 'pendiente', asignacion_tipo: 'pool_sucursal', sucursal_id: s.id,
        verificacion_humana: true, datos_custom: { oferta_id: oferta.id, tipo: 'cartel' },
      })
    }
    tareas.push({
      codigo: tareaCodigo(`OFG${i++}`), tipo_origen: 'auto_sistema', titulo: `Asegurar stock en góndola: ${oferta.nombre}`,
      descripcion: `Verificá que haya stock en góndola de los productos de la oferta en ${s.nombre}.`,
      prioridad: 'media', estado: 'pendiente', asignacion_tipo: 'pool_sucursal', sucursal_id: s.id,
      verificacion_humana: false, datos_custom: { oferta_id: oferta.id, tipo: 'stock_gondola' },
    })
  }
  if (canales.includes('cuponera') || canales.includes('web')) {
    tareas.push({
      codigo: tareaCodigo('OFP'), tipo_origen: 'auto_sistema', titulo: `Publicar oferta: ${oferta.nombre}`,
      descripcion: `Publicar la oferta en ${canales.filter((c) => c !== 'cartel').join(', ')}.`,
      prioridad: 'media', estado: 'pendiente', asignacion_tipo: 'usuario_especifico', responsable_id: aprobadorId,
      verificacion_humana: false, datos_custom: { oferta_id: oferta.id, tipo: 'publicar' },
    })
  }
  let tareasCreadas = 0
  if (tareas.length) {
    const { error } = await adm.from('tareas').insert(tareas)
    if (!error) tareasCreadas = tareas.length
  }

  // 2) Publicar a cuponera (best-effort, no rompe el flujo)
  let cuponeraRef: any = null
  if (canales.includes('cuponera')) {
    try {
      const discountType = oferta.tipo === 'porcentaje_descuento' ? 'percentage' : oferta.tipo === 'precio_fijo' ? 'fixed' : 'promo'
      const { data: off } = await adm.from('offers').insert({
        name: oferta.nombre,
        description: oferta.justificacion ?? null,
        discount_type: discountType,
        discount_value: oferta.valor ?? null,
        starts_at: oferta.fecha_inicio ? `${oferta.fecha_inicio}T00:00:00-03:00` : new Date().toISOString(),
        expires_at: oferta.fecha_fin ? `${oferta.fecha_fin}T23:59:59-03:00` : null,
        status: 'active',
        promotion_type: oferta.tipo,
        created_by: aprobadorId,
      }).select('id').single()
      if (off) cuponeraRef = { offers_id: off.id, publicado_at: new Date().toISOString() }
    } catch { cuponeraRef = { pendiente: true, motivo: 'No se pudo insertar en cuponera (formato/estado).' } }
  }

  // 3) Confirmaciones de lectura pendientes (una por empleado, versión actual)
  if (empleados?.length) {
    const rows = (empleados as any[]).map((e) => ({ oferta_id: oferta.id, empleado_user_id: e.id, version_confirmada: 0, es_demo: oferta.es_demo }))
    // version_confirmada 0 = pendiente; al confirmar se setea a oferta.version
    await adm.from('ofertas_confirmaciones').upsert(rows, { onConflict: 'oferta_id,empleado_user_id', ignoreDuplicates: true })
    await adm.from('notificaciones_admin').insert((empleados as any[]).map((e) => ({
      user_id: e.id, tipo: 'info', prioridad: 'media', titulo: `Nueva oferta: ${oferta.nombre}`,
      mensaje: 'Confirmá que la viste para poder ofrecerla.', url_accion: '/admin/ofertas/panel',
    })))
  }

  // 4) snapshot v1 + snapshot de precio base al aprobar (candado 2) + estado
  await adm.from('ofertas_versiones').insert({ oferta_id: oferta.id, version: oferta.version ?? 1, snapshot: oferta, cambiado_por: aprobadorId })
  let preciosBase: Record<string, number> = {}
  try {
    const { data: its } = await adm.from('oferta_items').select('producto_id').eq('oferta_id', oferta.id)
    const pids = ((its ?? []) as any[]).map((i) => i.producto_id).filter(Boolean)
    if (pids.length) {
      const { data: prods } = await adm.from('productos_catalogo').select('id, precio_sugerido').in('id', pids)
      for (const p of (prods ?? []) as any[]) if (p.precio_sugerido != null) preciosBase[p.id] = Number(p.precio_sugerido)
    }
  } catch { preciosBase = {} }
  const futura = oferta.vigencia_tipo === 'con_fecha' && oferta.fecha_inicio && oferta.fecha_inicio > hoy
  await adm.from('ofertas').update({
    estado: futura ? 'aprobada' : 'activa', aprobada_por: aprobadorId, aprobada_at: new Date().toISOString(),
    publicada_cuponera: !!cuponeraRef && !cuponeraRef.pendiente, cuponera_ref: cuponeraRef,
    precios_base_aprob: preciosBase, updated_at: new Date().toISOString(),
  }).eq('id', oferta.id)

  return { ok: true, tareas: tareasCreadas, confirmaciones: empleados?.length ?? 0, cuponera: cuponeraRef }
}
