/**
 * Herramientas de PEDIDOS para NORA (tanda 2, SOLO LECTURA). Reusan la tabla
 * `orders` y los umbrales de demora de lib/orders/timing. Crear/editar pedidos NO
 * es de este motor (feature propio del módulo Pedidos — backlog F19).
 */
import { relativeFrom } from '@/lib/orders/timing'
import type { OrderStatus } from '@/lib/types'
import type { Herramienta } from './tipos'
import { money } from './_comun'

const ESTADO_LABEL: Record<string, string> = {
  nuevo: 'nuevo', confirmado: 'confirmado', en_preparacion: 'en preparación', listo: 'listo',
  en_camino: 'en camino', entregado: 'entregado', cancelado: 'cancelado',
}
const ABIERTOS: OrderStatus[] = ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'en_camino']

export const HERRAMIENTAS_PEDIDOS: Herramienta[] = [
  {
    id: 'consultar_pedido',
    nombre: 'Consultar un pedido',
    descripcion: 'Responde el estado, repartidor y tiempos de un pedido, por código (SA-XXXX) o nombre del cliente. Solo lectura.',
    subapp: 'pedidos',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'pedidos', accion: 'ver' },
    slots: [
      { nombre: 'pedido', tipo: 'opcion', descripcion: 'Código SA-XXXX o nombre del cliente', queryOpciones: async (adm, v) => {
        const t = String(v.pedido ?? '').trim()
        if (t.length < 2) return []
        const like = `%${t.replace(/[%,]/g, ' ')}%`
        const { data } = await adm.from('orders').select('id, codigo, customer_name, status').or(`codigo.ilike.${like},customer_name.ilike.${like}`).order('created_at', { ascending: false }).limit(12)
        return ((data ?? []) as any[]).map((o) => ({ valor: o.id, label: o.codigo, sub: `${o.customer_name ?? ''} · ${ESTADO_LABEL[o.status] ?? o.status}` }))
      } },
    ],
    responder: async (adm, v) => {
      const { data: o } = await adm.from('orders').select('codigo, customer_name, status, total, created_at, assigned:assigned_to(name)').eq('id', v.pedido).maybeSingle()
      if (!o) return { texto: 'No encontré ese pedido.' }
      const t = relativeFrom(o.created_at, o.status as OrderStatus)
      const rep = (o.assigned as any)?.name
      return { texto: `**${o.codigo}** — ${ESTADO_LABEL[o.status] ?? o.status}\nCliente: ${o.customer_name ?? '—'} · ${money(o.total ?? 0)}${rep ? `\nRepartidor: ${rep}` : ''}\n${t.text}${t.severity === 'critical' ? ' ⚠️ demorado' : ''}` }
    },
  },
  {
    id: 'pedidos_del_dia',
    nombre: 'Pedidos del día',
    descripcion: 'Responde cuántos pedidos hay hoy por estado y cuántos están demorados. Solo lectura.',
    subapp: 'pedidos',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'pedidos', accion: 'ver' },
    slots: [],
    responder: async (adm, _v, ctx) => {
      const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10)
      const { data } = await adm.from('orders').select('status, created_at').gte('created_at', `${hoy}T00:00:00-03:00`).limit(500)
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: `No hay pedidos cargados hoy (${hoy}).` }
      const porEstado = new Map<string, number>()
      let demorados = 0
      for (const r of rows) {
        porEstado.set(r.status, (porEstado.get(r.status) ?? 0) + 1)
        if (ABIERTOS.includes(r.status) && relativeFrom(r.created_at, r.status as OrderStatus).severity === 'critical') demorados++
      }
      const lista = [...porEstado.entries()].map(([e, n]) => `• ${ESTADO_LABEL[e] ?? e}: ${n}`).join('\n')
      return { texto: `Hoy (${hoy}) hay ${rows.length} pedido(s):\n${lista}${demorados ? `\n\n⚠️ ${demorados} demorado(s).` : ''}` }
    },
  },
]
