import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { coberturaSemana, lunesDe } from '@/lib/personas/cobertura'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ENCARGADO: AdminRole[] = ['super_admin', 'gerente', 'administrativo', 'encargado_sucursal', 'rrhh', 'sucursal']
const TIPOS = ['vacaciones', 'enfermedad', 'licencia', 'falta']

/**
 * OS-5a · Ausencias con workflow. solicitar = cualquier admin activo. resolver
 * (aprobar/rechazar) = encargado+. Al aprobar una ausencia que pisa turnos de un
 * farmacéutico, la cobertura se recalcula (excluye esos turnos) y si la sucursal
 * queda sobre el umbral se dispara la alerta (nora_avisos + Lo urgente).
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion ?? 'solicitar'

  if (accion === 'solicitar') {
    if (!b?.empleado_id || !b?.fecha_desde) return NextResponse.json({ error: 'empleado y fecha requeridos' }, { status: 400 })
    const tipo = TIPOS.includes(b?.tipo) ? b.tipo : 'licencia'
    const { data, error } = await adm.from('empleado_ausencias').insert({
      empleado_id: b.empleado_id, tipo, fecha_desde: b.fecha_desde, fecha_hasta: b.fecha_hasta ?? b.fecha_desde,
      observaciones: b?.observaciones ?? null, estado: 'solicitada',
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data.id, estado: 'solicitada' })
  }

  // resolver = encargado+
  if (accion === 'resolver') {
    if (!ENCARGADO.includes(me.rol)) return NextResponse.json({ error: 'solo un encargado puede aprobar/rechazar' }, { status: 403 })
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const nuevo = b?.aprobar ? 'aprobada' : 'rechazada'
    const { data: aus } = await adm.from('empleado_ausencias').select('id, empleado_id, fecha_desde').eq('id', b.id).maybeSingle()
    if (!aus) return NextResponse.json({ error: 'ausencia inexistente' }, { status: 404 })
    await adm.from('empleado_ausencias').update({ estado: nuevo, aprobado_por: user.id, aprobado_at: new Date().toISOString() }).eq('id', b.id)

    if (nuevo === 'aprobada') {
      try {
        const { data: emp } = await adm.from('empleados').select('sucursal_id, es_farmaceutico').eq('id', aus.empleado_id).maybeSingle()
        if (emp?.sucursal_id && emp?.es_farmaceutico) {
          const week = lunesDe(aus.fecha_desde)
          const cob = await coberturaSemana(adm, emp.sucursal_id, week)
          if (cob.horasDescubiertas > cob.umbral) {
            const { data: s } = await adm.from('sucursales').select('nombre').eq('id', emp.sucursal_id).maybeSingle()
            await adm.from('nora_avisos').insert({
              tipo: 'sugerencia_general', severidad: 'alerta', estado: 'pendiente', modulo: 'rrhh',
              titulo: `Cobertura farmacéutica en riesgo — ${s?.nombre ?? 'sucursal'}`,
              detalle: `Con la ausencia aprobada quedan ${cob.horasDescubiertas}h sin farmacéutico esta semana (umbral ${cob.umbral}h).`,
              accion_label: 'Ver grilla', accion_href: `/admin/rrhh/grilla?suc=${emp.sucursal_id}&w=${week}`,
              entidad_ref: { tabla: 'sucursales', id: emp.sucursal_id }, clave_dedup: `cobertura_${emp.sucursal_id}_${week}`,
            })
          }
        }
      } catch { /* alerta best-effort */ }
    }
    return NextResponse.json({ ok: true, estado: nuevo })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
