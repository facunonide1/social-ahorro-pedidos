import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

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

const norm = (s: string) => (s ?? '').trim().toLowerCase()

/**
 * Carga una lista de precios de un proveedor (CSV/XLSX ya parseado en cliente).
 * body: { proveedor_id, rubro, archivo_nombre, mapeo, filas: [{sku?, codigo?, descripcion?, precio, desc_volumen?}] }
 * Matchea contra productos_catalogo (SKU → EAN → texto aprendido) y escribe
 * listas_precios(+items) + precios_historico.
 */
export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const filas = Array.isArray(b?.filas) ? b.filas : []
  if (!b?.proveedor_id || !filas.length) return NextResponse.json({ error: 'proveedor y filas requeridos' }, { status: 400 })
  const rubro = b?.rubro ?? 'farmacia'

  const adm = createAdminClient()
  const [{ data: cat }, { data: apr }] = await Promise.all([
    adm.from('productos_catalogo').select('id, sku, codigo_barras, nombre').eq('activo', true).limit(20000),
    adm.from('matcheos_aprendidos_compras').select('texto_origen, producto_id'),
  ])
  const porSku = new Map<string, string>(); const porEan = new Map<string, string>(); const porNombre = new Map<string, string>()
  for (const c of (cat ?? []) as any[]) {
    if (c.sku) porSku.set(norm(c.sku), c.id)
    if (c.codigo_barras) porEan.set(String(c.codigo_barras).trim(), c.id)
    porNombre.set(norm(c.nombre), c.id)
  }
  const aprendidos = new Map<string, string>(((apr ?? []) as any[]).map((a) => [norm(a.texto_origen), a.producto_id]))

  // marcar listas previas del proveedor+rubro como no vigentes
  await adm.from('listas_precios').update({ vigente: false }).eq('proveedor_id', b.proveedor_id).eq('rubro', rubro).eq('vigente', true)

  const { data: lista, error: eLista } = await adm.from('listas_precios').insert({
    proveedor_id: b.proveedor_id, rubro, archivo_nombre: b?.archivo_nombre ?? null,
    mapeo_usado: b?.mapeo ?? null, vigente: true, created_by: g.userId,
  }).select('id').single()
  if (eLista) return NextResponse.json({ error: eLista.message }, { status: 400 })

  const hoy = new Date().toISOString().slice(0, 10)
  let matched = 0
  const items = filas.map((f: any) => {
    const sku = f.sku ? norm(f.sku) : ''
    const ean = f.codigo ? String(f.codigo).trim() : ''
    const desc = f.descripcion ? norm(f.descripcion) : ''
    let pid: string | null = null
    if (sku && porSku.has(sku)) pid = porSku.get(sku)!
    else if (ean && porEan.has(ean)) pid = porEan.get(ean)!
    else if (desc && aprendidos.has(desc)) pid = aprendidos.get(desc)!
    else if (desc && porNombre.has(desc)) pid = porNombre.get(desc)!
    if (pid) matched++
    return { lista_id: lista.id, sku: f.sku ?? null, codigo: f.codigo ?? null, descripcion_origen: f.descripcion ?? null, producto_id: pid, precio: Number(f.precio) || 0, desc_volumen: f.desc_volumen ?? null, fecha: hoy }
  })
  await adm.from('listas_precios_items').insert(items)

  // histórico solo de los matcheados con precio
  const hist = items.filter((i: any) => i.producto_id && i.precio > 0).map((i: any) => ({ producto_id: i.producto_id, proveedor_id: b.proveedor_id, rubro, precio: i.precio, fecha: hoy }))
  if (hist.length) await adm.from('precios_historico').insert(hist)

  return NextResponse.json({ ok: true, lista_id: lista.id, total: items.length, matcheados: matched })
}
