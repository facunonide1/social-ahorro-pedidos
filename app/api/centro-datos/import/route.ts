import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'crypto'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'
import { mapearFilas, analizar, aplicar } from '@/lib/centro-datos/import'
import { detectarMapeo } from '@/lib/centro-datos/deteccion'
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

  // ---- mapeo inteligente: NORA lee encabezados + muestra y propone el mapeo ----
  if (accion === 'mapear') {
    const muestra = rows.slice(0, 8)
    const prop = await detectarMapeo(headers, muestra, perfil.tipo, { base: perfil.mapeo_columnas ?? {}, usarLLM: true })
    return NextResponse.json({ tipo: perfil.tipo, headers, ...prop })
  }

  const sucursalId = b?.sucursal_id ?? null
  const fecha = b?.fecha ?? null
  if (perfil.tipo === 'ventas' && (!sucursalId || !fecha)) {
    return NextResponse.json({ error: 'ventas requiere sucursal y fecha' }, { status: 400 })
  }

  // mapeo a usar: el que confirmó el usuario (override) o el guardado en el perfil
  const mapeoUsar: Record<string, CampoSistema | string> =
    (b?.mapeo && typeof b.mapeo === 'object' && Object.keys(b.mapeo).length) ? b.mapeo : (perfil.mapeo_columnas ?? {})
  const filas = mapearFilas(headers, rows, mapeoUsar, perfil.opciones ?? {})
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

  // Cruce de irregularidades: snapshot del stock de la sucursal + comparación
  // contra la foto anterior (stock_anterior − ventas = esperado vs real).
  let irregularidades: any = null
  if ((perfil.tipo === 'productos' || perfil.tipo === 'stock') && sucursalId) {
    const hoy = new Date().toISOString().slice(0, 10)
    try {
      await adm.rpc('snapshot_stock_sucursal', { p_sucursal: sucursalId, p_fecha: hoy, p_job: r.import_job_id, p_es_demo: false })
      const { data: cruce } = await adm.rpc('calcular_irregularidades_stock', { p_sucursal: sucursalId, p_fecha: hoy })
      irregularidades = cruce
    } catch { /* el cruce no bloquea el import */ }
  }
  // OS-3 · D: lista de recartelado por sucursal (solo góndola > 0) a partir de los
  // cambios de precio detectados. Idempotente por import_job (el re-aplicar del
  // mismo archivo ya se bloquea arriba por archivo_hash).
  let recartelado: any = null
  if ((perfil.tipo === 'productos' || perfil.tipo === 'stock') && analisis.cambios_precio.length && r.import_job_id) {
    try { recartelado = await generarRecartelado(adm, r.import_job_id, analisis.cambios_precio) } catch { /* no bloquea el import */ }
  }

  return NextResponse.json({ ok: true, ...r, matcheados: analisis.matcheados, irregularidades, recartelado })
}

/** Genera listas_recartelado + items por sucursal, solo para productos con góndola > 0. */
async function generarRecartelado(adm: any, importJobId: string, cambios: { producto_id: string; sku: string | null; nombre: string; precio_anterior: number; precio_nuevo: number }[]) {
  const cambioMap = new Map(cambios.map((c) => [c.producto_id, c]))
  const prodIds = cambios.map((c) => c.producto_id)
  const { data: stock } = await adm.from('stock_items')
    .select('producto_id, sucursal_id, cantidad_gondola').eq('es_demo', false)
    .in('producto_id', prodIds).gt('cantidad_gondola', 0)
  const bySuc = new Map<string, { producto_id: string; sku: string | null; nombre: string; precio_anterior: number; precio_nuevo: number }[]>()
  for (const s of (stock ?? []) as any[]) {
    const c = cambioMap.get(s.producto_id)
    if (!c) continue
    const arr = bySuc.get(s.sucursal_id) ?? []
    arr.push(c); bySuc.set(s.sucursal_id, arr)
  }
  const hoy = new Date().toISOString().slice(0, 10)
  let listas = 0, items = 0
  for (const [sucursalId, ci] of bySuc) {
    // idempotente: si ya hay lista para (sucursal, import_job) no la duplica.
    const { data: ex } = await adm.from('listas_recartelado').select('id').eq('sucursal_id', sucursalId).eq('import_job_id', importJobId).maybeSingle()
    if (ex) continue
    const { data: lista } = await adm.from('listas_recartelado').insert({ sucursal_id: sucursalId, import_job_id: importJobId, fecha: hoy, estado: 'pendiente' }).select('id').single()
    if (!lista?.id) continue
    listas++
    await adm.from('recartelado_items').insert(ci.map((c) => ({ lista_id: lista.id, producto_id: c.producto_id, sku: c.sku, nombre: c.nombre, precio_viejo: c.precio_anterior, precio_nuevo: c.precio_nuevo })))
    items += ci.length
  }
  return { listas, items }
}
