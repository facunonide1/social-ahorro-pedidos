import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Input } from '@/components/ui/input'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Proveedores · Finanzas' }

const ACTIVAS = '("pagada","anulada","rechazada","borrador")'

export default async function ProveedoresFinanzasPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'] })
  const sb = createClient()
  const d90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)

  const [{ data: provs }, { data: facts }, { data: pagos }] = await Promise.all([
    sb.from('proveedores').select('id, razon_social, nombre_comercial, cuit, forma_pago_default, plazo_pago_dias').eq('activo', true).order('razon_social'),
    sb.from('facturas_proveedor').select('proveedor_id, total, tipo_documento, estado, fecha_emision').limit(20000),
    sb.from('pagos').select('proveedor_id, monto_total').limit(20000),
  ])

  // Agregados por proveedor
  const debe = new Map<string, number>()       // documentos pendientes netos
  const comprado90 = new Map<string, number>()
  for (const f of (facts ?? []) as any[]) {
    const signo = f.tipo_documento === 'nota_credito' ? -1 : 1
    if (!['pagada', 'anulada', 'rechazada', 'borrador'].includes(f.estado)) {
      debe.set(f.proveedor_id, (debe.get(f.proveedor_id) ?? 0) + signo * Number(f.total))
    }
    if (f.fecha_emision >= d90 && f.tipo_documento !== 'nota_credito') {
      comprado90.set(f.proveedor_id, (comprado90.get(f.proveedor_id) ?? 0) + Number(f.total))
    }
  }
  const pagado = new Map<string, number>()
  for (const p of (pagos ?? []) as any[]) pagado.set(p.proveedor_id, (pagado.get(p.proveedor_id) ?? 0) + Number(p.monto_total))

  const rows = ((provs ?? []) as any[]).map((p) => {
    const saldo = (debe.get(p.id) ?? 0) - (pagado.get(p.id) ?? 0)
    return { ...p, saldo: Math.round(saldo), comprado: Math.round(comprado90.get(p.id) ?? 0) }
  }).sort((a, b) => b.saldo - a.saldo)

  const deudaTotal = rows.reduce((a, r) => a + Math.max(0, r.saldo), 0)
  const conDeuda = rows.filter((r) => r.saldo > 0).length

  return (
    <>
      <PageHeader title="Proveedores" description="Cuenta corriente y condiciones de pago por proveedor."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Proveedores' }]} />
      <div className="space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="Deuda total" value={deudaTotal} format="currency" />
          <KpiCard label="Proveedores con deuda" value={conDeuda} format="number" />
          <KpiCard label="Proveedores activos" value={rows.length} format="number" />
        </section>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
            <Building2 className="size-7 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Sin proveedores cargados.</div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">CUIT</th><th className="px-3 py-2">Pago</th><th className="px-3 py-2 text-right">Comprado 90d</th><th className="px-3 py-2 text-right">Le debés</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-1.5"><div className="font-medium">{p.razon_social}</div>{p.nombre_comercial && <div className="text-[10px] text-muted-foreground">{p.nombre_comercial}</div>}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{p.cuit}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.forma_pago_default ?? '—'}{p.plazo_pago_dias ? ` · ${p.plazo_pago_dias}d` : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatARS(p.comprado)}</td>
                    <td className={p.saldo > 0 ? 'px-3 py-1.5 text-right font-medium tabular-nums text-rose-600 dark:text-rose-400' : 'px-3 py-1.5 text-right tabular-nums text-muted-foreground'}>{formatARS(p.saldo)}</td>
                    <td className="px-3 py-1.5 text-right"><Link href={`/admin/finanzas/proveedores/${p.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Cta cte <ArrowRight className="size-3" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
