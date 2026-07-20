/**
 * RADAR · Demanda invisible — herramienta conversacional GLOBAL (todos los roles,
 * todas las sub-apps). "me pidieron ibuprofeno infantil y no había" → registro con
 * card mínima. Si el pedido matchea un único producto se linkea; si no, texto libre.
 */
import type { Herramienta } from './tipos'
import { buscarProductos } from './_comun'

export const HERRAMIENTAS_DEMANDA: Herramienta[] = [
  {
    id: 'registrar_demanda',
    nombre: 'Anotar un pedido que no había',
    descripcion: 'Registra en el Radar de demanda algo que un cliente pidió y no había (venta perdida). Extraé qué pidió el cliente.',
    global: true,
    permiso: null,
    slots: [
      { nombre: 'pedido', tipo: 'texto', descripcion: 'Qué pidió el cliente que no había (ej: "ibuprofeno infantil")' },
    ],
    armarConfirmacion: async (adm, v) => {
      const matches = await buscarProductos(adm, v.pedido)
      const link = matches.length === 1 ? matches[0] : null
      return {
        titulo: 'Anotar en el Radar de demanda',
        campos: [
          { label: 'Pedido', valor: String(v.pedido ?? '—') },
          { label: 'Catálogo', valor: link ? `matchea ${link.label}` : 'no lo trabajamos (texto libre)' },
        ],
        advertencias: [],
      }
    },
    ejecutar: async (adm, v, ctx) => {
      const texto = String(v.pedido ?? '').trim()
      if (!texto) return { ok: false, texto: '', error: '¿Qué te pidieron?' }
      const matches = await buscarProductos(adm, texto)
      const productoId = matches.length === 1 ? matches[0].valor : null
      const { data, error } = await adm.from('demanda_invisible').insert({
        texto_pedido: texto.slice(0, 200), producto_id: productoId,
        sucursal_id: ctx.esTodas ? null : ctx.sucursalId, registrado_por: ctx.userId,
      }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Anotado en el Radar: "${texto}"${productoId ? ' (linkeado al producto)' : ' (no lo trabajamos)'}.`, entidad_id: data?.id }
    },
  },
]
