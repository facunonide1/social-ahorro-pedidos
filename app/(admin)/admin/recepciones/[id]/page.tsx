import { notFound } from 'next/navigation'
import { Comprobantes } from '@/components/shared/comprobantes'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { RecepcionItem, RecepcionMercaderia } from '@/lib/types/admin'

import { RecepcionEstadoBadge } from '@/components/hub/recepcion-estado-badge'
import { KpiCard } from '@/components/cards/kpi-card'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type RecepcionDetail = RecepcionMercaderia & {
  sucursales: { nombre: string | null } | null
}

export default async function RecepcionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'administrativo',
      'sucursal',
      'auditor',
    ],
  })
  const sb = createClient()

  const [recRes, itemsRes] = await Promise.all([
    sb
      .from('recepciones_mercaderia')
      .select('*, sucursales(nombre)')
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('recepcion_items')
      .select('*')
      .eq('recepcion_id', params.id)
      .order('created_at', { ascending: true })
      .returns<RecepcionItem[]>(),
  ])

  const r = recRes.data as RecepcionDetail | null
  if (!r) notFound()
  const items = itemsRes.data ?? []

  const totales = items.reduce(
    (acc, it) => {
      acc.pedido += Number(it.cantidad_pedida ?? 0)
      acc.recibido += Number(it.cantidad_recibida ?? 0)
      acc.danado += Number(it.cantidad_danada ?? 0)
      return acc
    },
    { pedido: 0, recibido: 0, danado: 0 },
  )

  const titulo = r.numero_remito || 'Recepción sin remito'

  return (
    <>
      <PageHeader
        title={titulo}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {new Date(r.fecha_recepcion).toLocaleString('es-AR', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </span>
            {r.sucursales?.nombre && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span>{r.sucursales.nombre}</span>
              </>
            )}
          </span>
        }
        breadcrumbs={[
          { label: 'Recepciones', href: '/admin/recepciones' },
          { label: titulo },
        ]}
        actions={<RecepcionEstadoBadge estado={r.estado} />}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Items" value={items.length} />
          <KpiCard label="Total pedido" value={totales.pedido} />
          <KpiCard
            label="Total recibido"
            value={totales.recibido}
            variant="success"
          />
          <KpiCard
            label="Dañados"
            value={totales.danado}
            variant={totales.danado > 0 ? 'danger' : 'default'}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No se cargaron items.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Recibido</TableHead>
                    <TableHead className="text-right">Dañados</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const ped = Number(it.cantidad_pedida ?? 0)
                    const rec = Number(it.cantidad_recibida ?? 0)
                    const dan = Number(it.cantidad_danada ?? 0)
                    const dif = rec - ped
                    return (
                      <TableRow key={it.id}>
                        <TableCell>
                          {it.descripcion || '—'}
                          {it.observaciones && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {it.observaciones}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {it.cantidad_pedida ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {it.cantidad_recibida ?? '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            dan > 0 ? 'font-bold text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {dan}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {it.fecha_vencimiento_producto
                            ? new Date(it.fecha_vencimiento_producto).toLocaleDateString('es-AR')
                            : '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-bold tabular-nums',
                            ped === 0 && 'text-muted-foreground',
                            ped > 0 && dif === 0 && 'text-success',
                            ped > 0 && dif !== 0 && 'text-destructive',
                          )}
                        >
                          {ped === 0 ? '—' : dif === 0 ? '✓' : dif > 0 ? `+${dif}` : `${dif}`}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {r.observaciones && (
          <Alert variant="warning">
            <AlertTitle>Observaciones</AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">
              {r.observaciones}
            </AlertDescription>
          </Alert>
        )}

        <Comprobantes entidadTipo="recepcion" entidadId={params.id} titulo="Remito firmado / fotos" />
      </div>
    </>
  )
}
