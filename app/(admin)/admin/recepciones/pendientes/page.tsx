import Link from 'next/link'
import { FileText, PackageX, Clock, TrendingUp } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatARS } from '@/lib/utils/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pendientes con proveedores' }

/**
 * LO QUE QUEDÓ ABIERTO CON CADA PROVEEDOR.
 *
 * Dos colas distintas que hoy viven las dos en la memoria de alguien:
 *
 *   · Facturas fotografiadas que nadie revisó. Mientras estén acá, el costo de
 *     esa compra no existe: confirmarlas es lo que llena el histórico.
 *   · Faltantes y devoluciones esperando la nota de crédito.
 */
export default async function PendientesPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'encargado_sucursal', 'sucursal', 'auditor'],
  })
  const sb = createClient()

  const [{ filas: aRevisar }, { filas: pendientes }, { count: lineasCosto }] = await Promise.all([
    paginar<any>(sb.from('facturas_esperando_revision').select('*').order('fecha_recepcion'), { maximo: 2000 }),
    paginar<any>(sb.from('recepcion_pendientes').select('*').order('fecha_recepcion'), { maximo: 2000 }),
    sb.from('doc_precios_historial').select('id', { count: 'exact', head: true }),
  ])

  const reclamado = pendientes.reduce((a, p) => a + Number(p.monto_reclamado ?? 0), 0)
  const viejos = pendientes.filter((p) => Number(p.dias_abierto) > 15).length

  return (
    <>
      <PageHeader
        title="Pendientes con proveedores"
        description="Facturas sin revisar y reclamos sin nota de crédito. Las dos colas que hoy son de memoria."
        breadcrumbs={[{ label: 'Recepciones', href: '/admin/recepciones' }, { label: 'Pendientes' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Facturas sin revisar" value={aRevisar.length} icon={FileText}
            variant={aRevisar.length > 0 ? 'warning' : 'default'}
            href="/admin/finanzas/documentos" />
          <KpiCard label="Reclamos abiertos" value={pendientes.length} icon={PackageX}
            variant={pendientes.length > 0 ? 'warning' : 'default'} />
          <KpiCard label="Abiertos hace más de 15 días" value={viejos} icon={Clock}
            variant={viejos > 0 ? 'danger' : 'default'} />
          {/* Cero líneas de costo con cero facturas confirmadas no es un
              problema del histórico: es que todavía no entró ninguna. */}
          <KpiCard label="Líneas en el histórico de costos" icon={TrendingUp}
            value={lineasCosto ?? 0}
            href="/admin/compras/costos"
            footer={(lineasCosto ?? 0) === 0
              ? 'Se llena al confirmar una factura, no al sacarle la foto.'
              : undefined} />
        </div>

        {(lineasCosto ?? 0) === 0 && (
          <Alert>
            <AlertDescription className="text-xs leading-snug">
              <b>El histórico de costos está vacío y no le falta nada para funcionar.</b> El motor
              de documentos escribe cada costo al confirmar la factura, en la misma transacción que
              la deuda. Lo que falta es que entre la primera factura: sacarle la foto en la
              recepción y después revisarla.
            </AlertDescription>
          </Alert>
        )}

        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Facturas fotografiadas que nadie revisó
          </h2>
          {aRevisar.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna esperando.</p>
          ) : (
            <div className="space-y-2">
              {aRevisar.map((f) => (
                <div key={f.comprobante_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{f.proveedor ?? 'sin proveedor'}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.sucursal ?? 'sin sucursal'} · recibida hace {f.dias_esperando} días
                      {f.confianza_global != null && <> · el motor leyó con {Math.round(Number(f.confianza_global) * 100)}% de confianza</>}
                    </div>
                  </div>
                  {Number(f.dias_esperando) > 7 && (
                    <Badge variant="warning" className="text-[10px]">hace más de una semana</Badge>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/finanzas/documentos/revision/${f.extraccion_id}`}>Revisar</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Faltantes y devoluciones sin nota de crédito
            {reclamado > 0 && <span className="ml-2 font-normal normal-case">· {formatARS(reclamado)} reclamados</span>}
          </h2>
          {pendientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguno abierto. Cuando en una recepción se marque que faltó algo, aparece acá hasta
              que llegue la nota de crédito.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Qué pasó</th>
                    <th className="px-3 py-2 text-right">Reclamado</th>
                    <th className="px-3 py-2 text-right">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendientes.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{p.proveedor ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div>{p.producto ?? '—'}</div>
                        {p.sku && <div className="text-xs text-muted-foreground">SKU {p.sku}</div>}
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{p.estado}</Badge></td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.monto_reclamado == null ? '—' : formatARS(Number(p.monto_reclamado))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.dias_abierto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
