import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { DOC_DIAS_DATO_FRESCO, TENANT_ACTUAL } from '@/lib/documentos/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Costo de reposición de un producto, para mostrar en su ficha.
 *
 * Devuelve SOLO costos. No calcula ni sugiere precio de venta: SIFACO es la
 * autoridad de eso. Si el catálogo ya tiene un precio sugerido cargado, se
 * devuelve tal cual para que la ficha pueda mostrar el margen que resulta —
 * como dato, no como recomendación.
 */
export async function GET(_req: Request, { params }: { params: { itemId: string } }) {
  const g = await gateDocumentos('ver')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()

  const [{ data: eventos }, { data: prod }] = await Promise.all([
    adm
      .from('doc_precios_historial')
      .select('fecha, precio_neto, precio_unitario, origen, tercero_id, proveedores:tercero_id(razon_social)')
      .eq('tenant_id', TENANT_ACTUAL)
      .eq('item_id', params.itemId)
      .order('fecha', { ascending: false })
      .limit(300),
    adm.from('productos_catalogo').select('precio_sugerido').eq('id', params.itemId).maybeSingle(),
  ])

  const filas = (eventos ?? []) as any[]
  if (!filas.length) {
    return NextResponse.json({ ultimo: null, mejor: null, precioSugerido: prod?.precio_sugerido ?? null })
  }

  const dias = (f: string) => Math.max(0, Math.floor((Date.now() - new Date(f + 'T00:00:00').getTime()) / 86_400_000))
  const neto = (f: any) => Number(f.precio_neto ?? f.precio_unitario)

  const u = filas[0]
  const ultimo = {
    neto: neto(u),
    fecha: u.fecha,
    proveedor: u.proveedores?.razon_social ?? 'sin proveedor',
    dias: dias(u.fecha),
    origen: u.origen,
  }

  // El mejor sale solo de datos frescos: un precio viejo no es una alternativa
  // real, es un recuerdo.
  const frescos = filas.filter((f) => dias(f.fecha) <= DOC_DIAS_DATO_FRESCO)
  const porProv = new Map<string, any>()
  for (const f of frescos) {
    const k = f.tercero_id ?? 'sin'
    if (!porProv.has(k)) porProv.set(k, f)
  }
  const candidatos = [...porProv.values()].sort((a, b) => neto(a) - neto(b))
  const m = candidatos[0]

  return NextResponse.json({
    ultimo,
    mejor: m
      ? { neto: neto(m), fecha: m.fecha, proveedor: m.proveedores?.razon_social ?? 'sin proveedor', dias: dias(m.fecha) }
      : null,
    precioSugerido: prod?.precio_sugerido != null ? Number(prod.precio_sugerido) : null,
    diasFresco: DOC_DIAS_DATO_FRESCO,
  })
}
