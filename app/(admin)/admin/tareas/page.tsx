import Link from 'next/link'
import { ListChecks } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { listAdminUsers } from '@/lib/admin-hub/users'
import type { Tarea, TareaConTipo, TipoTarea } from '@/lib/types/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { TareasBandejaClient } from './bandeja-client'

export const dynamic = 'force-dynamic'

type Tab = 'mias' | 'por_verificar' | 'equipo' | 'pool' | 'todas'
const TABS: Tab[] = ['mias', 'por_verificar', 'equipo', 'pool', 'todas']
const TAB_LABELS: Record<Tab, string> = {
  mias: 'Mis tareas',
  por_verificar: 'Por verificar',
  equipo: 'De mi equipo',
  pool: 'Asignables',
  todas: 'Todas',
}

const ROLES_TODAS = ['super_admin', 'gerente', 'auditor']

export default async function TareasBandejaPage({
  searchParams,
}: {
  searchParams: { tab?: string; estado?: string; prioridad?: string; categoria?: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const tabSolicitada = TABS.includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : 'mias'
  const tab: Tab =
    tabSolicitada === 'todas' && !ROLES_TODAS.includes(profile.rol)
      ? 'mias'
      : tabSolicitada

  // Query principal — RLS deja ver todo a usuarios activos.
  let q = sb
    .from('tareas')
    .select('*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida,niveles_workflow)')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (tab === 'mias') q = q.eq('responsable_id', profile.id)
  else if (tab === 'por_verificar')
    q = q.eq('verificador_id', profile.id).eq('estado', 'en_verificacion')
  else if (tab === 'equipo' && profile.sucursal_id)
    q = q.eq('sucursal_id', profile.sucursal_id).neq('responsable_id', profile.id)
  else if (tab === 'pool')
    q = q.is('responsable_id', null).eq('rol_destinatario', profile.rol)

  if (searchParams.estado) q = q.eq('estado', searchParams.estado)
  if (searchParams.prioridad) q = q.eq('prioridad', searchParams.prioridad)

  const { data: tareaData, error } = await q

  // Cargamos contadores para los tabs (1 query liviana por tab).
  const [misCount, porVerifCount, poolCount, equipoCount, todasCount] =
    await Promise.all([
      sb
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .eq('responsable_id', profile.id)
        .in('estado', ['pendiente', 'asignada', 'en_progreso']),
      sb
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .eq('verificador_id', profile.id)
        .eq('estado', 'en_verificacion'),
      sb
        .from('tareas')
        .select('id', { count: 'exact', head: true })
        .is('responsable_id', null)
        .eq('rol_destinatario', profile.rol),
      profile.sucursal_id
        ? sb
            .from('tareas')
            .select('id', { count: 'exact', head: true })
            .eq('sucursal_id', profile.sucursal_id)
            .in('estado', ['pendiente', 'asignada', 'en_progreso'])
        : Promise.resolve({ count: 0 }),
      ROLES_TODAS.includes(profile.rol)
        ? sb
            .from('tareas')
            .select('id', { count: 'exact', head: true })
            .in('estado', ['pendiente', 'asignada', 'en_progreso'])
        : Promise.resolve({ count: 0 }),
    ])

  // Filtrado por categoría se hace en JS (vive en el tipo).
  let tareasFiltradas = (tareaData ?? []) as TareaConTipo[]
  if (searchParams.categoria) {
    tareasFiltradas = tareasFiltradas.filter(
      (t) => t.tipo?.categoria === searchParams.categoria,
    )
  }

  // Catálogos para el form/picker.
  const [{ data: tipoData }, users, { data: sucursalesData }] = await Promise.all([
    sb.from('tipos_tareas').select('*').eq('activo', true).order('nombre'),
    listAdminUsers(),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const usersMap = Object.fromEntries(
    users.map((u) => [u.id, { nombre: u.nombre, email: u.email }]),
  )

  // Stats top
  const totalVisibles = tareasFiltradas.length
  const vencidas = tareasFiltradas.filter((t) => t.estado === 'vencida').length
  const enSla = tareasFiltradas.filter(
    (t) =>
      t.fecha_vencimiento &&
      new Date(t.fecha_vencimiento).getTime() > Date.now() &&
      ['pendiente', 'asignada', 'en_progreso'].includes(t.estado),
  ).length

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Bandeja del equipo · todas las tareas que te involucran"
        breadcrumbs={[{ label: 'Equipo' }, { label: 'Tareas' }]}
        tabs={TABS.filter((t) => t !== 'todas' || ROLES_TODAS.includes(profile.rol)).map(
          (t) => ({
            label: TAB_LABELS[t],
            href: `/admin/tareas?tab=${t}`,
            active: tab === t,
            badge:
              t === 'mias'
                ? misCount.count ?? 0
                : t === 'por_verificar'
                  ? porVerifCount.count ?? 0
                  : t === 'equipo'
                    ? equipoCount.count ?? 0
                    : t === 'pool'
                      ? poolCount.count ?? 0
                      : todasCount.count ?? 0,
          }),
        )}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración{' '}
                  <code>0030_tareas_enterprise_empleados.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Visibles" value={totalVisibles} />
              <KpiCard
                label="Vencidas"
                value={vencidas}
                variant={vencidas > 0 ? 'danger' : 'default'}
              />
              <KpiCard label="En SLA" value={enSla} variant="success" />
              <KpiCard
                label="Por verificar (mías)"
                value={porVerifCount.count ?? 0}
                variant={(porVerifCount.count ?? 0) > 0 ? 'warning' : 'default'}
              />
            </section>

            {tareasFiltradas.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ListChecks className="size-6" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    No hay tareas en esta vista.
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <TareasBandejaClient
              tareas={tareasFiltradas}
              tipos={(tipoData ?? []) as TipoTarea[]}
              users={users}
              usersMap={usersMap}
              sucursales={(sucursalesData ?? []) as { id: string; nombre: string }[]}
              currentUserId={profile.id}
              currentUserRol={profile.rol}
            />
          </>
        )}
      </div>
    </>
  )
}
