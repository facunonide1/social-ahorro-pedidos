import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils/format'
import { Package, FileText, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Seguimiento de órdenes' }

/**
 * LAS TRES PUNTAS: LO PEDIDO, LO RECIBIDO Y LO FACTURADO.
 *
 * La situación de cada orden sale de comparar los tres números, no de un estado
 * que alguien tiene que acordarse de cambiar. Un estado a mano se olvida; una
 * comparación no.
 */
export default async function SeguimientoPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const { filas } = await paginar<any>(
    sb.from('ordenes_esperando_mercaderia').select('*').order('created_at', { ascending: false }),
    { maximo: 2000 },
  )

  const esperando = filas.filter((f) => f.situacion === 'esperando la mercaderia')
  const sinFactura = filas.filter((f) => f.situacion === 'llego, falta la factura')
  const noCoincide = filas.filter((f) => f.situacion === 'lo facturado no coincide con lo pedido')

  return (
    <>
      <PageHeader
        title="Seguimiento de órdenes"
        description="Lo pedido contra lo recibido contra lo facturado."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Órdenes', href: '/admin/compras/ordenes' }, { label: 'Seguimiento' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Órdenes emitidas" value={filas.length} icon={FileText} />
          <KpiCard label="Esperando mercadería" value={esperando.length} icon={Package}
            variant={esperando.length > 0 ? 'warning' : 'default'} />
          <KpiCard label="Llegó, falta la factura" value={sinFactura.length} icon={FileText}
            variant={sinFactura.length > 0 ? 'warning' : 'default'} />
          <KpiCard label="Lo facturado no coincide" value={noCoincide.length} icon={AlertTriangle}
            variant={noCoincide.length > 0 ? 'danger' : 'default'} />
        </div>

        {filas.length === 0 && (
          <Alert>
            <AlertDescription className="text-xs leading-snug">
              <b>No hay ninguna orden emitida todavía.</b> Cuando se emita una, acá se ve qué se
              pidió, qué llegó y qué se facturó, y las diferencias entre las tres. La recepción de
              v0.93 es la que cierra el círculo: al recibir se elige la orden que corresponde.
            </AlertDescription>
          </Alert>
        )}

        {filas.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Orden</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Pedido</th>
                  <th className="px-3 py-2 text-right">Recibido</th>
                  <th className="px-3 py-2 text-right">Facturado</th>
                  <th className="px-3 py-2">Situación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.orden_id}>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{f.codigo}</div>
                      <div className="text-xs text-muted-foreground">hace {f.dias_desde_emision} días</div>
                    </td>
                    <td className="px-3 py-2">{f.proveedor ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(f.unidades_pedidas).toLocaleString('es-AR')} u
                      <div className="text-xs text-muted-foreground">{formatARS(Number(f.total_estimado ?? 0))}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(f.recepciones) === 0
                        ? <span className="text-xs text-muted-foreground">nada</span>
                        : `${Number(f.unidades_recibidas).toLocaleString('es-AR')} u`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(f.facturas) === 0
                        ? <span className="text-xs text-muted-foreground">sin factura</span>
                        : formatARS(Number(f.facturado ?? 0))}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={f.situacion === 'cerrada' ? 'outline'
                        : f.situacion.startsWith('lo facturado') ? 'destructive' : 'warning'}
                        className="text-[10px]">
                        {f.situacion}
                      </Badge>
                    </td>
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
