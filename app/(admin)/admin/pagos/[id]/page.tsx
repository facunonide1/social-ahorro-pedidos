import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Comprobantes } from '@/components/shared/comprobantes'
import { ArrowRight, ExternalLink } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { METODO_PAGO_LABELS } from '@/lib/types/admin'
import type {
  FacturaEstado,
  Pago,
  TipoFactura,
} from '@/lib/types/admin'

import { FacturaEstadoBadge } from '@/components/hub/factura-estado-badge'
import { PagoEstadoBadge } from '@/components/hub/pago-estado-badge'
import { KpiCard } from '@/components/cards/kpi-card'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import PagoEstadoActions from './estado-actions'

export const dynamic = 'force-dynamic'

type PagoDetail = Pago & {
  proveedores: { razon_social: string | null; cuit: string | null } | null
}

type FacturaApl = {
  id: string
  tipo_factura: TipoFactura
  punto_venta: string
  numero_factura: string
  fecha_emision: string
  fecha_vencimiento: string
  total: number
  estado: FacturaEstado
}

type AplicacionRaw = {
  monto_aplicado: number
  facturas_proveedor: FacturaApl | FacturaApl[] | null
}

type Aplicacion = {
  monto_aplicado: number
  factura: FacturaApl | null
}

export default async function PagoDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
  })
  const sb = createClient()

  const [pagoRes, aplicRes] = await Promise.all([
    sb
      .from('pagos')
      .select('*, proveedores(razon_social, cuit)')
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('pago_facturas')
      .select(
        'monto_aplicado, facturas_proveedor(id, tipo_factura, punto_venta, numero_factura, fecha_emision, fecha_vencimiento, total, estado)',
      )
      .eq('pago_id', params.id),
  ])

  const p = pagoRes.data as PagoDetail | null
  if (!p) notFound()

  const aplicacionesRaw = (aplicRes.data ?? []) as AplicacionRaw[]
  const aplicaciones: Aplicacion[] = aplicacionesRaw.map((a) => ({
    monto_aplicado: a.monto_aplicado,
    factura: Array.isArray(a.facturas_proveedor)
      ? a.facturas_proveedor[0] ?? null
      : a.facturas_proveedor,
  }))

  const canEdit = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)
  const numeroOP = p.numero_orden_pago || '— sin OP —'

  return (
    <>
      <PageHeader
        title={numeroOP}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{p.proveedores?.razon_social || '—'}</span>
            <span className="text-muted-foreground/70">·</span>
            <span className="font-mono text-xs">CUIT {p.proveedores?.cuit || '—'}</span>
          </span>
        }
        breadcrumbs={[
          { label: 'Pagos', href: '/hub/pagos' },
          { label: numeroOP },
        ]}
        actions={<PagoEstadoBadge estado={p.estado} />}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Monto total" value={Number(p.monto_total)} format="currency" />
          <KpiCard
            label="Retenciones"
            value={Number(p.retenciones_aplicadas)}
            format="currency"
            variant="danger"
          />
          <KpiCard
            label="Monto neto"
            value={Number(p.monto_neto)}
            format="currency"
            variant="success"
          />
          <KpiCard
            label="Fecha"
            value={null}
            formattedValue={new Date(p.fecha_pago).toLocaleDateString('es-AR')}
            format="custom"
          />
          <KpiCard
            label="Método"
            value={null}
            formattedValue={METODO_PAGO_LABELS[p.metodo_pago]}
            format="custom"
            variant="warning"
          />
        </section>

        {canEdit && <PagoEstadoActions pagoId={p.id} currentEstado={p.estado} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Datos de la OP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Cuenta / Referencia" value={p.cuenta_bancaria_origen || '—'} />
            <DetailRow label="Moneda" value={p.moneda || 'ARS'} />
            <DetailRow
              label="Comprobante"
              value={
                p.comprobante_url ? (
                  <a
                    href={p.comprobante_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Ver comprobante
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  '—'
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Facturas aplicadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aplicaciones.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Sin facturas aplicadas (pago sin asignar a comprobantes específicos).
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comprobante</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Total factura</TableHead>
                    <TableHead className="text-right">Aplicado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aplicaciones.map((a, i) => {
                    const f = a.factura
                    if (!f) return null
                    return (
                      <TableRow key={f.id || i}>
                        <TableCell className="font-mono text-xs">
                          {f.tipo_factura} {f.punto_venta}-{f.numero_factura}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(f.fecha_vencimiento).toLocaleDateString('es-AR')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${Number(f.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          ${Number(a.monto_aplicado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <FacturaEstadoBadge estado={f.estado} />
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/hub/facturas/${f.id}`}>
                              Ver
                              <ArrowRight className="size-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {p.observaciones && (
          <Alert variant="warning">
            <AlertTitle>Observaciones</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">
              {p.observaciones}
            </AlertDescription>
          </Alert>
        )}
        <Comprobantes entidadTipo="pago" entidadId={params.id} />
      </div>
    </>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-2 last:border-b-0 sm:grid-cols-[200px_1fr] sm:items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
