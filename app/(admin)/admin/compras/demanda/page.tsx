import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { DemandaClient, type ExisteRow, type LibreRow } from './demanda-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Radar de demanda' }

export default async function DemandaPage({ searchParams }: { searchParams: { dias?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const dias = [7, 30, 90].includes(Number(searchParams?.dias)) ? Number(searchParams.dias) : 30
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const [{ data: rows }, { data: sucs }] = await Promise.all([
    adm.from('demanda_invisible').select('texto_pedido, producto_id, sucursal_id, created_at').gte('created_at', desde).limit(5000),
    adm.from('sucursales').select('id, nombre'),
  ])
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const all = (rows ?? []) as any[]

  // 1) EXISTE PERO FALTÓ (producto_id no nulo)
  const existeMap = new Map<string, { count: number; sucs: Set<string>; textos: Set<string> }>()
  for (const r of all.filter((x) => x.producto_id)) {
    const g = existeMap.get(r.producto_id) ?? { count: 0, sucs: new Set(), textos: new Set() }
    g.count++; if (r.sucursal_id) g.sucs.add(r.sucursal_id); g.textos.add(r.texto_pedido)
    existeMap.set(r.producto_id, g)
  }
  const existeIds = [...existeMap.keys()]
  const prodMap = new Map<string, any>()
  const stockMap = new Map<string, number>()
  if (existeIds.length) {
    const [{ data: prods }, { data: stock }] = await Promise.all([
      adm.from('productos_catalogo').select('id, nombre, sku').in('id', existeIds),
      adm.from('stock_items').select('producto_id, cantidad_gondola, cantidad_deposito').in('producto_id', existeIds),
    ])
    for (const p of (prods ?? []) as any[]) prodMap.set(p.id, p)
    for (const s of (stock ?? []) as any[]) stockMap.set(s.producto_id, (stockMap.get(s.producto_id) ?? 0) + Number(s.cantidad_gondola ?? 0) + Number(s.cantidad_deposito ?? 0))
  }
  const existe: ExisteRow[] = existeIds.map((id) => ({
    producto_id: id, nombre: prodMap.get(id)?.nombre ?? 'producto', sku: prodMap.get(id)?.sku ?? null,
    veces: existeMap.get(id)!.count, stock: stockMap.get(id) ?? 0,
    sucursales: [...existeMap.get(id)!.sucs].map((s) => sucMap.get(s) ?? '—'),
  })).sort((a, b) => b.veces - a.veces)

  // 2) NO LO TRABAJAMOS (texto libre, agrupado por lower/trim)
  const libreMap = new Map<string, { texto: string; count: number; sucs: Set<string> }>()
  for (const r of all.filter((x) => !x.producto_id)) {
    const key = String(r.texto_pedido ?? '').toLowerCase().trim()
    if (!key) continue
    const g = libreMap.get(key) ?? { texto: r.texto_pedido, count: 0, sucs: new Set() }
    g.count++; if (r.sucursal_id) g.sucs.add(r.sucursal_id)
    libreMap.set(key, g)
  }
  const libre: LibreRow[] = [...libreMap.values()].map((g) => ({ texto: g.texto, veces: g.count, sucursales: [...g.sucs].map((s) => sucMap.get(s) ?? '—') })).sort((a, b) => b.veces - a.veces)

  return (
    <>
      <PageHeader title="Radar de demanda" description="La venta perdida hecha data: lo que piden y no hay. En un mes, el mapa de qué comprar que hoy no comprás."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Radar de demanda' }]} />
      <div className="p-4 md:p-6">
        <DemandaClient existe={existe} libre={libre} dias={dias} />
      </div>
    </>
  )
}
