import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { FaltantesClient, type FaltanteGrupo, type ProductoLite, type SucLite } from './faltantes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Avisos de faltantes' }

export default async function FaltantesPage({ searchParams }: { searchParams: { rubro?: string } }) {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)

  let q = sb.from('avisos_faltante')
    .select('id, producto_id, texto_libre, rubro, sucursal_id, cantidad_sugerida, estado, created_at, productos_catalogo(nombre, sku), sucursales(nombre)')
    .in('estado', ['nuevo', 'en_orden']).order('created_at', { ascending: false }).limit(1000)
  if (rubro !== 'todos') q = q.eq('rubro', rubro)

  const [{ data: avisos }, { data: prods }, { data: sucs }] = await Promise.all([
    q,
    sb.from('productos_catalogo').select('id, sku, nombre').eq('activo', true).order('nombre').limit(5000),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  // Cruce con stock para sugerir transferencia
  const prodIds = [...new Set(((avisos ?? []) as any[]).map((a) => a.producto_id).filter(Boolean))]
  let stockByProd = new Map<string, { sucursal_id: string; cantidad: number }[]>()
  if (prodIds.length) {
    const { data: stk } = await sb.from('stock_items').select('producto_id, sucursal_id, cantidad').in('producto_id', prodIds).gt('cantidad', 0)
    for (const s of (stk ?? []) as any[]) {
      const arr = stockByProd.get(s.producto_id) ?? []
      arr.push({ sucursal_id: s.sucursal_id, cantidad: Number(s.cantidad) })
      stockByProd.set(s.producto_id, arr)
    }
  }

  // Agrupar por producto (o texto libre)
  const map = new Map<string, FaltanteGrupo>()
  for (const a of (avisos ?? []) as any[]) {
    const key = a.producto_id ? `p:${a.producto_id}` : `t:${(a.texto_libre ?? '').toLowerCase()}`
    const nombre = a.productos_catalogo?.nombre ?? a.texto_libre ?? '—'
    const g = map.get(key) ?? {
      key, producto_id: a.producto_id, nombre, sku: a.productos_catalogo?.sku ?? null,
      rubro: a.rubro, total: 0, avisos: [], sucursales: [],
      stockEnOtras: a.producto_id ? (stockByProd.get(a.producto_id) ?? []).reduce((s, x) => s + x.cantidad, 0) : 0,
    }
    g.total += Number(a.cantidad_sugerida ?? 0)
    g.avisos.push({ id: a.id, sucursal: a.sucursales?.nombre ?? '—', cantidad: a.cantidad_sugerida != null ? Number(a.cantidad_sugerida) : null, fecha: a.created_at, estado: a.estado })
    if (a.sucursales?.nombre && !g.sucursales.includes(a.sucursales.nombre)) g.sucursales.push(a.sucursales.nombre)
    map.set(key, g)
  }
  const grupos = [...map.values()].sort((a, b) => b.avisos.length - a.avisos.length)

  return (
    <>
      <PageHeader title="Avisos de faltantes" description="Lo que reportan las sucursales, agrupado por producto. Las 4 sucursales son sensores del comprador."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Faltantes' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <RubroFilter />
        <FaltantesClient
          grupos={grupos}
          rol={profile.rol}
          sucursalId={profile.sucursal_id}
          productos={((prods ?? []) as any[]).map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre })) as ProductoLite[]}
          sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre })) as SucLite[]}
        />
      </div>
    </>
  )
}
