import Link from 'next/link'
import { Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Cheque } from '@/lib/types/admin'

import { ChequeEstadoBadge } from '@/components/hub/cheque-estado-badge'
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

export const dynamic = 'force-dynamic'

type ChequeRow = Cheque & {
  proveedores: { razon_social: string | null } | null
}

const TABS = [
  { key: '', label: 'Todos' },
  { key: 'emitidos', label: 'Emitidos' },
  { key: 'recibidos', label: 'Recibidos' },
  { key: 'en_cartera', label: 'En cartera' },
  { key: 'vencidos', label: 'Vencidos' },
] as const

export default async function ChequesPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
  })
  const sb = createClient()
  const tab = (searchParams.tab || '').trim()

  let query = sb
    .from('cheques')
    .select('*, proveedores(razon_social)')
    .order('fecha_cobro_estimada', { ascending: true, nullsFirst: false })
    .limit(500)

  const hoy = new Date().toISOString().slice(0, 10)
  if (tab === 'emitidos') query = query.eq('tipo', 'emitido')
  else if (tab === 'recibidos') query = query.eq('tipo', 'recibido')
  else if (tab === 'en_cartera') query = query.eq('estado', 'en_cartera')
  else if (tab === 'vencidos') {
    query = query
      .lt('fecha_cobro_estimada', hoy)
      .in('estado', ['emitido', 'en_cartera', 'depositado'])
  }

  const { data: rawRows, error } = await query
  const rows = (rawRows ?? []) as ChequeRow[]
  const canCreate = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)

  const totalCartera = rows
    .filter((r) => ['emitido', 'en_cartera', 'depositado'].includes(r.estado))
    .reduce((a, r) => a + Number(r.monto || 0), 0)

  return (
    <>
      <PageHeader
        title="Cheques"
        description={
          <>
            {rows.length} cheque{rows.length === 1 ? '' : 's'} · en circulación $
            {totalCartera.toLocaleString('es-AR')}
          </>
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/finanzas/cheques/nueva">
                <Plus className="size-4" />
                Nuevo cheque
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración <code>0021_finanzas_cheques.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Button
              key={t.key}
              asChild
              size="sm"
              variant={tab === t.key ? 'default' : 'outline'}
              className="rounded-full"
            >
              <Link
                href={`/hub/finanzas/cheques${t.key ? `?tab=${t.key}` : ''}`}
              >
                {t.label}
              </Link>
            </Button>
          ))}
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Benef. / Emisor</TableHead>
                <TableHead>Emisión</TableHead>
                <TableHead>Cobro estim.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Sin cheques para este filtro.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs font-bold">
                      {r.numero}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.tipo === 'emitido' ? 'warning' : 'info'}
                        className="text-[10px]"
                      >
                        {r.tipo === 'emitido' ? 'Emitido' : 'Recibido'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.banco}</TableCell>
                    <TableCell>
                      {r.proveedores?.razon_social ||
                        r.beneficiario_o_emisor ||
                        '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.fecha_emision).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.fecha_cobro_estimada
                        ? new Date(r.fecha_cobro_estimada).toLocaleDateString('es-AR')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      ${Number(r.monto).toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell>
                      <ChequeEstadoBadge estado={r.estado} />
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
