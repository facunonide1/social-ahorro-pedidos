import Link from 'next/link'
import { ArrowRight, Wallet } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import {
  ESTADO_CAJA_LABELS,
  type CajaDiaria,
  type Sucursal,
} from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AbrirCajaButton } from './abrir'

export const dynamic = 'force-dynamic'

function fmt(n: number): string {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export default async function CajaDiariaPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'administrativo',
      'tesoreria',
      'sucursal',
      'auditor',
    ],
  })
  const sb = createClient()

  const [{ data: cajaData, error }, { data: sucData }] = await Promise.all([
    sb
      .from('cajas_diarias')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(60),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const cajas = (cajaData ?? []) as CajaDiaria[]
  const sucursales = (sucData ?? []) as Pick<Sucursal, 'id' | 'nombre'>[]
  const sucById = new Map(sucursales.map((s) => [s.id, s.nombre]))
  const canOpen = ['super_admin', 'gerente', 'administrativo', 'tesoreria', 'sucursal'].includes(
    profile.rol,
  )

  const abiertas = cajas.filter((c) => c.estado === 'abierta')
  const enCaja = abiertas.reduce(
    (a, c) => a + Number(c.saldo_final_sistema || 0),
    0,
  )
  const difAcum = cajas
    .filter((c) => c.estado === 'cerrada' && c.diferencia != null)
    .reduce((a, c) => a + Number(c.diferencia || 0), 0)

  return (
    <>
      <PageHeader
        title="Caja diaria"
        description={`${cajas.length} caja${cajas.length === 1 ? '' : 's'} · ${abiertas.length} abierta${abiertas.length === 1 ? '' : 's'}`}
        breadcrumbs={[{ label: 'Sucursales' }, { label: 'Caja diaria' }]}
        actions={
          canOpen && sucursales.length > 0 ? (
            <AbrirCajaButton sucursales={sucursales} userId={profile.id} />
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
                  Aplicá la migración <code>0026_rrhh_caja_gastos.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Cajas abiertas" value={abiertas.length} />
            <KpiCard
              label="Efectivo en cajas abiertas"
              value={enCaja}
              format="currency"
            />
            <KpiCard
              label="Diferencias acumuladas"
              value={difAcum}
              format="currency"
              variant={difAcum !== 0 ? 'warning' : 'default'}
            />
          </section>
        )}

        {!error && cajas.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Wallet className="size-6" />
              </div>
              <div className="text-sm text-muted-foreground">
                Todavía no hay cajas registradas. Abrí la primera para empezar.
              </div>
            </CardContent>
          </Card>
        )}

        {!error && cajas.length > 0 && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {cajas.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/sucursales/caja/${c.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {sucById.get(c.sucursal_id) || 'Sucursal'}
                          </span>
                          <Badge
                            variant={
                              c.estado === 'abierta' ? 'success' : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {ESTADO_CAJA_LABELS[c.estado]}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(c.fecha).toLocaleDateString('es-AR')}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Saldo sistema
                          </div>
                          <div className="text-sm font-bold tabular-nums">
                            {fmt(c.saldo_final_sistema)}
                          </div>
                        </div>
                        {c.estado === 'cerrada' && c.diferencia != null && (
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Diferencia
                            </div>
                            <div
                              className={cn(
                                'text-sm font-bold tabular-nums',
                                Number(c.diferencia) === 0
                                  ? 'text-success'
                                  : 'text-warning',
                              )}
                            >
                              {fmt(c.diferencia)}
                            </div>
                          </div>
                        )}
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
