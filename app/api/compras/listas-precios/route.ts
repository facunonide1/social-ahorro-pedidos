import { NextResponse, type NextRequest } from 'next/server'

import { normalizarLote } from '@/lib/documentos/normalizar'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

import { catalogoCompleto } from '@/lib/catalogo/indice'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente', 'comprador'].includes(me.rol)) return { error: 'sin permiso', status: 403 as const }
  return { ok: true as const, userId: user.id }
}

/**
 * Comparación exacta contra el catálogo propio (SKU y nombre). NO es la
 * normalización de matching de alias: para eso está `doc_normalizar_texto` en la
 * base, que es la única válida y llega acá vía `normalizarLote`.
 */
const normSimple = (s: string) => (s ?? '').trim().toLowerCase()

type Fila = { sku?: string | null; codigo?: string | null; descripcion?: string | null; precio?: number; desc_volumen?: any }
type Matcher = { porSku: Map<string, string>; porEan: Map<string, string>; porNombre: Map<string, string>; aprendidos: Map<string, string> }

async function buildMatcher(adm: ReturnType<typeof createAdminClient>, proveedorId: string): Promise<Matcher> {
  // Los alias se leen del motor de documentos (doc_items_alias), acotados AL
  // PROVEEDOR de la lista: cada droguería escribe el mismo producto distinto,
  // así que un alias global aprende mal y contamina el match de los demás.
  const [cat, { data: apr }] = await Promise.all([
    catalogoCompleto(adm),
    adm.from('doc_items_alias').select('descripcion_norm, item_id').eq('tercero_id', proveedorId).eq('activo', true).limit(20000),
  ])
  const porSku = new Map<string, string>(); const porEan = new Map<string, string>(); const porNombre = new Map<string, string>()
  for (const c of (cat ?? []) as any[]) {
    if (c.sku) porSku.set(normSimple(c.sku), c.id)
    if (c.codigo_barras) porEan.set(String(c.codigo_barras).trim(), c.id)
    porNombre.set(normSimple(c.nombre), c.id)
  }
  const aprendidos = new Map<string, string>(((apr ?? []) as any[]).map((a) => [a.descripcion_norm, a.item_id]))
  return { porSku, porEan, porNombre, aprendidos }
}

/**
 * `descNorm` viene de `doc_normalizar_texto` (la base), que es la MISMA función
 * que llenó `doc_items_alias.descripcion_norm`. Si acá se normalizara por
 * separado, el lookup de aprendidos no matchearía nunca y fallaría en silencio.
 */
function matchFila(f: Fila, m: Matcher, descNorm: string | null): { producto_id: string | null; via: string | null } {
  const sku = f.sku ? normSimple(f.sku) : ''
  const ean = f.codigo ? String(f.codigo).trim() : ''
  const desc = f.descripcion ? normSimple(f.descripcion) : ''
  if (sku && m.porSku.has(sku)) return { producto_id: m.porSku.get(sku)!, via: 'sku' }
  if (ean && m.porEan.has(ean)) return { producto_id: m.porEan.get(ean)!, via: 'ean' }
  if (descNorm && m.aprendidos.has(descNorm)) return { producto_id: m.aprendidos.get(descNorm)!, via: 'aprendido' }
  if (desc && m.porNombre.has(desc)) return { producto_id: m.porNombre.get(desc)!, via: 'nombre' }
  return { producto_id: null, via: null }
}

/** Importador de listas de precios (analizar/confirmar) + eliminar/marcar vigente. */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const accion = b?.accion ?? 'confirmar'

  // ---- gestión ----
  if (accion === 'eliminar') {
    if (!b?.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const { error } = await adm.from('listas_precios').delete().eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  if (accion === 'marcar_vigente') {
    if (!b?.id || !b?.proveedor_id || !b?.rubro) return NextResponse.json({ error: 'datos requeridos' }, { status: 400 })
    await adm.from('listas_precios').update({ vigente: false }).eq('proveedor_id', b.proveedor_id).eq('rubro', b.rubro)
    const { error } = await adm.from('listas_precios').update({ vigente: true }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ---- analizar / confirmar ----
  const filas: Fila[] = Array.isArray(b?.filas) ? b.filas : []
  if (!b?.proveedor_id || !filas.length) return NextResponse.json({ error: 'proveedor y filas requeridos' }, { status: 400 })
  const rubro = b?.rubro ?? 'farmacia'
  const matcher = await buildMatcher(adm, b.proveedor_id)
  // Una sola llamada para las N descripciones: normalizar en el cliente sería
  // el bug que 0084 previene, y la RPC en lote quita la excusa de performance.
  const descsNorm = await normalizarLote(adm, filas.map((f) => f.descripcion ?? ''))

  if (accion === 'analizar') {
    let matched = 0
    const preview = filas.map((f, idx) => {
      const { producto_id, via } = matchFila(f, matcher, descsNorm[idx] ?? null)
      if (producto_id) matched++
      return { sku: f.sku ?? null, codigo: f.codigo ?? null, descripcion: f.descripcion ?? null, precio: Number(f.precio) || 0, producto_id, via }
    })
    return NextResponse.json({ total: filas.length, matcheados: matched, sin_match: filas.length - matched, preview: preview.slice(0, 300) })
  }

  // confirmar
  await adm.from('listas_precios').update({ vigente: false }).eq('proveedor_id', b.proveedor_id).eq('rubro', rubro).eq('vigente', true)
  const { data: lista, error: eLista } = await adm.from('listas_precios').insert({
    proveedor_id: b.proveedor_id, rubro, archivo_nombre: b?.archivo_nombre ?? null,
    hash: b?.hash ?? null, mapeo_usado: b?.mapeo ?? null, vigente: true, created_by: g.userId,
  }).select('id').single()
  if (eLista) return NextResponse.json({ error: eLista.message }, { status: 400 })

  const hoy = new Date().toISOString().slice(0, 10)
  let matched = 0
  const items = filas.map((f, idx) => {
    const { producto_id } = matchFila(f, matcher, descsNorm[idx] ?? null)
    if (producto_id) matched++
    return { lista_id: lista.id, sku: f.sku ?? null, codigo: f.codigo ?? null, descripcion_origen: f.descripcion ?? null, producto_id, precio: Number(f.precio) || 0, desc_volumen: f.desc_volumen ?? null, fecha: hoy }
  })
  await adm.from('listas_precios_items').insert(items)
  // El histórico va al motor: serie de eventos con origen explícito. `rubro` no
  // viaja — el motor es neutro y el rubro ya vive en listas_precios.
  const hist = items.filter((i) => i.producto_id && i.precio > 0).map((i) => ({
    item_id: i.producto_id, tercero_id: b.proveedor_id, precio_unitario: i.precio,
    fecha: hoy, origen: 'lista_precios' as const,
  }))
  if (hist.length) await adm.from('doc_precios_historial').insert(hist)

  return NextResponse.json({ ok: true, lista_id: lista.id, total: items.length, matcheados: matched, sin_match: items.length - matched })
}
