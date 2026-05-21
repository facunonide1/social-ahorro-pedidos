import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import type { TareaTriggerAuto, TriggerEvento } from '@/lib/types/tareas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cron hourly — evalúa triggers automáticos configurados en
 * tareas_triggers_auto y crea tareas cuando hay match.
 *
 * Eventos implementados (el resto queda como "checked pero sin generar"
 * hasta que se conecten al evento real):
 *   - factura_proxima_vencer
 *   - factura_vencida_sin_pagar
 *   - caja_no_cerrada_eod
 *   - stock_critico_detectado
 *   - lote_proximo_vencer
 *   - resto → noop
 *
 * Devuelve un resumen para diagnóstico.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req))
    return NextResponse.json({ error: 'sin_secret' }, { status: 401 })

  const sb = createAdminClient()

  const { data: triggers, error } = await sb
    .from('tareas_triggers_auto')
    .select('*')
    .eq('activo', true)
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ahora = new Date()
  let tareasCreadas = 0
  const detalles: Array<{ trigger: string; creadas: number }> = []

  for (const t of (triggers ?? []) as TareaTriggerAuto[]) {
    const candidatos = await detectarEventos(sb, t.evento as TriggerEvento, t.condiciones)
    let creadasParaEste = 0

    for (const c of candidatos) {
      // Dedup: no crear si ya hay una tarea de este tipo + esta entidad abierta.
      const { count } = await sb
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .eq('tipo_tarea_id', t.tipo_tarea_id)
        .eq('entidad_id', c.entidad_id)
        .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion'])
      if ((count ?? 0) > 0) continue

      const vencimiento = t.vencimiento_horas
        ? new Date(ahora.getTime() + t.vencimiento_horas * 36e5).toISOString()
        : null

      const responsableId = (t.asignacion_logic as any)?.responsable_id ?? null
      const rolDest = (t.asignacion_logic as any)?.rol_destinatario ?? null

      await sb.from('tareas').insert({
        tipo_tarea_id: t.tipo_tarea_id,
        tipo_origen: 'auto_sistema',
        titulo: c.titulo,
        descripcion: c.descripcion,
        prioridad: t.prioridad_override ?? 'media',
        estado: responsableId ? 'asignada' : 'pendiente',
        responsable_id: responsableId,
        rol_destinatario: rolDest,
        sucursal_id: c.sucursal_id ?? null,
        fecha_vencimiento: vencimiento,
        entidad_relacionada: c.entidad_tipo,
        entidad_id: c.entidad_id,
        entidad_url: c.entidad_url,
      })
      creadasParaEste++
    }

    if (creadasParaEste > 0) {
      await sb
        .from('tareas_triggers_auto')
        .update({
          ejecuciones_count: t.ejecuciones_count + creadasParaEste,
          ultima_ejecucion: ahora.toISOString(),
        })
        .eq('id', t.id)
    }
    tareasCreadas += creadasParaEste
    detalles.push({ trigger: t.nombre, creadas: creadasParaEste })
  }

  return NextResponse.json({
    ok: true,
    triggers_evaluados: triggers?.length ?? 0,
    tareas_creadas: tareasCreadas,
    detalles,
  })
}

type Candidato = {
  entidad_tipo: string
  entidad_id: string
  entidad_url: string | null
  titulo: string
  descripcion: string | null
  sucursal_id: string | null
}

async function detectarEventos(
  sb: ReturnType<typeof createAdminClient>,
  evento: TriggerEvento,
  condiciones: Record<string, unknown>,
): Promise<Candidato[]> {
  const hoy = new Date().toISOString().slice(0, 10)

  switch (evento) {
    case 'factura_proxima_vencer': {
      const dias = Number((condiciones as any)?.dias_previos ?? 3)
      const limite = new Date()
      limite.setDate(limite.getDate() + dias)
      const { data } = await sb
        .from('facturas_proveedor')
        .select('id, numero_factura, total, sucursal_id, proveedores(razon_social)')
        .lte('fecha_vencimiento', limite.toISOString().slice(0, 10))
        .gte('fecha_vencimiento', hoy)
        .not('estado', 'in', '("pagada","anulada","rechazada")')
        .limit(50)
      return (data ?? []).map((f: any) => ({
        entidad_tipo: 'factura',
        entidad_id: f.id,
        entidad_url: `/hub/facturas/${f.id}`,
        titulo: `Factura ${f.numero_factura} de ${pickOne<any>(f.proveedores)?.razon_social ?? ''} vence en ${dias}d`,
        descripcion: `Monto: $ ${Number(f.total ?? 0).toLocaleString('es-AR')}`,
        sucursal_id: f.sucursal_id,
      }))
    }
    case 'factura_vencida_sin_pagar': {
      const { data } = await sb
        .from('facturas_proveedor')
        .select('id, numero_factura, total, sucursal_id, proveedores(razon_social)')
        .lt('fecha_vencimiento', hoy)
        .not('estado', 'in', '("pagada","anulada","rechazada")')
        .limit(50)
      return (data ?? []).map((f: any) => ({
        entidad_tipo: 'factura',
        entidad_id: f.id,
        entidad_url: `/hub/facturas/${f.id}`,
        titulo: `Factura ${f.numero_factura} VENCIDA · ${pickOne<any>(f.proveedores)?.razon_social ?? ''}`,
        descripcion: `Monto: $ ${Number(f.total ?? 0).toLocaleString('es-AR')}`,
        sucursal_id: f.sucursal_id,
      }))
    }
    case 'caja_no_cerrada_eod': {
      // Cajas abiertas con fecha < hoy
      const { data } = await sb
        .from('cajas_diarias')
        .select('id, sucursal_id, fecha')
        .eq('estado', 'abierta')
        .lt('fecha', hoy)
        .limit(50)
      return (data ?? []).map((c: any) => ({
        entidad_tipo: 'caja',
        entidad_id: c.id,
        entidad_url: `/hub/sucursales/caja/${c.id}`,
        titulo: `Caja del ${c.fecha} quedó abierta`,
        descripcion: 'Cerrá la caja del día anterior con el arqueo correspondiente.',
        sucursal_id: c.sucursal_id,
      }))
    }
    case 'stock_critico_detectado': {
      // PostgREST no compara columna vs columna; traemos los que tienen
      // mínimo definido y filtramos en memoria.
      const { data } = await sb
        .from('stock_sucursal')
        .select(
          'id, producto_id, sucursal_id, cantidad_actual, stock_minimo, productos(nombre), sucursales(nombre)',
        )
        .gt('stock_minimo', 0)
        .limit(500)
      return (data ?? [])
        .filter(
          (s: any) => Number(s.cantidad_actual) <= Number(s.stock_minimo),
        )
        .map((s: any) => ({
          entidad_tipo: 'stock',
          entidad_id: s.id,
          entidad_url: `/hub/operaciones/stock/${s.producto_id}`,
          titulo: `Stock crítico: ${pickOne<any>(s.productos)?.nombre ?? 'producto'} en ${pickOne<any>(s.sucursales)?.nombre ?? 'sucursal'}`,
          descripcion: `Quedan ${Number(s.cantidad_actual).toLocaleString('es-AR')} (mínimo ${Number(s.stock_minimo).toLocaleString('es-AR')}). Reponer.`,
          sucursal_id: s.sucursal_id,
        }))
    }
    case 'lote_proximo_vencer': {
      const dias = Number((condiciones as any)?.dias_previos ?? 30)
      const limite = new Date()
      limite.setDate(limite.getDate() + dias)
      const { data } = await sb
        .from('lotes_productos')
        .select(
          'id, producto_id, sucursal_id, numero_lote, fecha_vencimiento, cantidad_actual, productos(nombre), sucursales(nombre)',
        )
        .lte('fecha_vencimiento', limite.toISOString().slice(0, 10))
        .gte('fecha_vencimiento', hoy)
        .gt('cantidad_actual', 0)
        .limit(200)
      return (data ?? []).map((l: any) => ({
        entidad_tipo: 'lote',
        entidad_id: l.id,
        entidad_url: '/hub/operaciones/vencimientos',
        titulo: `Lote ${l.numero_lote ?? ''} de ${pickOne<any>(l.productos)?.nombre ?? 'producto'} vence ${new Date(l.fecha_vencimiento).toLocaleDateString('es-AR')}`,
        descripcion: `${Number(l.cantidad_actual).toLocaleString('es-AR')} unidades en ${pickOne<any>(l.sucursales)?.nombre ?? 'sucursal'}.`,
        sucursal_id: l.sucursal_id,
      }))
    }
    default:
      // Eventos no implementados aún — no crean tareas pero no rompen.
      return []
  }
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}
