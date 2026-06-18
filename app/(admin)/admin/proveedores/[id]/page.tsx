import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type {
  Proveedor,
  ProveedorContacto,
  ProveedorCuentaBancaria,
  ProveedorDocumento,
} from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'

import ProveedorEditor from './editor'
import ContactosSection from './contactos'
import CuentasSection from './cuentas'
import DocumentosSection from './documentos'
import { ProveedorCtaCte, type MovCtaCte } from './cta-cte-client'

export const dynamic = 'force-dynamic'

export default async function ProveedorDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'comprador',
      'administrativo',
      'tesoreria',
      'auditor',
    ],
  })

  const sb = createClient()

  const [provRes, contactosRes, cuentasRes, docsRes, factsRes, pagosRes] = await Promise.all([
    sb.from('proveedores').select('*').eq('id', params.id).maybeSingle<Proveedor>(),
    sb
      .from('proveedor_contactos')
      .select('*')
      .eq('proveedor_id', params.id)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true })
      .returns<ProveedorContacto[]>(),
    sb
      .from('proveedor_cuentas_bancarias')
      .select('*')
      .eq('proveedor_id', params.id)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true })
      .returns<ProveedorCuentaBancaria[]>(),
    sb
      .from('proveedor_documentos')
      .select('*')
      .eq('proveedor_id', params.id)
      .order('created_at', { ascending: false })
      .returns<ProveedorDocumento[]>(),
    sb
      .from('facturas_proveedor')
      .select('id, numero_factura, tipo_documento, total, fecha_emision, fecha_vencimiento, estado')
      .eq('proveedor_id', params.id)
      .order('fecha_emision', { ascending: true }),
    sb
      .from('pagos')
      .select('id, numero_orden_pago, monto_total, fecha_pago, origen_tipo')
      .eq('proveedor_id', params.id)
      .order('fecha_pago', { ascending: true }),
  ])

  const p = provRes.data
  if (!p) notFound()

  // Cuenta corriente: documentos (debe), notas de crédito y pagos (haber).
  const movs: MovCtaCte[] = []
  for (const f of (factsRes.data ?? []) as any[]) {
    const esNC = f.tipo_documento === 'nota_credito'
    movs.push({ fecha: f.fecha_emision, tipo: esNC ? 'Nota de crédito' : 'Documento', detalle: `${f.tipo_documento} ${f.numero_factura ?? ''}`.trim(), debe: esNC ? 0 : Number(f.total), haber: esNC ? Number(f.total) : 0 })
  }
  for (const pg of (pagosRes.data ?? []) as any[]) {
    movs.push({ fecha: pg.fecha_pago, tipo: 'Pago', detalle: `OP ${pg.numero_orden_pago ?? ''} · ${pg.origen_tipo ?? ''}`.trim(), debe: 0, haber: Number(pg.monto_total) })
  }
  movs.sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
  let saldo = 0
  for (const m of movs) { saldo += m.debe - m.haber; m.saldo = Math.round(saldo) }
  const saldoFinal = Math.round(saldo)

  const canEdit = ['super_admin', 'gerente', 'comprador', 'administrativo'].includes(
    profile.rol,
  )
  const canEditCuentas = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)

  return (
    <>
      <PageHeader
        title={p.razon_social}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs">CUIT {p.cuit}</span>
            {p.condicion_iva && <span>· {CONDICION_IVA_LABELS[p.condicion_iva]}</span>}
            {p.categoria && <span>· {p.categoria}</span>}
            {!p.activo && (
              <Badge variant="outline" className="ml-1">
                Inactivo
              </Badge>
            )}
          </span>
        }
        breadcrumbs={[
          { label: 'Proveedores', href: '/admin/proveedores' },
          { label: p.razon_social },
        ]}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <ProveedorEditor initial={p} readOnly={!canEdit} />

        <ContactosSection
          proveedorId={p.id}
          initial={contactosRes.data ?? []}
          readOnly={!canEdit}
        />

        <CuentasSection
          proveedorId={p.id}
          initial={cuentasRes.data ?? []}
          readOnly={!canEditCuentas}
        />

        <DocumentosSection
          proveedorId={p.id}
          initial={docsRes.data ?? []}
          readOnly={!canEdit}
        />

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Cuenta corriente
            </h2>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Saldo: </span>
              <span className={saldoFinal > 0 ? 'font-semibold tabular-nums text-rose-600 dark:text-rose-400' : 'font-semibold tabular-nums'}>
                {saldoFinal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">{saldoFinal > 0 ? '(le debés)' : '(sin deuda)'}</span>
            </div>
          </div>
          <ProveedorCtaCte movimientos={movs} proveedor={p.razon_social} />
        </section>
      </div>
    </>
  )
}
