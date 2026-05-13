import Link from 'next/link'
import { Plus, ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { Proveedor } from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
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
import { cn } from '@/lib/utils'

import ProveedoresFilters from './filters'

export const dynamic = 'force-dynamic'

type ProveedorConStats = Proveedor & {
  facturas_count?: number
}

type ProveedorRowRaw = Proveedor & {
  facturas_count?: { count: number }[] | null
}

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: { q?: string; categoria?: string; activo?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const q = (searchParams.q || '').trim()
  const categoria = (searchParams.categoria || '').trim()
  const activoRaw = searchParams.activo
  const activoFilter: boolean | null =
    activoRaw === '1' ? true : activoRaw === '0' ? false : null

  let query = sb
    .from('proveedores')
    .select('*, facturas_count:facturas_proveedor(count)')
    .order('razon_social', { ascending: true })
    .limit(500)

  if (q) {
    const like = `%${q}%`
    query = query.or(
      `razon_social.ilike.${like},nombre_comercial.ilike.${like},cuit.ilike.${like}`,
    )
  }
  if (categoria) query = query.eq('categoria', categoria)
  if (activoFilter !== null) query = query.eq('activo', activoFilter)

  const { data: rawRows, error } = await query
  const rows: ProveedorConStats[] = ((rawRows ?? []) as ProveedorRowRaw[]).map((r) => ({
    ...r,
    facturas_count: Array.isArray(r.facturas_count) ? r.facturas_count[0]?.count ?? 0 : 0,
  }))

  const { data: catRows } = await sb
    .from('proveedores')
    .select('categoria')
    .not('categoria', 'is', null)
  const categorias = Array.from(
    new Set(
      ((catRows ?? []) as { categoria: string | null }[])
        .map((r) => r.categoria)
        .filter((v): v is string => Boolean(v)),
    ),
  ).sort()

  const canCreate = ['super_admin', 'gerente', 'comprador', 'administrativo'].includes(
    profile.rol,
  )
  const hasFilters = q || categoria || activoFilter !== null

  return (
    <HubShell profile={profile}>
      <PageHeader
        title="Proveedores"
        description={
          <>
            {rows.length} resultado{rows.length === 1 ? '' : 's'}
            {q ? ` para "${q}"` : ''}
          </>
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/proveedores/nuevo">
                <Plus className="size-4" />
                Nuevo proveedor
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

        <ProveedoresFilters
          initialQ={q}
          initialCategoria={categoria}
          initialActivo={activoRaw ?? ''}
          categorias={categorias}
        />

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razón social</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Cond. IVA</TableHead>
                <TableHead className="text-right">Plazo</TableHead>
                <TableHead className="text-right">Facturas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    {hasFilters
                      ? 'Sin coincidencias con los filtros actuales.'
                      : 'Todavía no hay proveedores cargados.'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id} className={cn(!p.activo && 'opacity-60')}>
                    <TableCell className="font-semibold">
                      <Link
                        href={`/hub/proveedores/${p.id}`}
                        className="hover:underline"
                      >
                        {p.razon_social}
                      </Link>
                      {p.nombre_comercial && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {p.nombre_comercial}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.cuit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.categoria || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.condicion_iva ? CONDICION_IVA_LABELS[p.condicion_iva] : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.plazo_pago_dias}d
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {p.facturas_count ?? 0}
                    </TableCell>
                    <TableCell>
                      {p.activo ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="outline">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/hub/proveedores/${p.id}`}>
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
    </HubShell>
  )
}
