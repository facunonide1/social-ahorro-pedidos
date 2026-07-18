/**
 * Ciclo de cierre de ofertas (OS-6a · O-01) — el espejo de al-aprobar.
 * Al finalizar (auto por fecha_fin, manual o cancelación) dispara: descartelado
 * por sucursal participante, despublicación del cupón, export de reversión SIFACO
 * + tarea de reversión, aviso de remanente si era liquidación, y el hook de
 * métricas (stub — la medición real es OS-6b). Idempotente por estado.
 */
import { sucursalesDeOferta, filasSifaco } from './comun'
import { cerrarMetricasOferta } from './medir'

type Adm = any

function tareaCodigo(prefix: string) {
  return `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}`
}

export async function finalizarOferta(adm: Adm, ofertaId: string, opts: { userId: string | null; motivo?: string | null }) {
  const { data: oferta } = await adm.from('ofertas').select('*').eq('id', ofertaId).maybeSingle()
  if (!oferta) throw new Error('oferta inexistente')
  if (['finalizada', 'rechazada'].includes(oferta.estado)) return { ok: true, yaFinalizada: true }

  const canales: string[] = oferta.canales ?? []
  const sucIds = await sucursalesDeOferta(adm, oferta)
  const { data: sucs } = await adm.from('sucursales').select('id, nombre').in('id', sucIds.length ? sucIds : ['00000000-0000-0000-0000-000000000000'])

  // 1) Descartelado por sucursal participante (si tenía cartel) — evidencia foto.
  let descarteladoTareas = 0
  if (canales.includes('cartel')) {
    const tareas = ((sucs ?? []) as any[]).map((s, i) => ({
      codigo: tareaCodigo(`OFD${i}`), tipo_origen: 'auto_sistema', titulo: `Sacar cartel: ${oferta.nombre}`,
      descripcion: `La oferta terminó. Retirá el cartel en ${s.nombre} (sacá foto como evidencia).`,
      prioridad: 'media', estado: 'pendiente', asignacion_tipo: 'pool_sucursal', sucursal_id: s.id,
      verificacion_humana: true, datos_custom: { oferta_id: oferta.id, tipo: 'descartelado' },
    }))
    if (tareas.length) { const { error } = await adm.from('tareas').insert(tareas); if (!error) descarteladoTareas = tareas.length }
  }

  // 2) Despublicar el cupón (best-effort, no rompe si la tabla externa falla).
  let cuponDespublicado = false
  const offersId = oferta.cuponera_ref?.offers_id
  if (offersId) {
    try { await adm.from('offers').update({ status: 'expired' }).eq('id', offersId); cuponDespublicado = true } catch { cuponDespublicado = false }
  }

  // 3) Export de reversión SIFACO + tarea "Revertir precios en SIFACO".
  let exportId: string | null = null
  try {
    const filas = await filasSifaco(adm, oferta, 'reversion')
    const { data: exp } = await adm.from('ofertas_exports_sifaco').insert({
      tipo: 'reversion', oferta_id: oferta.id, fecha: oferta.fecha_fin, filas, estado: 'generado', generado_por: opts.userId,
    }).select('id').single()
    exportId = exp?.id ?? null
    if (exportId) {
      await adm.from('tareas').insert({
        codigo: tareaCodigo('OFR'), tipo_origen: 'auto_sistema', titulo: `Revertir precios en SIFACO: ${oferta.nombre}`,
        descripcion: `La oferta terminó. Aplicá el archivo de reversión (precios base) en SIFACO.`,
        prioridad: 'alta', estado: 'pendiente', asignacion_tipo: 'usuario_especifico', responsable_id: opts.userId,
        verificacion_humana: false, entidad_relacionada: 'export_sifaco', entidad_id: exportId,
        entidad_url: `/admin/ofertas/exports/${exportId}`, datos_custom: { oferta_id: oferta.id, tipo: 'reversion_sifaco' },
      })
    }
  } catch { /* reversión best-effort */ }

  // 4) Estado + hook de métricas.
  await adm.from('ofertas').update({
    estado: 'finalizada', finalizada_at: new Date().toISOString(),
    cancelacion_motivo: opts.motivo ?? null, updated_at: new Date().toISOString(),
  }).eq('id', oferta.id)
  await cerrarMetricasOferta(adm, oferta)

  // 5) Liquidación con remanente → aviso a Vencimientos / franja NORA.
  try {
    const esLiquidacion = oferta.origen === 'liquidacion_propia' || oferta.origen_ref?.motivo === 'por_vencer'
    if (esLiquidacion) {
      const { data: items } = await adm.from('oferta_items').select('producto_id').eq('oferta_id', oferta.id)
      const pids = ((items ?? []) as any[]).map((i) => i.producto_id).filter(Boolean)
      if (pids.length) {
        const { data: stock } = await adm.from('stock_items').select('producto_id, cantidad_gondola, cantidad_deposito').in('producto_id', pids)
        const rem = ((stock ?? []) as any[]).reduce((a, s) => a + Number(s.cantidad_gondola ?? 0) + Number(s.cantidad_deposito ?? 0), 0)
        if (rem > 0) {
          await adm.from('nora_avisos').insert({
            tipo: 'stock_dormido', severidad: 'alerta', estado: 'pendiente', modulo: 'ofertas',
            titulo: `Quedaron ${rem} u. de "${oferta.nombre}"`,
            detalle: `La liquidación terminó con ${rem} unidades en stock. ¿Extender con más descuento?`,
            accion_label: 'Ver oferta', accion_href: `/admin/ofertas/${oferta.id}`,
            entidad_ref: { tabla: 'ofertas', id: oferta.id }, clave_dedup: `oferta_remanente_${oferta.id}`,
          })
        }
      }
    }
  } catch { /* aviso best-effort */ }

  return { ok: true, descartelado: descarteladoTareas, cupon_despublicado: cuponDespublicado, export_reversion: exportId }
}

/** Lazy-check Hobby-safe: finaliza las ofertas vivas cuya fecha_fin ya pasó. */
export async function finalizarVencidas(adm: Adm, userId: string | null): Promise<number> {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data } = await adm.from('ofertas')
    .select('id').eq('vigencia_tipo', 'con_fecha').lt('fecha_fin', hoy)
    .in('estado', ['activa', 'aprobada', 'pausada']).limit(100)
  let n = 0
  for (const o of (data ?? []) as any[]) { try { await finalizarOferta(adm, o.id, { userId }); n++ } catch { /* sigue */ } }
  return n
}
