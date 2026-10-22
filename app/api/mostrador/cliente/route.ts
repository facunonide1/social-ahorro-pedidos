import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * E.1 y E.2 · EL CLIENTE.
 *
 * Buscar por DNI, teléfono o nombre; y el alta en diez segundos con nombre y
 * teléfono.
 *
 * ── LO QUE NO SE GUARDA ─────────────────────────────────────────────────────
 *
 * Nada clínico. `clientes` no tiene campo de diagnóstico ni de medicación, y
 * esta ruta no acepta uno: si el cuerpo trae `diagnostico` o `notas_medicas`,
 * se ignora. El campo `notas` que existe es comercial —«prefiere que lo llamen
 * a la tarde»— y no se expone acá para no convertirlo en lo otro.
 */

async function gate(accion: 'ver' | 'crear') {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'clientes', accion)) {
    return { error: `sin permiso para ${accion} clientes`, status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const accion = String(b?.accion ?? 'buscar')
  const g = await gate(accion === 'alta' ? 'crear' : 'ver')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()

  if (accion === 'buscar') {
    const q = typeof b?.q === 'string' ? b.q.trim() : ''
    if (q.length < 2) return NextResponse.json({ ok: true, filas: [] })
    const { data, error } = await adm.rpc('mostrador_buscar_cliente', { p_q: q, p_limite: 8 })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, filas: data ?? [] })
  }

  if (accion === 'ficha') {
    if (!b?.cliente_id) return NextResponse.json({ error: 'falta el cliente' }, { status: 400 })
    const { data, error } = await adm.rpc('mostrador_cliente', {
      p_cliente: b.cliente_id, p_sucursal: g.sucursalId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, cliente: data })
  }

  // ── E.2 · ALTA EN DIEZ SEGUNDOS ─────────────────────────────────────────
  //
  // Nombre y teléfono alcanza. El resto se completa después — pedirle el DNI,
  // el email y la fecha de nacimiento a alguien que está esperando es la razón
  // por la que nadie carga clientes.
  if (accion === 'alta') {
    const nombre = typeof b?.nombre === 'string' ? b.nombre.trim() : ''
    if (!nombre) return NextResponse.json({ error: 'falta el nombre' }, { status: 400 })

    const tel = typeof b?.telefono === 'string' ? b.telefono.trim() : null
    const dni = typeof b?.dni === 'string' ? b.dni.replace(/\D/g, '') || null : null

    // Si ya existe por DNI o teléfono, se devuelve ese en vez de duplicarlo.
    if (dni || tel) {
      const { data: ya } = await adm.rpc('mostrador_buscar_cliente', {
        p_q: dni ?? tel, p_limite: 1,
      })
      const existe = ((ya ?? []) as any[])[0]
      if (existe) {
        return NextResponse.json({
          ok: true, id: existe.id, ya_existia: true,
          aviso: `Ya estaba cargado como «${existe.nombre}». Se usa ese en vez de crear otro.`,
        })
      }
    }

    const { data, error } = await adm.from('clientes').insert({
      nombre, telefono: tel, dni,
      tipo: 'persona',
      sucursal_habitual_id: g.sucursalId,
      fuentes: ['mostrador'],
      activo: true, es_demo: false,
    }).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data?.id, ya_existia: false })
  }

  return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 })
}
