import Link from 'next/link'
import { ArrowRight, Plus, UserCog } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { EmpleadoExtended } from '@/lib/types/empleados'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmpleadoAvatar } from '@/components/empleados/empleado-avatar'

export const dynamic = 'force-dynamic'

export default async function EmpleadosAdminPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'],
  })
  const sb = createClient()
  const { data, error } = await sb
    .from('empleados')
    .select('*')
    .order('activo', { ascending: false })
    .order('score_total', { ascending: false })
    .limit(200)
  const empleados = (data ?? []) as EmpleadoExtended[]
  const canCreate = ['super_admin', 'gerente', 'administrativo'].includes(
    profile.rol,
  )
  const activos = empleados.filter((e) => e.activo)
  const vinculados = activos.filter((e) => e.user_id).length

  return (
    <>
      <PageHeader
        title="Empleados"
        description="Maestro de empleados con scoring y badges del sistema de tareas."
        breadcrumbs={[{ label: 'Equipo' }, { label: 'Empleados' }]}
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
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total" value={empleados.length} />
          <KpiCard label="Activos" value={activos.length} variant="success" />
          <KpiCard
            label="Vinculados a un usuario"
            value={vinculados}
            variant={vinculados < activos.length ? 'warning' : 'default'}
          />
          <KpiCard
            label="Score acumulado"
            value={empleados.reduce((a, e) => a + e.score_total, 0)}
          />
        </section>

        {empleados.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserCog className="size-6" />
              </div>
              <div className="text-sm text-muted-foreground">
                Sin empleados cargados todavía.
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {empleados.map((e) => (
            <Link
              key={e.id}
              href={`/hub/rrhh/empleados/${e.id}`}
              className="group block"
            >
              <Card
                className={
                  e.activo
                    ? 'transition-colors hover:border-primary/40 hover:bg-accent/30'
                    : 'opacity-60'
                }
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <EmpleadoAvatar
                    nombre={e.nombre_completo}
                    fotoUrl={e.foto_perfil_url}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {e.nombre_completo}
                      </span>
                      {!e.activo && (
                        <Badge variant="secondary" className="text-[10px]">
                          Baja
                        </Badge>
                      )}
                      {!e.user_id && e.activo && (
                        <Badge variant="outline" className="text-[10px]">
                          Sin usuario
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.puesto || 'Sin puesto'}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{e.score_total.toLocaleString('es-AR')} pts</span>
                      {e.badges_obtenidos.length > 0 && (
                        <span>{e.badges_obtenidos.length} badges</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="mt-1 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
