import Link from 'next/link'
import { ArrowRight, Plus, UserCog } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Empleado, Sucursal } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function EmpleadosPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const [{ data: empData, error }, { data: sucData }] = await Promise.all([
    sb
      .from('empleados')
      .select('*')
      .order('activo', { ascending: false })
      .order('nombre_completo', { ascending: true }),
    sb.from('sucursales').select('id, nombre'),
  ])

  const empleados = (empData ?? []) as Empleado[]
  const sucursales = (sucData ?? []) as Pick<Sucursal, 'id' | 'nombre'>[]
  const sucById = new Map(sucursales.map((s) => [s.id, s.nombre]))
  const canCreate = ['super_admin', 'gerente', 'administrativo'].includes(
    profile.rol,
  )

  const activos = empleados.filter((e) => e.activo)
  const masaSalarial = activos.reduce(
    (a, e) => a + Number(e.salario_base || 0),
    0,
  )

  return (
    <>
      <PageHeader
        title="Empleados"
        description={`${empleados.length} empleado${empleados.length === 1 ? '' : 's'} · ${activos.length} activo${activos.length === 1 ? '' : 's'}`}
        breadcrumbs={[{ label: 'RRHH' }, { label: 'Empleados' }]}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hub/rrhh/empleados/nuevo">
                <Plus className="size-4" />
                Nuevo empleado
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
                  Aplicá la migración <code>0026_rrhh_caja_gastos.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Empleados activos" value={activos.length} />
            <KpiCard
              label="Masa salarial base"
              value={masaSalarial}
              format="currency"
            />
            <KpiCard label="Sucursales con dotación" value={
              new Set(activos.map((e) => e.sucursal_id).filter(Boolean)).size
            } />
          </section>
        )}

        {!error && empleados.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserCog className="size-6" />
              </div>
              <div className="text-sm text-muted-foreground">
                Todavía no hay empleados cargados.
              </div>
              {canCreate && (
                <Button asChild variant="outline">
                  <Link href="/hub/rrhh/empleados/nuevo">
                    <Plus className="size-4" />
                    Cargar el primero
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {empleados.map((e) => (
            <Link
              key={e.id}
              href={`/hub/rrhh/empleados/${e.id}`}
              className="group"
            >
              <Card
                className={cn(
                  'h-full transition-colors hover:border-primary/40 hover:bg-accent/30',
                  !e.activo && 'opacity-60',
                )}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {e.nombre_completo}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {e.puesto || 'Sin puesto'}
                      </div>
                    </div>
                    {!e.activo && (
                      <Badge variant="secondary" className="text-[10px]">
                        Baja
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {e.dni && <span>DNI {e.dni}</span>}
                    {e.sucursal_id && (
                      <span>{sucById.get(e.sucursal_id) || 'Sucursal'}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {e.fecha_ingreso
                        ? `Ingreso ${new Date(e.fecha_ingreso).toLocaleDateString('es-AR')}`
                        : ''}
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
