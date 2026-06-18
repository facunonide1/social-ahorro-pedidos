import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { ReposicionClient, type RepoRow } from './reposicion-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reposición' }

export default async function ReposicionPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'auditor'] })
  const sb = createClient()

  const [{ data: rot }, { data: stock }, { data: prods }, { data: sucs }] = await Promise.all([
    sb.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d, dias_stock_restante'),
    sb.from('stock_items').select('producto_id, sucursal_id, cantidad, stock_maximo'),
    sb.from('productos_catalogo').select('id, sku, nombre, laboratorio, precio_costo_promedio, droguerias_preferidas').eq('activo', true),
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
  ])

  const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const stockMap = new Map<string, { cant: number; max: number | null }>()
  for (const s of (stock ?? []) as any[]) stockMap.set(`${s.producto_id}|${s.sucursal_id}`, { cant: Number(s.cantidad), max: s.stock_maximo == null ? null : Number(s.stock_maximo) })
  const sucName = (id: string) => ((sucs ?? []) as any[]).find((s) => s.id === id)?.nombre ?? id.slice(0, 6)

  const rows: RepoRow[] = ((rot ?? []) as any[]).map((r) => {
    const p = prodMap.get(r.producto_id)
    const k = `${r.producto_id}|${r.sucursal_id}`
    const st = stockMap.get(k)
    const venta30 = Number(r.venta_diaria_prom_30d ?? 0)
    return {
      producto_id: r.producto_id, sku: p?.sku ?? null, nombre: p?.nombre ?? '—', laboratorio: p?.laboratorio ?? null,
      sucursal_id: r.sucursal_id, sucursal: sucName(r.sucursal_id),
      stock: st?.cant ?? 0, stockMax: st?.max ?? null, ventaDia: venta30,
      diasRestantes: r.dias_stock_restante == null ? null : Number(r.dias_stock_restante),
      costo: Number(p?.precio_costo_promedio ?? 0),
      drogueria: (p?.droguerias_preferidas?.[0] as string | undefined) ?? null,
    }
  }).filter((r) => r.ventaDia > 0 || r.stock > 0)

  return (
    <>
      <PageHeader title="Reposición" description="NORA sugiere qué comprar por sucursal según rotación y cobertura objetivo."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Reposición' }]} />
      <div className="p-4 md:p-6">
        <ReposicionClient rows={rows} sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo }))} />
      </div>
    </>
  )
}
