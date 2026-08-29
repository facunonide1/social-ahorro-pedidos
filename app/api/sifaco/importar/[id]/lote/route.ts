import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'administrativo']

/**
 * UN LOTE DE FILAS YA NORMALIZADAS.
 *
 * El navegador parsea el .xls, arregla la codificación, convierte fechas y
 * números, y manda tandas. Acá sólo se guardan: ninguna de estas filas toca el
 * catálogo todavía, y ninguna toca stock. Es la pila de origen.
 *
 * ── POR QUÉ SE PUEDE RETOMAR ────────────────────────────────────────────────
 *
 * Cada lote deja su renglón en `sifaco_import_lotes`. Si la carga se corta a la
 * mitad —se cerró la pestaña, se cayó la red— el navegador pregunta qué lotes
 * ya están y sigue desde ahí. 46.000 filas son unos noventa lotes: empezar de
 * cero por el lote ochenta y siete es la clase de cosa que hace que nadie
 * vuelva a importar nada.
 *
 * El upsert es por (importacion_id, fila), así que reenviar un lote que ya
 * entró no duplica: escribe lo mismo encima.
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
  const desdeFila = Number(body?.desde_fila)
  const filas = Array.isArray(body?.filas) ? body.filas : null
  const codificacion = typeof body?.codificacion === 'string' ? body.codificacion : null
  const prueba = body?.codificacion_prueba ?? null
  const filasDeclaradas = Number(body?.filas_declaradas)

  if (!Number.isInteger(lote) || !Number.isInteger(desdeFila) || !filas) {
    return NextResponse.json({ error: 'lote mal formado' }, { status: 400 })
  }
  if (filas.length > 1000) {
    return NextResponse.json({ error: 'lote demasiado grande: máximo 1000 filas' }, { status: 400 })
  }

  const adm = createAdminClient()

  const { data: imp } = await adm
    .from('sifaco_importaciones')
    .select('id, tipo, estado')
    .eq('id', params.id)
    .maybeSingle<{ id: string; tipo: string; estado: string }>()

  if (!imp) return NextResponse.json({ error: 'la importación no existe' }, { status: 404 })
  if (imp.estado === 'aplicado') {
    return NextResponse.json({ error: 'esta importación ya se aplicó' }, { status: 409 })
  }
  if (imp.tipo !== 'maestro') {
    return NextResponse.json({ error: 'por ahora sólo se carga el maestro' }, { status: 400 })
  }

  const conId = filas.map((f: any) => ({ ...f, importacion_id: params.id }))

  const { error } = await adm
    .from('sifaco_maestro_staging')
    .upsert(conId, { onConflict: 'importacion_id,fila' })

  if (error) {
    await adm.from('sifaco_importaciones')
      .update({ estado: 'error', error: `lote ${lote}: ${error.message}` })
      .eq('id', params.id)
    return NextResponse.json({ error: error.message, lote }, { status: 500 })
  }

  await adm.from('sifaco_import_lotes').upsert({
    importacion_id: params.id,
    lote,
    desde_fila: desdeFila,
    filas: filas.length,
  }, { onConflict: 'importacion_id,lote' })

  // El total se recuenta desde los lotes: si un lote se reenvió, sumar acá
  // daría de más.
  const { data: suma } = await adm
    .from('sifaco_import_lotes')
    .select('filas')
    .eq('importacion_id', params.id)

  const cargadas = (suma ?? []).reduce((a: number, r: any) => a + Number(r.filas ?? 0), 0)

  await adm.from('sifaco_importaciones').update({
    estado: 'cargando',
    filas_cargadas: cargadas,
    ...(codificacion ? { codificacion, codificacion_prueba: prueba } : {}),
    ...(Number.isFinite(filasDeclaradas) ? { filas_declaradas: filasDeclaradas } : {}),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true, lote, filas_cargadas: cargadas })
}

/** Qué lotes ya entraron — para poder retomar sin empezar de cero. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data } = await createAdminClient()
    .from('sifaco_import_lotes')
    .select('lote')
    .eq('importacion_id', params.id)
    .order('lote')

  return NextResponse.json({ lotes: (data ?? []).map((r: any) => r.lote) })
}
