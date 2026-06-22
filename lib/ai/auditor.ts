/**
 * Auditor proactivo de NORA (v0.30). Revisa el negocio y emite avisos al feed
 * (nora_avisos) para el dueño: caja que no cuadra, VIP inactivo, stock por
 * agotarse, oferta por vencer, documento por pagar, stock dormido, ventas sin
 * cargar. Lo corre el cron diario + el botón "Revisar ahora". Dedup por clave
 * (no repite el mismo aviso si ya está pendiente).
 */
import { emitirAviso } from '@/lib/ai/nora'
import { getRecomendaciones } from '@/lib/compras/recomendaciones'

type Adm = any
const hoy = () => new Date().toISOString().slice(0, 10)
const isoMenos = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

export async function correrAuditor(adm: Adm): Promise<{ avisos: number }> {
  let n = 0
  const inc = () => { n++ }

  // 1) Caja que no cuadra (arqueos observados recientes)
  try {
    const { data } = await adm.from('arqueos_caja').select('id, fecha, diferencia_cierre, sucursal_id, cajero_nombre, es_demo')
      .neq('diferencia_cierre', 0).gte('fecha', isoMenos(7)).limit(20)
    for (const a of (data ?? []) as any[]) {
      await emitirAviso(adm, {
        tipo: 'caja_descuadre', severidad: 'alerta', modulo: 'caja', sucursalId: a.sucursal_id,
        titulo: `Caja descuadrada el ${a.fecha}`,
        detalle: `${a.cajero_nombre ?? 'Un cajero'} cerró con una diferencia de $${Math.round(Math.abs(a.diferencia_cierre)).toLocaleString('es-AR')}. Revisá la captura y cruzá con las ventas.`,
        accionLabel: 'Ver histórico de caja', accionHref: '/admin/finanzas/caja/historico',
        entidadRef: { tabla: 'arqueos_caja', id: a.id }, claveDedup: `caja_descuadre:${a.id}`, esDemo: a.es_demo,
      }); inc()
    }
  } catch { /* */ }

  // 2) Cliente VIP que dejó de venir
  try {
    const { data } = await adm.from('clientes').select('id, nombre, total_gastado_12m, ultima_compra, riesgo_churn, es_demo')
      .eq('activo', true).neq('riesgo_churn', 'bajo').gte('total_gastado_12m', 50000)
      .order('total_gastado_12m', { ascending: false }).limit(10)
    for (const c of (data ?? []) as any[]) {
      await emitirAviso(adm, {
        tipo: 'cliente_vip_inactivo', severidad: 'sugerencia', modulo: 'clientes',
        titulo: `${c.nombre} (VIP) está en riesgo`,
        detalle: `Gastó $${Math.round(c.total_gastado_12m).toLocaleString('es-AR')} en 12 meses y no compra desde ${c.ultima_compra ?? 'hace tiempo'}. Mandale un cupón.`,
        accionLabel: 'Enviar cupón', accionHref: `/admin/clientes/comunicacion?cliente=${c.id}&cupon=1`,
        entidadRef: { tabla: 'clientes', id: c.id }, claveDedup: `vip_inactivo:${c.id}`, esDemo: c.es_demo,
      }); inc()
    }
  } catch { /* */ }

  // 3) Compras: quiebres inminentes + dinero dormido (consolidado)
  try {
    const r = await getRecomendaciones(adm, { sucursalId: null, esTodas: true, dias: 14 })
    if (r.resumen.hayVentas) {
      for (const q of r.quiebres.slice(0, 8)) {
        await emitirAviso(adm, {
          tipo: 'stock_por_agotarse', severidad: 'alerta', modulo: 'compras',
          titulo: `${q.nombre} se agota en ${q.cobertura_dias ?? 0} días`,
          detalle: `Vendés ${q.velocidad}/día y el stock alcanza para poco. Sugerido comprar ${q.sugerido}.`,
          accionLabel: 'Ver qué comprar', accionHref: '/admin/compras/recomendaciones',
          entidadRef: { tabla: 'productos_catalogo', id: q.producto_id }, claveDedup: `quiebre:${q.producto_id}`,
        }); inc()
      }
      if (r.resumen.plataDormida > 0) {
        await emitirAviso(adm, {
          tipo: 'stock_dormido', severidad: 'sugerencia', modulo: 'compras',
          titulo: `Tenés $${Math.round(r.resumen.plataDormida).toLocaleString('es-AR')} en stock dormido`,
          detalle: `${r.resumen.nDormido} productos con stock que no se venden. Conviene liquidarlos con una oferta o no recomprarlos.`,
          accionLabel: 'Ver dinero dormido', accionHref: '/admin/compras/recomendaciones',
          claveDedup: `dormido:${hoy()}`,
        }); inc()
      }
    }
  } catch { /* */ }

  // 4) Ofertas por vencer
  try {
    const { data } = await adm.from('ofertas').select('id, nombre, fecha_fin, estado, es_demo')
      .eq('estado', 'activa').not('fecha_fin', 'is', null).lte('fecha_fin', isoMenos(-3)).gte('fecha_fin', hoy()).limit(10)
    for (const o of (data ?? []) as any[]) {
      await emitirAviso(adm, {
        tipo: 'oferta_por_vencer', severidad: 'info', modulo: 'ofertas',
        titulo: `La oferta "${o.nombre}" vence el ${o.fecha_fin}`,
        accionLabel: 'Ver ofertas', accionHref: '/admin/ofertas',
        entidadRef: { tabla: 'ofertas', id: o.id }, claveDedup: `oferta_vence:${o.id}`, esDemo: o.es_demo,
      }); inc()
    }
  } catch { /* */ }

  // 5) Documentos por pagar (vencidos / esta semana)
  try {
    const { data } = await adm.from('facturas_proveedor').select('id, total, fecha_vencimiento, estado, es_demo')
      .in('estado', ['pendiente', 'aprobada', 'programada_pago', 'vencida']).not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', isoMenos(-7)).limit(50)
    const venc = (data ?? []) as any[]
    if (venc.length) {
      const total = venc.reduce((a, f) => a + Number(f.total ?? 0), 0)
      await emitirAviso(adm, {
        tipo: 'documento_por_pagar', severidad: 'alerta', modulo: 'finanzas',
        titulo: `${venc.length} documentos por pagar esta semana`,
        detalle: `Suman $${Math.round(total).toLocaleString('es-AR')}. Revisá el calendario de pagos.`,
        accionLabel: 'Ver pagos', accionHref: '/admin/finanzas/calendario',
        claveDedup: `docs_pagar:${hoy()}`, esDemo: venc.some((f) => f.es_demo),
      }); inc()
    }
  } catch { /* */ }

  // 6) Ventas del día sin cargar (Centro de Datos)
  try {
    const { count } = await adm.from('ventas_diarias').select('id', { count: 'exact', head: true }).eq('fecha', hoy())
    if (!count) {
      await emitirAviso(adm, {
        tipo: 'datos_sin_actualizar', severidad: 'info', modulo: 'centro_datos',
        titulo: 'No cargaste las ventas de hoy',
        detalle: 'Cargá el archivo de ventas del día en el Centro de Datos para que las recomendaciones y el control estén al día.',
        accionLabel: 'Cargar ventas', accionHref: '/admin/centro-datos/ventas-diarias',
        claveDedup: `ventas_sin_cargar:${hoy()}`,
      }); inc()
    }
  } catch { /* */ }

  return { avisos: n }
}
