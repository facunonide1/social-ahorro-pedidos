import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { FacturaEstado, FacturaProveedor } from '@/lib/types/admin'
import { vencimientoBadge } from '@/lib/admin-hub/factura'

import { FacturaEstadoBadge } from '@/components/hub/factura-estado-badge'
import { PageHeader } from '@/components/shared/page-header'
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

import FacturasFilters from './filters'

export const dynamic = 'force-dynamic'

const ALL_ESTADOS: FacturaEstado[] = [
  'borrador',
  'pendiente_aprobacion',
  'aprobada',
  'programada_pago',
  'pagada_parcial',
  'pagada',
  'vencida',
  'rechazada',
  'anulada',
]

type FacturaRow = FacturaProveedor & {
  proveedores: { razon_social: string | null } | null
  sucursales: { nombre: string | null } | null
}

const PAID_STATES: FacturaEstado[] = ['pagada', 'anulada', 'rechazada']

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: { q?: string; estado?: string; proveedor?: string; vence?: string }
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

  const q = (searchParams.q || '').trim()
  const estado = (searchParams.estado || '').trim()
  const proveedorId = (searchParams.proveedor || '').trim()
  const vence = (searchParams.vence || '').trim()

  let query = sb
    .from('facturas_proveedor')
    .select('*, proveedores(razon_social), sucursales(nombre)')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    .limit(500)

  if (estado) query = query.eq('estado', estado)
  if (proveedorId) query = query.eq('proveedor_id', proveedorId)
  if (q) {
    const like = `%${q}%`
    query = query.or(`numero_factura.ilike.${like},punto_venta.ilike.${like}`)
  }
  if (vence === 'hoy') {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const finHoy = new Date()
    finHoy.setHours(23, 59, 59, 999)
    query = query
      .gte('fecha_vencimiento', hoy.toISOString().slice(0, 10))
      .lte('fecha_vencimiento', finHoy.toISOString().slice(0, 10))
      .not('estado', 'in', '(pagada,anulada,rechazada)')
  } else if (vence === 'semana') {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const fin = new Date()
    fin.setDate(fin.getDate() + 7)
    query = query
      .gte('fecha_vencimiento', inicio.toISOString().slice(0, 10))
      .lte('fecha_vencimiento', fin.toISOString().slice(0, 10))
      .not('estado', 'in', '(pagada,anulada,rechazada)')
  } else if (vence === 'vencidas') {
    const hoy = new Date()
    query = query
      .lt('fecha_vencimiento', hoy.toISOString().slice(0, 10))
      .not('estado', 'in', '(pagada,anulada,rechazada)')
  }

  const { data: rawRows, error } = await query
  const rows = (rawRows ?? []) as FacturaRow[]

  const { data: proveedores } = await sb
    .from('proveedores')
    .select('id, razon_social')
    .eq('activo', true)
    .order('razon_social')

  const canCreate = ['super_admin', 'gerente', 'administrativo', 'tesoreria'].includes(
    profile.rol,
  )

  const total = rows.reduce((a, r) => a + Number(r.total || 0), 0)
  const pendientes = rows.filter((r) => !PAID_STATES.includes(r.estado))
  const totalPend = pendientes.reduce((a, r) => a + Number(r.total || 0), 0)

  return (
    <>
      <PageHeader
        title="Facturas de proveedor"
        description={
          <>
            {rows.length} factura{rows.length === 1 ? '' : 's'} · pendientes $
            {totalPend.toLocaleString('es-AR')} de ${total.toLocaleString('es-AR')}
          </>
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/facturas/nueva">
                <Plus className="size-4" />
                Nueva factura
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <FacturasFilters
          initialQ={q}
          initialEstado={estado}
          initialProveedor={proveedorId}
          initialVence={vence}
          estados={ALL_ESTADOS}
          proveedores={(proveedores ?? []) as { id: string; razon_social: string }[]}
        />

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comprobante</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Emisión</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    Sin facturas para los filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const venc = vencimientoBadge(r.fecha_vencimiento, r.estado)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={`/hub/facturas/${r.id}`}
                          className="font-bold hover:underline"
                        >
                          {r.tipo_factura} {String(r.punto_venta).padStart(5, '0')}-
                          {String(r.numero_factura).padStart(8, '0')}
                        </Link>
                      </TableCell>
                      <TableCell>{r.proveedores?.razon_social || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(r.fecha_emision).toLocaleDateString('es-AR')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span>
                          {new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')}
                        </span>
                        {venc && (
                          <Badge variant={venc.variant} className="ml-2 text-[10px]">
                            {venc.text}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        ${Number(r.total).toLocaleString('es-AR')}
                      </TableCell>
                      <TableCell>
                        <FacturaEstadoBadge estado={r.estado} />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/hub/facturas/${r.id}`}>
                            Ver
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  )
}
