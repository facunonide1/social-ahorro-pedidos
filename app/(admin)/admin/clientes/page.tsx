import Link from 'next/link'
import { ArrowRight, Plus, Users } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import {
  SEGMENTO_CLIENTE_LABELS,
  TIPO_CLIENTE_CRM_LABELS,
  type ClienteCrm,
  type SegmentoCliente,
} from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const SEGMENTO_VARIANT: Record<
  SegmentoCliente,
  'secondary' | 'success' | 'warning' | 'destructive' | 'info'
> = {
  nuevo: 'info',
  activo: 'success',
  en_riesgo: 'warning',
  dormido: 'destructive',
  vip: 'secondary',
}

export default async function ClientesCrmPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const { data, error } = await sb
    .from('clientes_crm')
    .select('*')
    .order('activo', { ascending: false })
    .order('razon_social', { ascending: true })

  const clientes = (data ?? []) as ClienteCrm[]
  const canCreate = ['super_admin', 'gerente', 'administrativo'].includes(
    profile.rol,
  )

  const activos = clientes.filter((c) => c.activo)
  const vip = activos.filter((c) => c.segmento === 'vip').length
  const enRiesgo = activos.filter(
    (c) => c.segmento === 'en_riesgo' || c.segmento === 'dormido',
  ).length
  const ltvTotal = activos.reduce((a, c) => a + Number(c.ltv || 0), 0)

  return (
    <>
      <PageHeader
        title="Clientes B2B"
        description={`${clientes.length} cliente${clientes.length === 1 ? '' : 's'} en el CRM`}
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes' }]}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/clientes/nuevo">
                <Plus className="size-4" />
                Nuevo cliente
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
                  Aplicá la migración <code>0029_clientes_crm.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Clientes activos" value={activos.length} />
            <KpiCard label="VIP" value={vip} variant="success" />
            <KpiCard
              label="En riesgo / dormidos"
              value={enRiesgo}
              variant={enRiesgo > 0 ? 'warning' : 'default'}
            />
            <KpiCard
              label="LTV acumulado"
              value={ltvTotal}
              format="currency"
            />
          </section>
        )}

        {!error && clientes.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="size-6" />
              </div>
              <div className="text-sm text-muted-foreground">
                Todavía no hay clientes B2B cargados.
              </div>
              {canCreate && (
                <Button asChild variant="outline">
                  <Link href="/hub/clientes/nuevo">
                    <Plus className="size-4" />
                    Cargar el primero
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {clientes.map((c) => (
            <Link key={c.id} href={`/hub/clientes/${c.id}`} className="group">
              <Card
                className={cn(
                  'h-full transition-colors hover:border-primary/40 hover:bg-accent/30',
                  !c.activo && 'opacity-60',
                )}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {c.razon_social}
                      </div>
                      {c.nombre_fantasia && (
                        <div className="truncate text-xs text-muted-foreground">
                          {c.nombre_fantasia}
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={SEGMENTO_VARIANT[c.segmento]}
                      className="shrink-0 text-[10px]"
                    >
                      {SEGMENTO_CLIENTE_LABELS[c.segmento]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{TIPO_CLIENTE_CRM_LABELS[c.tipo_cliente]}</span>
                    {c.cuit && <span>CUIT {c.cuit}</span>}
                    {c.localidad && <span>{c.localidad}</span>}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      LTV{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        $ {Number(c.ltv || 0).toLocaleString('es-AR')}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Ver
                      <ArrowRight className="size-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
