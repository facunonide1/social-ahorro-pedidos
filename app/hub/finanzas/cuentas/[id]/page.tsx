import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { TIPO_MOVIMIENTO_LABELS } from '@/lib/types/admin'
import type {
  CuentaBancariaConSaldo,
  CuentaBancariaPropia,
  MovimientoBancario,
} from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
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
import { cn } from '@/lib/utils'

import CuentaForm from '../nueva/form'
import MovimientoForm from './movimiento-form'

export const dynamic = 'force-dynamic'

const SIGNO: Record<string, number> = {
  ingreso: 1,
  ajuste: 1,
  egreso: -1,
  transferencia: -1,
}

export default async function CuentaDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
  })
  const sb = createClient()
  const tab = searchParams.tab === 'datos' ? 'datos' : 'movimientos'

  const [cuentaRes, movsRes] = await Promise.all([
    sb
      .from('cuentas_bancarias_con_saldo')
      .select('*')
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('movimientos_bancarios')
      .select('*')
      .eq('cuenta_bancaria_id', params.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const c = cuentaRes.data as CuentaBancariaConSaldo | null
  if (!c) notFound()

  const movimientos = (movsRes.data ?? []) as MovimientoBancario[]
  const canEdit = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)
  const saldo = Number(c.saldo_actual || 0)
  const simbolo = c.moneda === 'USD' ? 'US$ ' : '$ '

  const ingresos = movimientos
    .filter((m) => SIGNO[m.tipo] > 0)
    .reduce((a, m) => a + Number(m.monto), 0)
  const egresos = movimientos
    .filter((m) => SIGNO[m.tipo] < 0)
    .reduce((a, m) => a + Number(m.monto), 0)

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={c.nombre}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{c.banco}</span>
            <span className="text-muted-foreground/70">·</span>
            <span>
              {c.tipo_cuenta === 'cuenta_corriente'
                ? 'Cuenta corriente'
                : 'Caja de ahorro'}
            </span>
            {c.cbu && (
              <>
                <span className="text-muted-foreground/70">·</span>
                <span className="font-mono text-xs">CBU {c.cbu}</span>
              </>
            )}
          </span>
        }
        breadcrumbs={[
          { label: 'Cuentas bancarias', href: '/hub/finanzas/cuentas' },
          { label: c.nombre },
        ]}
        actions={
          <Badge variant={c.activa ? 'success' : 'outline'}>
            {c.activa ? 'Activa' : 'Inactiva'}
          </Badge>
        }
        tabs={[
          { label: 'Movimientos', href: `/hub/finanzas/cuentas/${c.id}` },
          { label: 'Datos', href: `/hub/finanzas/cuentas/${c.id}?tab=datos` },
        ]}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Saldo actual"
            value={null}
            formattedValue={`${simbolo}${saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
            format="custom"
            variant={saldo < 0 ? 'danger' : 'success'}
          />
          <KpiCard
            label="Ingresos (vista)"
            value={null}
            formattedValue={`${simbolo}${ingresos.toLocaleString('es-AR')}`}
            format="custom"
          />
          <KpiCard
            label="Egresos (vista)"
            value={null}
            formattedValue={`${simbolo}${egresos.toLocaleString('es-AR')}`}
            format="custom"
          />
          <KpiCard label="Movimientos" value={movimientos.length} />
        </section>

        {tab === 'movimientos' && (
          <>
            {canEdit && <MovimientoForm cuentaId={c.id} />}
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-center">Conc.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Sin movimientos cargados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimientos.map((m) => {
                      const signo = SIGNO[m.tipo] ?? 1
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted-foreground">
                            {new Date(m.fecha).toLocaleDateString('es-AR')}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-xs font-medium',
                                signo > 0 ? 'text-success' : 'text-destructive',
                              )}
                            >
                              {signo > 0 ? (
                                <ArrowDownLeft className="size-3.5" />
                              ) : (
                                <ArrowUpRight className="size-3.5" />
                              )}
                              {TIPO_MOVIMIENTO_LABELS[m.tipo]}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {m.categoria || '—'}
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">
                            {m.descripcion || m.referencia || '—'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-semibold tabular-nums',
                              signo > 0 ? 'text-success' : 'text-destructive',
                            )}
                          >
                            {signo > 0 ? '+' : '-'}
                            {simbolo}
                            {Number(m.monto).toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-center">
                            {m.conciliado && (
                              <Check
                                className="mx-auto size-4 text-success"
                                aria-label="Conciliado"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
            <p className="text-xs text-muted-foreground">
              Se muestran los últimos 200 movimientos. La conciliación se hace
              desde{' '}
              <Link
                href="/hub/finanzas/conciliacion"
                className="text-primary hover:underline"
              >
                Finanzas · Conciliación
              </Link>
              .
            </p>
          </>
        )}

        {tab === 'datos' && (
          <CuentaForm mode="edit" initial={c as CuentaBancariaPropia} />
        )}
      </div>
    </HubShell>
  )
}
