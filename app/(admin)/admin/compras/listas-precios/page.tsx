import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RubroFilter } from '@/components/compras/rubro-filter'
import { parseRubro } from '@/components/compras/rubro'
import { ListasPreciosClient, type ListaRow, type ProvLite } from './listas-precios-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Listas de precios' }

export default async function ListasPreciosPage({ searchParams }: { searchParams: { rubro?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const rubro = parseRubro(searchParams.rubro)

  let lq = sb.from('listas_precios').select('id, proveedor_id, rubro, archivo_nombre, fecha_carga, vigente, es_demo, proveedores(razon_social)').order('fecha_carga', { ascending: false }).limit(500)
  if (rubro !== 'todos') lq = lq.eq('rubro', rubro)

  const [{ data: listas }, { data: provs }] = await Promise.all([
    lq,
    sb.from('proveedores').select('id, razon_social, rubros').eq('activo', true).order('razon_social').limit(500),
  ])

  // contar ítems + matcheados por lista
  const ids = ((listas ?? []) as any[]).map((l) => l.id)
  const counts = new Map<string, { total: number; match: number }>()
  if (ids.length) {
    const { data: items } = await sb.from('listas_precios_items').select('lista_id, producto_id').in('lista_id', ids).limit(50000)
    for (const it of (items ?? []) as any[]) {
      const c = counts.get(it.lista_id) ?? { total: 0, match: 0 }
      c.total++; if (it.producto_id) c.match++
      counts.set(it.lista_id, c)
    }
  }

  const rows: ListaRow[] = ((listas ?? []) as any[]).map((l) => {
    const c = counts.get(l.id) ?? { total: 0, match: 0 }
    return {
      id: l.id, proveedor: l.proveedores?.razon_social ?? '—', proveedor_id: l.proveedor_id, rubro: l.rubro,
      archivo: l.archivo_nombre, fecha: l.fecha_carga, vigente: l.vigente, es_demo: l.es_demo,
      items: c.total, matchPct: c.total > 0 ? Math.round((c.match / c.total) * 100) : 0,
    }
  })

  return (
    <>
      <PageHeader title="Listas de precios" description="Importá las listas de tus droguerías para alimentar el comparador."
        breadcrumbs={[{ label: 'Compras' }, { label: 'Listas de precios' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <RubroFilter />
        <ListasPreciosClient
          listas={rows}
          proveedores={((provs ?? []) as any[]).map((p) => ({ id: p.id, nombre: p.razon_social, rubros: p.rubros ?? [] })) as ProvLite[]}
        />
      </div>
    </>
  )
}
