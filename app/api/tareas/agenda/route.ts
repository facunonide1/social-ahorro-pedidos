import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

type Prop = { titulo: string; descripcion: string; prioridad: string; sucursal_id: string | null; origen: string }

/** GET: NORA propone la agenda del día cruzando vencimientos + irregularidades + faltantes. */
export async function GET() {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const scope = (q: any, col = 'sucursal_id') => (!esTodas && sucursalId ? q.eq(col, sucursalId) : q)
  const props: Prop[] = []

  // 1) vencimientos urgentes (≤30d)
  try {
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const { data } = await scope(adm.from('vencimientos').select('sucursal_id, cantidad, fecha_vencimiento, productos_catalogo(nombre)').eq('estado', 'vigente').lte('fecha_vencimiento', en30).order('fecha_vencimiento').limit(6))
    for (const v of (data ?? []) as any[]) props.push({ titulo: `Resolver vencimiento: ${v.productos_catalogo?.nombre ?? 'producto'}`, descripcion: `${v.cantidad} u. vencen el ${v.fecha_vencimiento}. Reponer góndola, liquidar o transferir.`, prioridad: 'alta', sucursal_id: v.sucursal_id, origen: 'vencimiento' })
  } catch { /* */ }

  // 2) irregularidades pendientes de más plata
  try {
    const { data } = await scope(adm.from('irregularidades_stock').select('sucursal_id, sku, valor_diferencia, productos_catalogo(nombre)').eq('estado', 'pendiente').eq('tipo', 'faltante').order('valor_diferencia').limit(4))
    for (const i of (data ?? []) as any[]) props.push({ titulo: `Revisar descuadre: ${i.productos_catalogo?.nombre ?? i.sku}`, descripcion: `Faltante por $${Math.round(Math.abs(Number(i.valor_diferencia))).toLocaleString('es-AR')}. Contá y justificá.`, prioridad: 'alta', sucursal_id: i.sucursal_id, origen: 'irregularidad' })
  } catch { /* */ }

  // 3) faltantes reportados
  try {
    const { data } = await scope(adm.from('avisos_faltante').select('sucursal_id, texto_libre, productos_catalogo(nombre)').eq('estado', 'nuevo').limit(4))
    for (const a of (data ?? []) as any[]) props.push({ titulo: `Reponer faltante: ${a.productos_catalogo?.nombre ?? a.texto_libre ?? 'producto'}`, descripcion: 'Reportado como faltante en góndola.', prioridad: 'media', sucursal_id: a.sucursal_id, origen: 'faltante' })
  } catch { /* */ }

  return NextResponse.json({ propuestas: props.slice(0, 12) })
}

/** POST: crea las tareas que el usuario aceptó (posiblemente editadas). */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const items = (Array.isArray(b?.items) ? b.items : []).filter((i: any) => i.titulo)
  if (!items.length) return NextResponse.json({ error: 'no hay tareas para crear' }, { status: 400 })
  const adm = createAdminClient()
  const { error } = await adm.from('tareas').insert(items.map((i: any) => ({
    titulo: String(i.titulo).slice(0, 200), descripcion: i.descripcion ?? null,
    tipo_origen: 'auto_sistema', prioridad: i.prioridad ?? 'media', estado: 'pendiente',
    sucursal_id: i.sucursal_id ?? null, entidad_relacionada: i.origen ?? 'agenda', creado_por: g.userId,
  })))
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, creadas: items.length })
}
