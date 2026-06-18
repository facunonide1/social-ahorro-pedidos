import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ESTADO_TRANSFERENCIA_LABELS } from '@/lib/types/admin'
import type { EstadoTransferencia, TransferenciaSucursal } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { NoraCard } from '@/components/nora/nora-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const dynamic = 'force-dynamic'

type Row = TransferenciaSucursal & {
  origen: { nombre: string | null } | null
  destino: { nombre: string | null } | null
}

const ESTADO_VARIANT: Record<
  EstadoTransferencia,
  React.ComponentProps<typeof Badge>['variant']
> = {
  solicitada: 'warning',
  aprobada: 'info',
  en_transito: 'info',
  recibida: 'success',
  cancelada: 'outline',
}

export default async function TransferenciasPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const { data: rawRows, error } = await sb
    .from('transferencias_sucursal')
    .select(
      '*, origen:sucursales!transferencias_sucursal_sucursal_origen_id_fkey(nombre), destino:sucursales!transferencias_sucursal_sucursal_destino_id_fkey(nombre)',
    )
    .order('fecha_solicitud', { ascending: false })
    .limit(300)

  const rows = (rawRows ?? []) as Row[]

  // Redistribuciones sugeridas: excedente (>45d) en una sucursal, faltante (<10d) en otra.
  const [{ data: rot }, { data: stk }, { data: prods }, { data: sucsList }] = await Promise.all([
    sb.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d, dias_stock_restante'),
    sb.from('stock_items').select('producto_id, sucursal_id, cantidad'),
    sb.from('productos_catalogo').select('id, nombre, sku'),
    sb.from('sucursales').select('id, nombre').eq('activa', true),
  ])
  const sucN = new Map(((sucsList ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const prodN = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const stkMap = new Map(((stk ?? []) as any[]).map((s) => [`${s.producto_id}|${s.sucursal_id}`, Number(s.cantidad)]))
  const porProd = new Map<string, { suc: string; dias: number | null; venta: number }[]>()
  for (const r of (rot ?? []) as any[]) {
    const a = porProd.get(r.producto_id) ?? []
    a.push({ suc: r.sucursal_id, dias: r.dias_stock_restante == null ? null : Number(r.dias_stock_restante), venta: Number(r.venta_diaria_prom_30d ?? 0) })
    porProd.set(r.producto_id, a)
  }
  const redis: { producto: string; sku: string | null; desde: string; hacia: string; cantidad: number }[] = []
  for (const [pid, arr] of porProd) {
    const exced = arr.find((x) => x.dias != null && x.dias > 45)
    const falt = arr.find((x) => x.dias != null && x.dias < 10 && x.venta > 0)
    if (!exced || !falt || exced.suc === falt.suc) continue
    const stockOrigen = stkMap.get(`${pid}|${exced.suc}`) ?? 0
    const stockDest = stkMap.get(`${pid}|${falt.suc}`) ?? 0
    const necesita = Math.max(0, Math.ceil(falt.venta * 15 - stockDest))
    const disponible = Math.max(0, Math.floor(stockOrigen - exced.venta * 15))
    const cantidad = Math.min(necesita, disponible)
    if (cantidad > 0) redis.push({ producto: prodN.get(pid)?.nombre ?? '—', sku: prodN.get(pid)?.sku ?? null, desde: sucN.get(exced.suc) ?? '—', hacia: sucN.get(falt.suc) ?? '—', cantidad })
  }
  redis.sort((a, b) => b.cantidad - a.cantidad)

  return (
    <>
      <PageHeader
        title="Transferencias entre sucursales"
        description={`${rows.length} transferencia${rows.length === 1 ? '' : 's'}`}
        actions={
          <Button asChild>
            <Link href="/admin/operaciones/transferencias/nueva">
              <Plus className="size-4" />
              Nueva transferencia
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración{' '}
                  <code>
                    0025_operaciones_transferencias_inventarios_devoluciones.sql
                  </code>
                  .
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {redis.length > 0 && (
          <NoraCard contexto="redistribución">
            <p className="mb-2">Detecté <b>{redis.length}</b> redistribución{redis.length === 1 ? '' : 'es'} que equilibran stock entre sucursales:</p>
            <ul className="space-y-1.5">
              {redis.slice(0, 6).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span><b>{s.cantidad}u</b> de {s.producto} · {s.desde} → {s.hacia}</span>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs"><Link href="/admin/operaciones/transferencias/nueva">Crear</Link></Button>
                </li>
              ))}
            </ul>
          </NoraCard>
        )}

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solicitud</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin transferencias registradas.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.fecha_solicitud).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.origen?.nombre || '—'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.destino?.nombre || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[r.estado]}>
                        {ESTADO_TRANSFERENCIA_LABELS[r.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/operaciones/transferencias/${r.id}`}>
                          Ver
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  )
}
