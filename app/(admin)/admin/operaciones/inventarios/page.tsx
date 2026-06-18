import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { InventarioFisico } from '@/lib/types/admin'

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

import IniciarInventario from './iniciar'

export const dynamic = 'force-dynamic'

type Row = InventarioFisico & {
  sucursales: { nombre: string | null } | null
}

export default async function InventariosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
  })
  const sb = createClient()

  const [invRes, sucRes] = await Promise.all([
    sb
      .from('inventarios_fisicos')
      .select('*, sucursales(nombre)')
      .order('fecha_inventario', { ascending: false })
      .limit(200),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const rows = (invRes.data ?? []) as Row[]
  const sucursales = (sucRes.data ?? []) as { id: string; nombre: string }[]
  const canManage = ['super_admin', 'gerente', 'administrativo'].includes(profile.rol)

  return (
    <>
      <PageHeader
        title="Inventarios físicos"
        description={`${rows.length} inventario${rows.length === 1 ? '' : 's'} registrado${rows.length === 1 ? '' : 's'}`}
        actions={
          canManage ? <IniciarInventario sucursales={sucursales} /> : undefined
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {invRes.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {invRes.error.message}
              {invRes.error.message.includes('does not exist') && (
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

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Items contados</TableHead>
                <TableHead className="text-right">Diferencias</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin inventarios registrados.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.fecha_inventario).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.sucursales?.nombre || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total_items_contados}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.diferencias_detectadas > 0 ? (
                        <span className="font-semibold text-destructive">
                          {r.diferencias_detectadas}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.estado === 'cerrado' ? 'success' : 'warning'}
                      >
                        {r.estado === 'cerrado' ? 'Cerrado' : 'En curso'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/hub/operaciones/inventarios/${r.id}`}>
                          {r.estado === 'cerrado' ? 'Ver' : 'Contar'}
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
