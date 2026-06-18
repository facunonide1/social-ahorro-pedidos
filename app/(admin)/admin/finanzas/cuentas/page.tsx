import Link from 'next/link'
import { ArrowRight, Landmark, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { CuentaBancariaConSaldo } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function CuentasBancariasPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const { data: rawRows, error } = await sb
    .from('cuentas_bancarias_con_saldo')
    .select('*')
    .order('activa', { ascending: false })
    .order('nombre', { ascending: true })

  const cuentas = (rawRows ?? []) as CuentaBancariaConSaldo[]
  const canCreate = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)

  const saldoARS = cuentas
    .filter((c) => c.moneda === 'ARS' && c.activa)
    .reduce((a, c) => a + Number(c.saldo_actual || 0), 0)
  const saldoUSD = cuentas
    .filter((c) => c.moneda === 'USD' && c.activa)
    .reduce((a, c) => a + Number(c.saldo_actual || 0), 0)

  return (
    <>
      <PageHeader
        title="Cuentas bancarias"
        description={`${cuentas.length} cuenta${cuentas.length === 1 ? '' : 's'}`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/admin/finanzas/cuentas/nueva">
                <Plus className="size-4" />
                Nueva cuenta
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
                  Aplicá la migración <code>0020_finanzas_cuentas_movimientos.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Saldo total ARS"
              value={saldoARS}
              format="currency"
              variant={saldoARS < 0 ? 'danger' : 'success'}
            />
            <KpiCard
              label="Saldo total USD"
              value={null}
              formattedValue={`US$ ${saldoUSD.toLocaleString('es-AR')}`}
              format="custom"
            />
            <KpiCard label="Cuentas activas" value={cuentas.filter((c) => c.activa).length} />
          </section>
        )}

        {!error && cuentas.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay cuentas bancarias cargadas.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((c) => (
            <CuentaCard key={c.id} cuenta={c} />
          ))}
        </div>
      </div>
    </>
  )
}

function CuentaCard({ cuenta: c }: { cuenta: CuentaBancariaConSaldo }) {
  const saldo = Number(c.saldo_actual || 0)
  return (
    <Link href={`/admin/finanzas/cuentas/${c.id}`} className="group">
      <Card
        className={cn(
          'h-full transition-colors hover:border-primary/40 hover:bg-accent/30',
          !c.activa && 'opacity-60',
        )}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Landmark className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{c.nombre}</div>
                <div className="text-xs text-muted-foreground">{c.banco}</div>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {c.moneda}
            </Badge>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Saldo actual
            </div>
            <div
              className={cn(
                'text-2xl font-bold tabular-nums tracking-tight',
                saldo < 0 ? 'text-destructive' : 'text-foreground',
              )}
            >
              {c.moneda === 'USD' ? 'US$ ' : '$ '}
              {saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {c.tipo_cuenta === 'cuenta_corriente' ? 'Cuenta corriente' : 'Caja de ahorro'}
              {c.alias ? ` · ${c.alias}` : ''}
            </span>
            <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
              Ver
              <ArrowRight className="size-3" />
            </span>
          </div>
          {c.ultimo_movimiento_fecha && (
            <div className="text-[10px] text-muted-foreground">
              Último movimiento:{' '}
              {new Date(c.ultimo_movimiento_fecha).toLocaleDateString('es-AR')}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
