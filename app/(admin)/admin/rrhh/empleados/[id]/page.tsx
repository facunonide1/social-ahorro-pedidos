import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type {
  Empleado,
  EmpleadoAusencia,
  EmpleadoTurno,
} from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmpleadoForm } from '../empleado-form'
import { AusenciasPanel, TurnosPanel } from './registros'

export const dynamic = 'force-dynamic'

type Tab = 'ficha' | 'turnos' | 'ausencias' | 'editar'
const TABS: Tab[] = ['ficha', 'turnos', 'ausencias', 'editar']

export default async function EmpleadoDetallePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const { data: emp, error } = await sb
    .from('empleados')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Empleado>()
  if (error || !emp) notFound()

  const canEdit = ['super_admin', 'gerente', 'administrativo'].includes(
    profile.rol,
  )
  const tab: Tab =
    TABS.includes(searchParams.tab as Tab) &&
    !(searchParams.tab === 'editar' && !canEdit)
      ? (searchParams.tab as Tab)
      : 'ficha'

  const [{ data: turnos }, { data: ausencias }, { data: sucData }] =
    await Promise.all([
      sb
        .from('empleado_turnos')
        .select('*')
        .eq('empleado_id', emp.id)
        .order('fecha', { ascending: false })
        .limit(40),
      sb
        .from('empleado_ausencias')
        .select('*')
        .eq('empleado_id', emp.id)
        .order('fecha_desde', { ascending: false })
        .limit(30),
      tab === 'editar'
        ? sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
        : Promise.resolve({ data: [] }),
    ])

  return (
    <>
      <PageHeader
        title={emp.nombre_completo}
        description={emp.puesto || 'Sin puesto asignado'}
        breadcrumbs={[
          { label: 'RRHH' },
          { label: 'Empleados', href: '/admin/rrhh/empleados' },
          { label: emp.nombre_completo },
        ]}
        tabs={[
          { label: 'Ficha', href: `/admin/rrhh/empleados/${emp.id}`, active: tab === 'ficha' },
          {
            label: 'Turnos',
            href: `/admin/rrhh/empleados/${emp.id}?tab=turnos`,
            active: tab === 'turnos',
            badge: (turnos ?? []).length,
          },
          {
            label: 'Ausencias',
            href: `/admin/rrhh/empleados/${emp.id}?tab=ausencias`,
            active: tab === 'ausencias',
            badge: (ausencias ?? []).length,
          },
          ...(canEdit
            ? [
                {
                  label: 'Editar',
                  href: `/admin/rrhh/empleados/${emp.id}?tab=editar`,
                  active: tab === 'editar',
                },
              ]
            : []),
        ]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {tab === 'ficha' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Datos personales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="DNI">{emp.dni || '—'}</Row>
                <Row label="Nacimiento">
                  {emp.fecha_nacimiento
                    ? new Date(emp.fecha_nacimiento).toLocaleDateString('es-AR')
                    : '—'}
                </Row>
                <Row label="Teléfono">{emp.telefono || '—'}</Row>
                <Row label="Email">{emp.email || '—'}</Row>
                <Row label="Estado">
                  <Badge
                    variant={emp.activo ? 'success' : 'secondary'}
                    className="text-[10px]"
                  >
                    {emp.activo ? 'Activo' : 'Baja'}
                  </Badge>
                </Row>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Datos laborales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Puesto">{emp.puesto || '—'}</Row>
                <Row label="Ingreso">
                  {emp.fecha_ingreso
                    ? new Date(emp.fecha_ingreso).toLocaleDateString('es-AR')
                    : '—'}
                </Row>
                <Row label="Egreso">
                  {emp.fecha_egreso
                    ? new Date(emp.fecha_egreso).toLocaleDateString('es-AR')
                    : '—'}
                </Row>
                <Row label="Salario base">
                  {emp.salario_base != null
                    ? `$ ${Number(emp.salario_base).toLocaleString('es-AR')}`
                    : '—'}
                </Row>
              </CardContent>
            </Card>
            {emp.observaciones && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Observaciones
                  </CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {emp.observaciones}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === 'turnos' && (
          <TurnosPanel
            empleadoId={emp.id}
            initial={(turnos ?? []) as EmpleadoTurno[]}
          />
        )}

        {tab === 'ausencias' && (
          <AusenciasPanel
            empleadoId={emp.id}
            initial={(ausencias ?? []) as EmpleadoAusencia[]}
          />
        )}

        {tab === 'editar' && canEdit && (
          <div className="mx-auto max-w-3xl">
            <EmpleadoForm
              empleado={emp}
              sucursales={
                (sucData ?? []) as { id: string; nombre: string }[]
              }
            />
          </div>
        )}
      </div>
    </>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}
