import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'crypto'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'
import { mapearFilas, analizar, aplicar } from '@/lib/centro-datos/import'
import type { TipoPerfilDatos, CampoSistema, OpcionesPerfil } from '@/lib/types/centro-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Perfil = {
  id: string; tipo: TipoPerfilDatos
  mapeo_columnas: Record<string, CampoSistema | string>; opciones: OpcionesPerfil
}

/**
 * POST accion:
 *  - 'analizar'  → preview (explicación NORA, semáforo, cambios, match). No escribe.
 *  - 'confirmar' → snapshot + aplica + import_job + cola sin match.
 * Payload: { accion, perfil_id, headers[], rows[][], sucursal_id?, fecha?, archivo_nombre? }
 */
export async function POST(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  const accion = b?.accion ?? 'analizar'
  const headers: string[] = Array.isArray(b?.headers) ? b.headers : []
  const rows: string[][] = Array.isArray(b?.rows) ? b.rows : []
  if (!b?.perfil_id || !headers.length) return NextResponse.json({ error: 'perfil y archivo requeridos' }, { status: 400 })

  const { data: perfil } = await adm.from('perfiles_datos')
    .select('id, tipo, mapeo_columnas, opciones').eq('id', b.perfil_id).maybeSingle<Perfil>()
  if (!perfil) return NextResponse.json({ error: 'perfil no encontrado' }, { status: 404 })

  const sucursalId = b?.sucursal_id ?? null
  const fecha = b?.fecha ?? null
  if (perfil.tipo === 'ventas' && (!sucursalId || !fecha)) {
    return NextResponse.json({ error: 'ventas requiere sucursal y fecha' }, { status: 400 })
  }

  const filas = mapearFilas(headers, rows, perfil.mapeo_columnas ?? {}, perfil.opciones ?? {})
  if (!filas.length) return NextResponse.json({ error: 'no se detectaron filas con datos (¿mapeo correcto?)' }, { status: 400 })

  const analisis = await analizar(adm, perfil.tipo, filas, { sucursalId, perfilId: perfil.id, fecha })

  if (accion === 'analizar') {
    return NextResponse.json({
      total: analisis.total, matcheados: analisis.matcheados, sin_match: analisis.sin_match,
      anomalias: analisis.anomalias, resumen: analisis.resumen, preview: analisis.preview,
    })
  }

  // confirmar
  const archivoNombre = b?.archivo_nombre ?? null
  const hash = createHash('sha1').update(JSON.stringify({ p: perfil.id, s: sucursalId, f: fecha, n: rows.length, h: headers })).digest('hex')

  // idempotencia: mismo archivo aplicado hoy → avisar
  if (hash) {
    const { data: dup } = await adm.from('import_jobs')
      .select('id, created_at').eq('archivo_hash', hash).eq('estado', 'aplicado')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString()).maybeSingle()
    if (dup && !b?.forzar) {
      return NextResponse.json({ duplicado: true, job_id: dup.id, mensaje: 'Este archivo ya se aplicó en las últimas 24hs.' })
    }
  }

  const crearSkus: string[] = Array.isArray(b?.crear_skus) ? b.crear_skus : []
  const r = await aplicar(adm, {
    tipo: perfil.tipo, perfilId: perfil.id, sucursalId, fecha,
    archivoNombre, archivoHash: hash, filas, analisis,
    usuarioId: g.userId, usuarioNombre: g.nombre, esDemo: false, crearSkus,
  })
  return NextResponse.json({ ok: true, ...r, matcheados: analisis.matcheados })
}
