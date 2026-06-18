import { notFound } from 'next/navigation'
import Link from 'next/link'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { ProveedorCtaCte, type MovCtaCte } from './cta-cte-client'

export const dynamic = 'force-dynamic'

export default async function ProveedorFinanzasDetalle({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'] })
  const sb = createClient()

  const { data: prov } = await sb.from('proveedores').select('*').eq('id', params.id).maybeSingle<any>()
  if (!prov) notFound()

  const [{ data: facts }, { data: pagos }] = await Promise.all([
    sb.from('facturas_proveedor').select('id, numero_factura, tipo_documento, total, fecha_emision, fecha_vencimiento, estado').eq('proveedor_id', params.id).order('fecha_emision', { ascending: true }),
    sb.from('pagos').select('id, numero_orden_pago, monto_total, fecha_pago, origen_tipo').eq('proveedor_id', params.id).order('fecha_pago', { ascending: true }),
  ])

  // Movimientos de cuenta corriente: documentos (debe), notas de crédito (haber), pagos (haber)
  const movs: MovCtaCte[] = []
  for (const f of (facts ?? []) as any[]) {
    const esNC = f.tipo_documento === 'nota_credito'
    movs.push({ fecha: f.fecha_emision, tipo: esNC ? 'Nota de crédito' : 'Documento', detalle: `${f.tipo_documento} ${f.numero_factura ?? ''}`.trim(), debe: esNC ? 0 : Number(f.total), haber: esNC ? Number(f.total) : 0 })
  }
  for (const p of (pagos ?? []) as any[]) {
    movs.push({ fecha: p.fecha_pago, tipo: 'Pago', detalle: `OP ${p.numero_orden_pago ?? ''} · ${p.origen_tipo ?? ''}`.trim(), debe: 0, haber: Number(p.monto_total) })
  }
  movs.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
  let saldo = 0
  for (const m of movs) { saldo += m.debe - m.haber; m.saldo = Math.round(saldo) }
  const saldoFinal = Math.round(saldo)

  return (
    <>
      <PageHeader title={prov.razon_social} description={`CUIT ${prov.cuit}`}
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Proveedores', href: '/hub/finanzas/proveedores' }, { label: prov.razon_social }]} />
      <div className="space-y-4 p-4 md:p-6">
        <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Datos de pago</div>
            <Row k="CBU" v={prov.cbu ?? '—'} />
            <Row k="Alias" v={prov.alias_cbu ?? '—'} />
            <Row k="Banco" v={prov.banco ?? '—'} />
            <Row k="Forma de pago" v={prov.forma_pago_default ?? '—'} />
            <Row k="Condición" v={prov.plazo_pago_dias ? `${prov.plazo_pago_dias} días` : 'Contado'} />
            <Row k="Desc. pronto pago" v={prov.descuento_pronto_pago_pct ? `${prov.descuento_pronto_pago_pct}%` : '—'} />
            <Row k="Calificación" v={prov.calificacion_interna != null ? `${prov.calificacion_interna}/5` : '—'} />
            <div className="border-t border-border pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saldo cuenta corriente</div>
              <div className={saldoFinal > 0 ? 'mt-1 text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400' : 'mt-1 text-2xl font-semibold tabular-nums'}>
                {saldoFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
              </div>
              <div className="text-xs text-muted-foreground">{saldoFinal > 0 ? 'Le debés a este proveedor' : 'Sin deuda'}</div>
            </div>
            <Link href="/hub/finanzas/documentos" className="inline-block text-xs text-primary hover:underline">+ Nueva factura</Link>
          </div>

          <ProveedorCtaCte movimientos={movs} proveedor={prov.razon_social} />
        </section>
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
}
