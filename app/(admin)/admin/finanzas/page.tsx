import Link from 'next/link'
import { FileText, AlertTriangle, CalendarClock, Landmark, ArrowRight } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { NoraCard } from '@/components/nora/nora-card'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Finanzas' }

const PENDIENTES = ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida']

type Venc = { tipo: string; nombre: string; fecha: string; monto: number; href: string }

export default async function FinanzasTableroPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const hoy = new Date().toISOString().slice(0, 10)
  const en7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  let factQ = sb.from('facturas_proveedor').select('id, numero_factura, total, fecha_vencimiento, estado, tipo_documento, proveedores(razon_social)').not('estado', 'in', '("pagada","anulada","rechazada","borrador")').limit(1000)
  if (!esTodas && sucursalId) factQ = factQ.eq('sucursal_id', sucursalId)

  const [{ data: facturas }, { data: gfi }, { data: imp }, { data: chq }, { data: movs }] = await Promise.all([
    factQ,
    sb.from('gastos_fijos_instancias').select('id, periodo, monto, vencimiento, estado, gastos_fijos(concepto)').eq('estado', 'pendiente').limit(500),
    sb.from('impuestos_obligaciones').select('id, tipo, descripcion, monto_estimado, monto_real, fecha_vencimiento, estado').not('estado', 'in', '("pagado")').limit(500),
    sb.from('cheques').select('id, numero, monto, fecha_cobro_estimada, estado, tipo').eq('tipo', 'emitido').not('estado', 'in', '("cobrado","anulado","rechazado")').limit(500),
    sb.from('movimientos_bancarios').select('tipo, monto').limit(20000),
  ])

  const facts = (facturas ?? []) as any[]
  // Deuda: documentos positivos − notas de crédito
  const deuda = facts.reduce((a, f) => a + (f.tipo_documento === 'nota_credito' ? -Number(f.total) : Number(f.total)), 0)
  const vencido = facts.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento < hoy && f.tipo_documento !== 'nota_credito').reduce((a, f) => a + Number(f.total), 0)
  const semana = facts.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento >= hoy && f.fecha_vencimiento <= en7 && f.tipo_documento !== 'nota_credito').reduce((a, f) => a + Number(f.total), 0)
  const saldoBancos = ((movs ?? []) as any[]).reduce((a, m) => a + (m.tipo === 'ingreso' ? Number(m.monto) : m.tipo === 'egreso' ? -Number(m.monto) : 0), 0)

  // Vencimientos unificados
  const venc: Venc[] = []
  for (const f of facts) if (f.fecha_vencimiento && f.tipo_documento !== 'nota_credito') venc.push({ tipo: 'Factura', nombre: `${f.proveedores?.razon_social ?? '—'} · ${f.numero_factura ?? ''}`, fecha: f.fecha_vencimiento, monto: Number(f.total), href: '/admin/finanzas/documentos' })
  for (const g of (gfi ?? []) as any[]) if (g.vencimiento) venc.push({ tipo: 'Gasto fijo', nombre: g.gastos_fijos?.concepto ?? 'Gasto fijo', fecha: g.vencimiento, monto: Number(g.monto ?? 0), href: '/admin/finanzas/gastos-fijos' })
  for (const i of (imp ?? []) as any[]) venc.push({ tipo: 'Impuesto', nombre: i.descripcion || i.tipo, fecha: i.fecha_vencimiento, monto: Number(i.monto_real ?? i.monto_estimado ?? 0), href: '/admin/finanzas/impuestos' })
  for (const c of (chq ?? []) as any[]) if (c.fecha_cobro_estimada) venc.push({ tipo: 'Cheque', nombre: `Cheque ${c.numero}`, fecha: c.fecha_cobro_estimada, monto: Number(c.monto), href: '/admin/finanzas/cheques' })
  venc.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const proximos = venc.slice(0, 25)

  return (
    <>
      <PageHeader title="Finanzas" description="Tablero de cuentas por pagar y tesorería."
        breadcrumbs={[{ label: 'Finanzas' }]} />
      <div className="space-y-5 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Deuda a proveedores" value={deuda} format="currency" icon={FileText} href="/admin/finanzas/documentos" />
          <KpiCard label="Vencido sin pagar" value={vencido} format="currency" icon={AlertTriangle} variant={vencido > 0 ? 'danger' : 'default'} href="/admin/finanzas/documentos" />
          <KpiCard label="Vence esta semana" value={semana} format="currency" icon={CalendarClock} variant={semana > 0 ? 'warning' : 'default'} href="/admin/finanzas/calendario" />
          <KpiCard label="Saldo en bancos" value={saldoBancos} format="currency" icon={Landmark} href="/admin/finanzas/cuentas" />
        </section>

        <NoraCard contexto="finanzas">
          {vencido > 0 ? (
            <p>Tenés <b>{formatARS(vencido)}</b> vencido sin pagar — regularizalo para evitar recargos y cuidar la relación con proveedores. Esta semana vencen <b>{formatARS(semana)}</b> más.</p>
          ) : semana > 0 ? (
            <p>Sin vencidos. Esta semana vencen <b>{formatARS(semana)}</b>: planificá los pagos en el calendario para no perder descuentos por pronto pago.</p>
          ) : (
            <p>Al día con los vencimientos. Deuda total a proveedores: <b>{formatARS(deuda)}</b>.</p>
          )}
        </NoraCard>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Próximos vencimientos</h2>
          {proximos.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin vencimientos próximos. Cargá documentos o el demo.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2" /></tr></thead>
                <tbody>
                  {proximos.map((v, i) => {
                    const vencido = v.fecha < hoy
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{v.tipo}</td>
                        <td className="px-3 py-1.5">{v.nombre}</td>
                        <td className={vencido ? 'px-3 py-1.5 font-medium text-rose-600 dark:text-rose-400' : 'px-3 py-1.5'}>{v.fecha}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(v.monto)}</td>
                        <td className="px-3 py-1.5 text-right"><Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href="/admin/finanzas/pagos">Pagar <ArrowRight className="size-3" /></Link></Button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
