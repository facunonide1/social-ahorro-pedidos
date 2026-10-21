import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'administrativo']

/** Las columnas que la pila de origen acepta. Lo que venga de más se ignora. */
const CAMPOS = new Set([
  'fila', 'codigo', 'nombre', 'descripx', 'barras', 'barras2', 'barras3', 'barras4',
  'costo', 'precio', 'neto', 'gcom',
  'stk_guz', 'stk_fig', 'stk_ara', 'stk_tes', 'stk_tot', 'ventas',
  'prefijo', 'vl', 'status', 'nopedir', 'nom_gru', 'seccion', 'categoria',
  'unine_3', 'categ_3', 'segme_3', 'ssegm_3', 'marca_3', 'promo_3',
  'codlab', 'nomlab', 'nom_dep', 'familia', 'droga', 'fec_actu',
])

/**
 * UN LOTE DEL MAESTRO POR SUCURSAL.
 *
 * Igual que `/lote` pero contra `sifaco_sucursal_staging`: otro layout, otra
 * pila. Ninguna de estas filas toca el catálogo ni el stock — aplicar es el
 * paso siguiente y lo decide una persona.
 *
 * ── LO QUE SE GUARDA EN EL PRIMER LOTE ──────────────────────────────────────
 *
 * La fecha del archivo y la verificación completa. La fecha va en el primer
 * lote y no al final porque `sifaco_aplicar_sucursales` la exige: sin ella los
 * cuatro meses de ventas no se pueden ubicar, y una importación a medio cargar
 * sin fecha es una importación que no se puede terminar.
 *
 * ── EL FILTRO DE CAMPOS NO ES PARANOIA ──────────────────────────────────────
 *
 * El cuerpo lo arma el navegador de quien sube el archivo. Pasar el objeto tal
 * cual a un insert deja que el cliente elija qué columnas escribe, incluidas
 * las que no mandó nadie. Se copian las declaradas y nada más.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const lote = Number(body?.lote)
  const filas = Array.isArray(body?.filas) ? body.filas : null
  const filasDeclaradas = Number(body?.filas_declaradas)
  const fechaArchivo = typeof body?.fecha_archivo === 'string' ? body.fecha_archivo : null

  if (!Number.isInteger(lote) || !filas) {
    return NextResponse.json({ error: 'lote mal formado' }, { status: 400 })
  }
  if (filas.length > 1000) {
    return NextResponse.json({ error: 'lote demasiado grande: máximo 1000 filas' }, { status: 400 })
  }

  const adm = createAdminClient()

  const { data: imp } = await adm
    .from('sifaco_importaciones')
    .select('id, tipo, estado, aplicado_at')
    .eq('id', params.id)
    .maybeSingle<{ id: string; tipo: string; estado: string; aplicado_at: string | null }>()

  if (!imp) return NextResponse.json({ error: 'la importación no existe' }, { status: 404 })
  if (imp.tipo !== 'sucursal') {
    return NextResponse.json({ error: 'esta importación no es del maestro por sucursal' }, { status: 400 })
  }
  // Una importación ya aplicada no recibe más filas: cambiarle la pila debajo
  // dejaría la pila diciendo una cosa y el catálogo otra, sin forma de saber
  // cuál se aplicó.
  if (imp.aplicado_at) {
    return NextResponse.json({ error: 'esta importación ya se aplicó: no se le pueden agregar filas' }, { status: 409 })
  }

  const limpias = (filas as Record<string, unknown>[]).map((f) => {
    const out: Record<string, unknown> = { importacion_id: params.id }
    for (const k of Object.keys(f)) if (CAMPOS.has(k)) out[k] = f[k]
    return out
  })

  const { error } = await adm
    .from('sifaco_sucursal_staging')
    .upsert(limpias, { onConflict: 'importacion_id,fila' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const parche: Record<string, unknown> = { estado: 'cargando' }
  if (lote === 0) {
    if (fechaArchivo) parche.fecha_archivo = fechaArchivo
    if (body?.verificacion) parche.verificacion = body.verificacion
    if (body?.resumen) parche.resultado = body.resumen
    if (Number.isInteger(filasDeclaradas)) parche.filas_declaradas = filasDeclaradas
  }

  const { count } = await adm
    .from('sifaco_sucursal_staging')
    .select('fila', { count: 'exact', head: true })
    .eq('importacion_id', params.id)

  parche.filas_cargadas = count ?? 0
  if (Number.isInteger(filasDeclaradas) && (count ?? 0) >= filasDeclaradas) {
    parche.estado = 'cargado'
    parche.cargado_at = new Date().toISOString()
  }

  await adm.from('sifaco_importaciones').update(parche).eq('id', params.id)

  return NextResponse.json({ ok: true, filas: limpias.length, cargadas: count ?? 0 })
}
