import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { RecepcionMercaderia } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { RecepcionEstadoBadge } from '@/components/hub/recepcion-estado-badge'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

type RecepcionRow = RecepcionMercaderia & {
  sucursales: { nombre: string | null } | null
  recepcion_items?: { count: number }[] | null
}

export default async function RecepcionesPage() {
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

  const { data: rawRows, error } = await sb
    .from('recepciones_mercaderia')
    .select('*, sucursales(nombre), recepcion_items(count)')
    .order('fecha_recepcion', { ascending: false })
    .limit(500)

  const rows = (rawRows ?? []) as RecepcionRow[]
  const canCreate = ['super_admin', 'gerente', 'administrativo', 'sucursal'].includes(
    profile.rol,
  )

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Recepciones de mercadería"
        description={`${rows.length} recepción${rows.length === 1 ? '' : 'es'}`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/recepciones/nueva">
                <Plus className="size-4" />
                Nueva recepción
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

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Remito</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    Sin recepciones cargadas.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const itemsCount = Array.isArray(r.recepcion_items)
                    ? r.recepcion_items[0]?.count ?? 0
                    : 0
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-bold">
                        <Link
                          href={`/hub/recepciones/${r.id}`}
                          className="hover:underline"
                        >
                          {r.numero_remito || '— sin remito —'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(r.fecha_recepcion).toLocaleString('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.sucursales?.nombre || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {itemsCount}
                      </TableCell>
                      <TableCell>
                        <RecepcionEstadoBadge estado={r.estado} />
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/hub/recepciones/${r.id}`}>
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
    </HubShell>
  )
}
