import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { listAdminUsers } from '@/lib/admin-hub/users'
import type { TipoTarea } from '@/lib/types/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { BandejaV2Client } from './bandeja-v2-client'

export const dynamic = 'force-dynamic'

type Tab = 'mi_dia' | 'pool' | 'mi_sucursal' | 'todas'
const TABS: Tab[] = ['mi_dia', 'pool', 'mi_sucursal', 'todas']
const TAB_LABELS: Record<Tab, string> = {
  mi_dia: 'Mi día',
  pool: 'Pool de mi turno',
  mi_sucursal: 'Mi sucursal',
  todas: 'Todas',
}
const ROLES_TODAS = ['super_admin', 'gerente', 'auditor']
const ROLES_SUC = ['super_admin', 'gerente', 'auditor', 'sucursal', 'administrativo']
const ACTIVOS = ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion', 'rechazada']

const SELECT =
  '*, tipo:tipos_tareas(codigo,nombre,icono,color,categoria,evidencia_requerida)'

export default async function TareasBandejaPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const esTransversal = ROLES_TODAS.includes(profile.rol)
  const esSuper = profile.rol === 'super_admin'

  // Tab solicitada con fallback por permisos
  let tab: Tab = TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : 'mi_dia'
  if (tab === 'todas' && !esTransversal) tab = 'mi_dia'
  if (tab === 'mi_sucursal' && !ROLES_SUC.includes(profile.rol)) tab = 'mi_dia'

  // Fecha/turno AR
  const fechaAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const inicioHoy = `${fechaAR}T00:00:00-03:00`
  const finHoy = `${fechaAR}T23:59:59-03:00`

  // Query según tab
  let q = sb.from('tareas').select(SELECT).order('hora_limite', { ascending: true, nullsFirst: false }).order('fecha_vencimiento', { ascending: true, nullsFirst: false }).limit(300)

  if (tab === 'mi_dia') {
    q = q.eq('responsable_id', profile.id).in('estado', ACTIVOS)
  } else if (tab === 'pool') {
    q = q.is('responsable_id', null).in('asignacion_tipo', ['pool_turno', 'pool_sucursal']).eq('estado', 'pendiente')
    if (profile.sucursal_id && !esSuper) q = q.eq('sucursal_id', profile.sucursal_id)
  } else if (tab === 'mi_sucursal') {
    if (profile.sucursal_id && !esTransversal) q = q.eq('sucursal_id', profile.sucursal_id)
    q = q.in('estado', ACTIVOS)
  } else {
    q = q.in('estado', ACTIVOS)
  }

  const { data: rows, error } = await q

  // Progreso de "Mi día": completadas hoy / total de hoy (mías)
  const [{ count: totalHoy }, { count: completadasHoy }, { count: poolCount }] = await Promise.all([
    sb.from('tareas').select('id', { count: 'exact', head: true })
      .eq('responsable_id', profile.id).gte('fecha_vencimiento', inicioHoy).lte('fecha_vencimiento', finHoy),
    sb.from('tareas').select('id', { count: 'exact', head: true })
      .eq('responsable_id', profile.id).eq('estado', 'completada').gte('fecha_completada', inicioHoy),
    (() => {
      let pq = sb.from('tareas').select('id', { count: 'exact', head: true })
        .is('responsable_id', null).in('asignacion_tipo', ['pool_turno', 'pool_sucursal']).eq('estado', 'pendiente')
      if (profile.sucursal_id && !esSuper) pq = pq.eq('sucursal_id', profile.sucursal_id)
      return pq
    })(),
  ])

  // Catálogos
  const [{ data: tipoData }, users, { data: sucursalesData }] = await Promise.all([
    sb.from('tipos_tareas').select('*').eq('activo', true).order('nombre'),
    listAdminUsers(),
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  const usersMap = Object.fromEntries(users.map((u) => [u.id, u.nombre || u.email]))

  const tabsVisibles = TABS.filter((t) => {
    if (t === 'todas') return esTransversal
    if (t === 'mi_sucursal') return ROLES_SUC.includes(profile.rol)
    return true
  })

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Tu agenda del día, el pool de tu turno y las tareas de tu sucursal."
        breadcrumbs={[{ label: 'Operación' }, { label: 'Tareas' }]}
        tabs={tabsVisibles.map((t) => ({
          label: TAB_LABELS[t],
          href: `/admin/tareas?tab=${t}`,
          active: tab === t,
          badge: t === 'pool' ? (poolCount ?? 0) : undefined,
        }))}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">Aplicá las migraciones <code>0037</code>/<code>0038</code>.</div>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <BandejaV2Client
            tab={tab}
            tareas={(rows ?? []) as any[]}
            usersMap={usersMap}
            tipos={(tipoData ?? []) as TipoTarea[]}
            users={users}
            sucursales={(sucursalesData ?? []) as { id: string; nombre: string }[]}
            currentUserId={profile.id}
            currentUserRol={profile.rol}
            esSuper={esSuper}
            progresoDia={{ total: totalHoy ?? 0, completadas: completadasHoy ?? 0 }}
          />
        )}
      </div>
    </>
  )
}
