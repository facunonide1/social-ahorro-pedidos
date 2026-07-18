import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { buildMatcher, matchFila } from '@/lib/centro-datos/import'
import { parseFechaVig } from '@/lib/centro-datos/import'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Importar ofertas (OS-6a · O-05). Recibe filas {sku|ean, precio, desde, hasta,
 * nombre?} ya parseadas en el browser. Matchea contra el catálogo (reusa el
 * matcher del Centro de Datos), crea UNA oferta BORRADOR por vigencia (o por
 * nombre) con sus items, y manda los sin-match a la cola existente. JAMÁS activa.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo, permisos_custom').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo || !(puede(me.rol, me.permisos_custom ?? {}, 'ofertas', 'crear') || me.rol === 'super_admin')) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const filas: any[] = Array.isArray(b?.filas) ? b.filas : []
  if (!filas.length) return NextResponse.json({ error: 'archivo sin filas' }, { status: 400 })

  const adm = createAdminClient()
  const { matcher } = await buildMatcher(adm)

  type Grupo = { nombre: string; desde: string | null; hasta: string | null; items: { producto_id: string; precio_oferta: number | null }[]; pids: string[] }
  const grupos = new Map<string, Grupo>()
  const sinMatch: any[] = []

  for (const f of filas) {
    const sku = f.sku != null ? String(f.sku).trim() : ''
    const ean = f.ean != null ? String(f.ean).trim() : ''
    const nombreProd = f.nombre_producto != null ? String(f.nombre_producto).trim() : ''
    const desde = parseFechaVig(f.desde)
    const hasta = parseFechaVig(f.hasta)
    const precio = f.precio != null && String(f.precio).trim() !== '' ? Number(String(f.precio).replace(',', '.')) : null
    const nombreOferta = f.nombre ? String(f.nombre).trim() : (desde ? `Import ${desde}` : 'Import de ofertas')

    const { producto } = matchFila({ sku: sku || null, codigo_barras: ean || null, nombre: nombreProd || null } as any, matcher)
    if (!producto) {
      sinMatch.push({ import_job_id: null, sku: sku || null, codigo: sku || null, barras: ean || null, descripcion_origen: nombreProd || nombreOferta, datos: f, estado: 'pendiente' })
      continue
    }
    const key = f.nombre ? `n:${nombreOferta}` : `v:${desde ?? '-'}|${hasta ?? '-'}`
    const g = grupos.get(key) ?? { nombre: nombreOferta, desde, hasta, items: [], pids: [] }
    if (!g.pids.includes(producto.id)) { g.items.push({ producto_id: producto.id, precio_oferta: Number.isFinite(precio as number) ? precio : null }); g.pids.push(producto.id) }
    grupos.set(key, g)
  }

  let ofertasCreadas = 0, itemsCreados = 0
  for (const g of grupos.values()) {
    if (!g.pids.length) continue
    const { data: of, error } = await adm.from('ofertas').insert({
      nombre: g.nombre, tipo: 'precio_fijo', productos_ids: g.pids,
      sucursales_ids: (await adm.from('sucursales').select('id').eq('activa', true)).data?.map((s: any) => s.id) ?? [],
      rubro: 'farmacia', canales: ['cartel', 'cuponera'],
      vigencia_tipo: g.desde || g.hasta ? 'con_fecha' : 'permanente', fecha_inicio: g.desde, fecha_fin: g.hasta,
      origen: 'oferta_drogueria', propuesta_por: 'usuario', estado: 'borrador', created_by: user.id,
      justificacion: 'Importada desde archivo (SIFACO/droguería).',
    }).select('id').single()
    if (error || !of) continue
    await adm.from('oferta_items').insert(g.items.map((it) => ({ oferta_id: of.id, producto_id: it.producto_id, precio_oferta: it.precio_oferta })))
    ofertasCreadas++; itemsCreados += g.items.length
  }

  if (sinMatch.length) await adm.from('items_sin_match').insert(sinMatch)

  return NextResponse.json({ ok: true, ofertas_creadas: ofertasCreadas, items: itemsCreados, sin_match: sinMatch.length })
}
