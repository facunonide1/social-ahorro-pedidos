/**
 * Herramientas de OFERTAS para NORA (tanda 2). N-04 ESTRICTO: crea la oferta en
 * borrador y la manda a aprobación (pendiente_aprobacion) — NUNCA la publica. La
 * aprobación (aprobarOferta) vive solo en la UI de aprobaciones.
 */
import type { Herramienta } from './tipos'
import { buscarProductos, parseFecha } from './_comun'

const ESTADOS_VIGENTES = ['activa', 'aprobada']

async function nombreProducto(adm: any, id: string): Promise<string> {
  const { data } = await adm.from('productos_catalogo').select('nombre').eq('id', id).maybeSingle()
  return data?.nombre ?? 'producto'
}

export const HERRAMIENTAS_OFERTAS: Herramienta[] = [
  {
    id: 'crear_oferta_borrador',
    nombre: 'Crear una oferta (borrador para aprobación)',
    descripcion: 'Arma una oferta de descuento porcentual sobre un producto. Queda en borrador y va a aprobación — NORA nunca la publica. Extraé producto, porcentaje y fechas si los mencionan.',
    subapp: 'ofertas',
    permiso: { modulo: 'ofertas', accion: 'crear' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto en oferta', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
      { nombre: 'porcentaje', tipo: 'numero', descripcion: 'Porcentaje de descuento (ej: 20)' },
      { nombre: 'desde', tipo: 'texto', descripcion: 'Fecha de inicio (dd/mm/aaaa)' },
      { nombre: 'hasta', tipo: 'texto', descripcion: 'Fecha de fin (dd/mm/aaaa)' },
    ],
    armarConfirmacion: async (adm, v) => ({
      titulo: 'Confirmá la oferta',
      campos: [
        { label: 'Producto', valor: await nombreProducto(adm, v.producto) },
        { label: 'Descuento', valor: `${Number(v.porcentaje) || 0}%` },
        { label: 'Vigencia', valor: `${parseFecha(v.desde) ?? '—'} → ${parseFecha(v.hasta) ?? '—'}` },
      ],
      advertencias: ['Queda en BORRADOR y va a aprobación: la aprueba un encargado general/dueño antes de publicarse. NORA no la publica.'],
    }),
    ejecutar: async (adm, v, ctx) => {
      const pct = Number(v.porcentaje)
      if (!(pct > 0 && pct < 100)) return { ok: false, texto: '', error: 'El porcentaje tiene que estar entre 1 y 99.' }
      const desde = parseFecha(v.desde), hasta = parseFecha(v.hasta)
      if (!desde || !hasta) return { ok: false, texto: '', error: 'Necesito fecha de inicio y de fin.' }
      const nombre = `${pct}% en ${await nombreProducto(adm, v.producto)}`
      const { data, error } = await adm.from('ofertas').insert({
        nombre, tipo: 'porcentaje_descuento', valor: pct, productos_ids: [v.producto], rubro: 'farmacia',
        canales: ['cartel'], vigencia_tipo: 'con_fecha', fecha_inicio: desde, fecha_fin: hasta,
        origen: 'liquidacion_propia', propuesta_por: 'nora', estado: 'borrador', created_by: ctx.userId,
      }).select('id, codigo').single()
      if (error || !data) return { ok: false, texto: '', error: error?.message ?? 'No se pudo crear la oferta.' }
      // Enviar a aprobación (flujo existente): borrador → pendiente_aprobacion.
      await adm.from('ofertas').update({ estado: 'pendiente_aprobacion', updated_at: new Date().toISOString() }).eq('id', data.id)
      return { ok: true, texto: `✓ Oferta ${data.codigo ?? ''} (${nombre}) creada y **enviada a aprobación**. Se publica recién cuando un encargado general/dueño la aprueba.`, entidad_id: data.id }
    },
  },
  {
    id: 'consultar_ofertas',
    nombre: 'Consultar ofertas',
    descripcion: 'Responde qué ofertas están activas o por vencer (opcionalmente de un producto). Solo lectura.',
    subapp: 'ofertas',
    soloLectura: true,
    permiso: { modulo: 'ofertas', accion: 'ver' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'Filtrar por producto (opcional)', requeridoSi: () => false, queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
    ],
    responder: async (adm, v) => {
      let q = adm.from('ofertas').select('codigo, nombre, estado, fecha_fin, productos_ids').in('estado', ESTADOS_VIGENTES).order('fecha_fin', { ascending: true, nullsFirst: false }).limit(40)
      if (v.producto) q = q.contains('productos_ids', [v.producto])
      const { data } = await q
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: 'No hay ofertas activas o programadas ahora mismo.' }
      const lista = rows.slice(0, 12).map((o) => `• ${o.nombre} (${o.estado})${o.fecha_fin ? ` — vence ${o.fecha_fin}` : ''}`).join('\n')
      return { texto: `${rows.length} oferta(s) vigente(s)/programada(s):\n${lista}\n\nVer todo → /admin/ofertas` }
    },
  },
  {
    id: 'consultar_calendario_comercial',
    nombre: 'Consultar el calendario comercial',
    descripcion: 'Responde qué ofertas rigen hoy o esta semana. Solo lectura.',
    subapp: 'ofertas',
    soloLectura: true,
    permiso: { modulo: 'ofertas', accion: 'ver' },
    slots: [],
    responder: async (adm, _v, ctx) => {
      const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10)
      const { data } = await adm.from('ofertas').select('nombre, estado, fecha_inicio, fecha_fin').in('estado', ESTADOS_VIGENTES).lte('fecha_inicio', hoy).limit(200)
      const rige = ((data ?? []) as any[]).filter((o) => !o.fecha_fin || o.fecha_fin >= hoy)
      if (!rige.length) return { texto: `Hoy (${hoy}) no hay ofertas rigiendo.` }
      const lista = rige.slice(0, 12).map((o) => `• ${o.nombre}${o.fecha_fin ? ` (hasta ${o.fecha_fin})` : ''}`).join('\n')
      return { texto: `Rigiendo hoy (${hoy}):\n${lista}\n\nCalendario → /admin/ofertas/calendario` }
    },
  },
]
