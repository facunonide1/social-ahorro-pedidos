import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'sifaco-importaciones'
const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'administrativo']

/**
 * ABRIR UNA IMPORTACIÓN DE SIFACO.
 *
 * El navegador ya calculó el SHA-256 del archivo. Acá se decide si ese archivo
 * es nuevo, y si lo es se devuelve una URL firmada para que lo suba DERECHO a
 * Storage. Los 41 MB no pasan por esta función: lo único que viaja es el hash.
 *
 * La idempotencia (A.6) no depende de que alguien se acuerde de chequear: hay
 * un índice único sobre `archivo_hash`. Esto contesta antes para poder decir
 * algo útil, pero si dos pestañas corren a la vez, gana el índice.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso para importar' }, { status: 403 })
  }

  const b = await req.json().catch(() => null)
  const tipo = b?.tipo as string | undefined
  const nombre = typeof b?.nombre === 'string' ? b.nombre : null
  const hash = typeof b?.hash === 'string' ? b.hash.toLowerCase() : null
  const bytes = Number(b?.bytes)

  if (!tipo || !['maestro', 'compra_venta', 'sucursal'].includes(tipo)) {
    return NextResponse.json({ error: 'falta el tipo de archivo' }, { status: 400 })
  }
  if (!nombre || !hash || !/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: 'falta el nombre o el hash del archivo' }, { status: 400 })
  }

  const adm = createAdminClient()

  // ¿Este archivo ya entró? Se contesta con la importación vieja para que la
  // pantalla ofrezca abrirla, en vez de dejar a alguien subiendo 41 MB de nuevo.
  const { data: ya } = await adm
    .from('sifaco_importaciones')
    .select('id, tipo, estado, created_at, filas_cargadas')
    .eq('archivo_hash', hash)
    .maybeSingle()

  if (ya) {
    return NextResponse.json({
      estado: 'duplicado',
      importacion: ya,
      mensaje: 'Este archivo ya se importó. Es el mismo, byte por byte.',
    })
  }

  const path = `${tipo}/${new Date().toISOString().slice(0, 10)}/${hash.slice(0, 16)}.xls`

  const { data: imp, error } = await adm
    .from('sifaco_importaciones')
    .insert({
      tipo,
      archivo_nombre: nombre,
      archivo_path: path,
      archivo_hash: hash,
      bytes: Number.isFinite(bytes) ? bytes : null,
      estado: 'subiendo',
      subido_por: user.id,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = el índice único ganó la carrera. No es un error para el usuario.
    if ((error as any).code === '23505') {
      return NextResponse.json({
        estado: 'duplicado',
        mensaje: 'Este archivo ya se importó.',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: firma, error: eFirma } = await adm.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (eFirma) {
    await adm.from('sifaco_importaciones')
      .update({ estado: 'error', error: eFirma.message })
      .eq('id', imp.id)
    return NextResponse.json({ error: eFirma.message }, { status: 500 })
  }

  return NextResponse.json({
    estado: 'nuevo',
    importacionId: imp.id,
    bucket: BUCKET,
    path,
    token: firma.token,
  })
}

/** Las últimas importaciones, para la pantalla. */
export async function GET() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data } = await createAdminClient()
    .from('sifaco_importaciones')
    .select('id, tipo, archivo_nombre, bytes, estado, codificacion, filas_cargadas, previa, resultado, error, created_at, aplicado_at')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ importaciones: data ?? [] })
}
