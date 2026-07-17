/**
 * Herramientas TRANSVERSALES de MISSION CONTROL para NORA (tanda 3, SOLO
 * LECTURA). resumen_del_dia y lo_urgente responden on-demand lo mismo que el
 * saludo y la tira "Lo urgente" del hub, con los mismos gates de permiso.
 */
import { puede } from '@/lib/types/permisos'
import type { Herramienta, NoraCtx } from './tipos'
import { money } from './_comun'

const ACTIVOS = ['pendiente', 'asignada', 'reclamada', 'en_progreso']
const DOC_PEND = ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida']

async function cuenta(q: any): Promise<number> {
  const { count } = await q
  return count ?? 0
}
function ve(ctx: NoraCtx, modulo: any): boolean {
  return ctx.rol === 'super_admin' || puede(ctx.rol, ctx.permisosCustom, modulo, 'ver')
}

export const HERRAMIENTAS_MISSION_CONTROL: Herramienta[] = [
  {
    id: 'resumen_del_dia',
    nombre: 'Resumen del día',
    descripcion: 'Responde cómo viene el día: ventas, tickets, tareas vencidas y lo que hay que pagar. Solo lectura.',
    subapp: 'mission_control',
    soloLectura: true,
    permiso: { modulo: 'mission_control', accion: 'ver' },
    slots: [],
    responder: async (adm, _v, ctx) => {
      const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10)
      const en7 = new Date(Date.parse(`${hoy}T00:00:00-03:00`) + 7 * 86_400_000).toISOString().slice(0, 10)
      const ahora = new Date().toISOString()
      const [ventas, vencidas, docs7, faltantes] = await Promise.all([
        adm.from('orders').select('total').gte('created_at', `${hoy}T00:00:00-03:00`).neq('status', 'cancelado').limit(1000),
        cuenta(adm.from('tareas').select('id', { count: 'exact', head: true }).lt('fecha_vencimiento', ahora).in('estado', ACTIVOS)),
        cuenta(adm.from('facturas_proveedor').select('id', { count: 'exact', head: true }).lte('fecha_vencimiento', en7).in('estado', DOC_PEND)),
        cuenta(adm.from('avisos_faltante').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo')),
      ])
      const rows = (ventas as any).data ?? []
      const total = rows.reduce((a: number, r: any) => a + Number(r.total ?? 0), 0)
      const partes = [
        `Ventas de hoy: ${money(total)} en ${rows.length} ticket(s)`,
        ve(ctx, 'tareas') ? `Tareas vencidas: ${vencidas}` : null,
        ve(ctx, 'finanzas') ? `A pagar en 7 días: ${docs7} documento(s)` : null,
        ve(ctx, 'compras') ? `Faltantes nuevos: ${faltantes}` : null,
      ].filter(Boolean)
      return { texto: `Cómo venimos hoy (${hoy}):\n${partes.map((p) => `• ${p}`).join('\n')}` }
    },
  },
  {
    id: 'lo_urgente',
    nombre: 'Lo urgente',
    descripcion: 'Responde la lista transversal priorizada de lo que necesita atención ahora. Solo lectura.',
    subapp: 'mission_control',
    soloLectura: true,
    permiso: { modulo: 'mission_control', accion: 'ver' },
    slots: [],
    responder: async (adm, _v, ctx) => {
      const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10)
      const en30 = new Date(Date.parse(`${hoy}T00:00:00-03:00`) + 30 * 86_400_000).toISOString().slice(0, 10)
      const ahora = new Date().toISOString()
      const items: string[] = []
      if (ve(ctx, 'tareas')) {
        const n = await cuenta(adm.from('tareas').select('id', { count: 'exact', head: true }).lt('fecha_vencimiento', ahora).in('estado', ACTIVOS))
        if (n) items.push(`🔴 ${n} tarea(s) vencida(s) → /admin/tareas`)
      }
      if (ve(ctx, 'finanzas')) {
        const n = await cuenta(adm.from('facturas_proveedor').select('id', { count: 'exact', head: true }).lt('fecha_vencimiento', hoy).in('estado', DOC_PEND))
        if (n) items.push(`🔴 ${n} documento(s) a pagar vencido(s) → /admin/finanzas/documentos`)
      }
      if (ve(ctx, 'operaciones')) {
        const n = await cuenta(adm.from('vencimientos').select('id', { count: 'exact', head: true }).eq('estado', 'vigente').lte('fecha_vencimiento', en30))
        if (n) items.push(`🟠 ${n} vencimiento(s) en 30 días → /admin/operaciones/vencimientos`)
      }
      if (ve(ctx, 'compras')) {
        const n = await cuenta(adm.from('avisos_faltante').select('id', { count: 'exact', head: true }).eq('estado', 'nuevo'))
        if (n) items.push(`🟠 ${n} faltante(s) nuevo(s) → /admin/compras/faltantes`)
      }
      if (!items.length) return { texto: 'No hay nada urgente ahora mismo. 👌' }
      return { texto: `Lo urgente:\n${items.join('\n')}` }
    },
  },
]
