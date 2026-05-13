import { notFound } from 'next/navigation'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type {
  FacturaItem,
  FacturaProveedor,
  PagoEstado,
} from '@/lib/types/admin'
import { vencimientoBadge } from '@/lib/admin-hub/factura'

import { HubShell } from '@/components/hub/hub-shell'
import { FacturaEstadoBadge } from '@/components/hub/factura-estado-badge'
import { KpiCard } from '@/components/cards/kpi-card'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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

import EstadoActions from './estado-actions'

export const dynamic = 'force-dynamic'

type FacturaDetail = FacturaProveedor & {
  proveedores: { razon_social: string | null; cuit: string | null } | null
  sucursales: { nombre: string | null } | null
}

type AplicacionRaw = {
  monto_aplicado: number
  pagos:
    | {
        id: string
        numero_orden_pago: string | null
        fecha_pago: string
        estado: PagoEstado
      }
    | {
        id: string
        numero_orden_pago: string | null
        fecha_pago: string
        estado: PagoEstado
      }[]
    | null
}

type Aplicacion = {
  monto_aplicado: number
  pago: {
    id: string
    numero_orden_pago: string | null
    fecha_pago: string
    estado: PagoEstado
  } | null
}

export default async function FacturaDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'administrativo',
      'tesoreria',
      'auditor',
      'sucursal',
    ],
  })
  const sb = createClient()

  const [facRes, itemsRes, aplicRes] = await Promise.all([
    sb
      .from('facturas_proveedor')
      .select('*, proveedores(razon_social, cuit), sucursales(nombre)')
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('factura_items')
      .select('*')
      .eq('factura_id', params.id)
      .order('created_at', { ascending: true })
      .returns<FacturaItem[]>(),
    sb
      .from('pago_facturas')
      .select('monto_aplicado, pagos(id, numero_orden_pago, fecha_pago, estado)')
      .eq('factura_id', params.id),
  ])

  const f = facRes.data as FacturaDetail | null
  if (!f) notFound()

  const items = itemsRes.data ?? []
  const aplicacionesRaw = (aplicRes.data ?? []) as AplicacionRaw[]
  const aplicaciones: Aplicacion[] = aplicacionesRaw.map((a) => ({
    monto_aplicado: a.monto_aplicado,
    pago: Array.isArray(a.pagos) ? a.pagos[0] ?? null : a.pagos,
  }))
  const pagado = aplicaciones.reduce((a, x) => a + Number(x.monto_aplicado || 0), 0)
  const saldo = Number(f.total) - pagado
  const venc = vencimientoBadge(f.fecha_vencimiento, f.estado)

  const canEditEstado = ['super_admin', 'gerente', 'administrativo', 'tesoreria'].includes(
    profile.rol,
  )

  const comprobante = `${f.tipo_factura} ${String(f.punto_venta).padStart(5, '0')}-${String(f.numero_factura).padStart(8, '0')}`

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={comprobante}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{f.proveedores?.razon_social || '—'}</span>
            <span className="text-muted-foreground/70">·</span>
            <span className="font-mono text-xs">CUIT {f.proveedores?.cuit || '—'}</span>
            {f.sucursales?.nombre && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span>{f.sucursales.nombre}</span>
              </>
            )}
          </span>
        }
        breadcrumbs={[
          { label: 'Facturas', href: '/hub/facturas' },
          { label: comprobante },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <FacturaEstadoBadge estado={f.estado} />
            {venc && <Badge variant={venc.variant}>{venc.text}</Badge>}
          </div>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Total" value={Number(f.total)} format="currency" />
          <KpiCard
            label="Pagado"
            value={pagado}
            format="currency"
            variant="success"
          />
          <KpiCard
            label="Saldo"
            value={saldo}
            format="currency"
            variant={saldo > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Emitida"
            value={null}
            formattedValue={new Date(f.fecha_emision).toLocaleDateString('es-AR')}
            format="custom"
          />
          <KpiCard
            label="Vence"
            value={null}
            formattedValue={new Date(f.fecha_vencimiento).toLocaleDateString('es-AR')}
            format="custom"
            variant="warning"
          />
        </section>

        {canEditEstado && <EstadoActions facturaId={f.id} currentEstado={f.estado} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Sin items cargados.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio unit.</TableHead>
                    <TableHead className="text-right">IVA %</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>{it.descripcion}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.cantidad}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${Number(it.precio_unitario).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.alicuota_iva}%
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        ${Number(it.subtotal).toLocaleString('es-AR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 p-4 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-right tabular-nums">
                ${Number(f.subtotal).toLocaleString('es-AR')}
              </span>
              {Number(f.iva_21) > 0 && (
                <>
                  <span className="text-muted-foreground">IVA 21%</span>
                  <span className="text-right tabular-nums">
                    ${Number(f.iva_21).toLocaleString('es-AR')}
                  </span>
                </>
              )}
              {Number(f.iva_105) > 0 && (
                <>
                  <span className="text-muted-foreground">IVA 10,5%</span>
                  <span className="text-right tabular-nums">
                    ${Number(f.iva_105).toLocaleString('es-AR')}
                  </span>
                </>
              )}
              {Number(f.iva_27) > 0 && (
                <>
                  <span className="text-muted-foreground">IVA 27%</span>
                  <span className="text-right tabular-nums">
                    ${Number(f.iva_27).toLocaleString('es-AR')}
                  </span>
                </>
              )}
              {Number(f.percepciones) > 0 && (
                <>
                  <span className="text-muted-foreground">Percepciones</span>
                  <span className="text-right tabular-nums">
                    +${Number(f.percepciones).toLocaleString('es-AR')}
                  </span>
                </>
              )}
              {Number(f.retenciones) > 0 && (
                <>
                  <span className="text-muted-foreground">Retenciones</span>
                  <span className="text-right tabular-nums text-destructive">
                    -${Number(f.retenciones).toLocaleString('es-AR')}
                  </span>
                </>
              )}
              <span className="mt-1 border-t border-border pt-2 text-base font-bold">
                TOTAL
              </span>
              <span className="mt-1 border-t border-border pt-2 text-right text-base font-bold tabular-nums">
                ${Number(f.total).toLocaleString('es-AR')}
              </span>
            </div>
          </CardContent>
        </Card>

        {aplicaciones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Pagos aplicados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {aplicaciones.map((a, i) => (
                <div
                  key={a.pago?.id ?? i}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={a.pago ? `/hub/pagos/${a.pago.id}` : '#'}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {a.pago?.numero_orden_pago || '(sin nro)'}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {a.pago?.fecha_pago
                        ? new Date(a.pago.fecha_pago).toLocaleDateString('es-AR')
                        : ''}
                      {a.pago?.estado ? ` · ${a.pago.estado}` : ''}
                    </div>
                  </div>
                  <div className="text-sm font-bold tabular-nums">
                    ${Number(a.monto_aplicado).toLocaleString('es-AR')}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {f.observaciones && (
          <Alert variant="warning">
            <AlertTitle>Observaciones</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">
              {f.observaciones}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </HubShell>
  )
}
