import Link from 'next/link'
import { Sparkles, ArrowRight, Tag } from 'lucide-react'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { contarOfertasHoy, entregarMostrador } from '@/lib/ofertas/mostrador'
import { listAdminUsers } from '@/lib/admin-hub/users'
import type { TipoTarea } from '@/lib/types/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { BandejaV2Client } from './bandeja-v2-client'
import { MiDiaMobile } from './mi-dia-mobile'
import { KanbanClient } from './kanban-client'

export const dynamic = 'force-dynamic'

type Tab = 'mi_dia' | 'pool' | 'mi_sucursal' | 'tablero' | 'todas'
const TABS: Tab[] = ['mi_dia', 'pool', 'mi_sucursal', 'tablero', 'todas']
const TAB_LABELS: Record<Tab, string> = {
  mi_dia: 'Mi día',
  pool: 'Pool de mi turno',
  mi_sucursal: 'Mi sucursal',
  tablero: 'Tablero',
  todas: 'Todas',
}
const ESTADOS_KANBAN = ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion']
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
  const puedeTablero = esTransversal || ROLES_SUC.includes(profile.rol)
  if (tab === 'tablero' && !puedeTablero) tab = 'mi_dia'

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

  // Selector global de sucursal: en vistas no acotadas a "mi sucursal" del rol,
  // aplica el filtro de la sucursal activa del header (todas = sin filtro).
  const { sucursalId: sucActiva, esTodas: sucTodas } = getSucursalActiva()
  if (!sucTodas && sucActiva && (tab === 'todas' || tab === 'pool')) q = q.eq('sucursal_id', sucActiva)

  // Mostrador matinal (OS-6b · O-08): entrega lazy + conteo para el chip.
  let ofertasHoyN = 0
  try { const adm = createAdminClient(); await entregarMostrador(adm); ofertasHoyN = await contarOfertasHoy(adm, sucActiva, sucTodas) } catch { /* no bloquea */ }

  const { data: rows, error } = tab === 'tablero' ? { data: [] as any[], error: null } : await q

  // Tablero / kanban (OS-2a · E): activas + verificadas de hoy, scope por sucursal.
  let tareasTablero: any[] = []
  if (tab === 'tablero') {
    const scope = (b: any) =>
      !sucTodas && sucActiva ? b.eq('sucursal_id', sucActiva)
      : profile.sucursal_id && !esTransversal ? b.eq('sucursal_id', profile.sucursal_id)
      : b
    const [act, done] = await Promise.all([
      scope(sb.from('tareas').select(SELECT).in('estado', ESTADOS_KANBAN)).limit(400),
      scope(sb.from('tareas').select(SELECT).eq('estado', 'completada').gte('fecha_completada', inicioHoy)).limit(200),
    ])
    tareasTablero = [...((act.data ?? []) as any[]), ...((done.data ?? []) as any[])]
  }

  // Estado "bloqueada" (OS-2a · D): una tarea con dependencias no resueltas.
  // Un solo query extra para todas las dependencias referenciadas en la bandeja.
  const enrich = (rows ?? []) as any[]
  const allDepIds = [...new Set(enrich.flatMap((r) => (Array.isArray(r.dependencias_ids) ? r.dependencias_ids : [])))]
  if (allDepIds.length > 0) {
    const { data: depRows } = await sb.from('tareas').select('id, titulo, estado').in('id', allDepIds as string[])
    const depMap = Object.fromEntries((depRows ?? []).map((d: any) => [d.id, d]))
    for (const r of enrich) {
      const ids = Array.isArray(r.dependencias_ids) ? r.dependencias_ids : []
      r._esperando = ids
        .map((id: string) => depMap[id])
        .filter((d: any) => d && d.estado !== 'completada' && d.estado !== 'descartada')
        .map((d: any) => d.titulo as string)
    }
  }

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
    if (t === 'tablero') return puedeTablero
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
        {ofertasHoyN > 0 && (
          <Link href="/admin/ofertas/panel" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
            <Tag className="size-4" /> <span className="flex-1">Ofertas de hoy ({ofertasHoyN}) — sugerilas en el mostrador</span> <ArrowRight className="size-4" />
          </Link>
        )}
        <Link href="/admin/tareas/agenda" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10">
          <Sparkles className="size-4" /> <span className="flex-1">NORA te arma la agenda del día (vencimientos, faltantes, descuadres)</span> <ArrowRight className="size-4" />
        </Link>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">Aplicá las migraciones <code>0037</code>/<code>0038</code>.</div>
              )}
            </AlertDescription>
          </Alert>
        ) : tab === 'tablero' ? (
          <KanbanClient
            tareas={tareasTablero}
            usersMap={usersMap}
            users={users}
            puedeReasignar={puedeTablero}
          />
        ) : tab === 'mi_dia' ? (
          <>
            {/* Mobile-first (OS-2a · A): la pantalla que abre un repositor en el teléfono. */}
            <div className="md:hidden">
              <MiDiaMobile
                tareas={enrich}
                tipos={(tipoData ?? []) as TipoTarea[]}
                users={users}
                sucursales={(sucursalesData ?? []) as { id: string; nombre: string }[]}
                currentUserId={profile.id}
                progresoDia={{ total: totalHoy ?? 0, completadas: completadasHoy ?? 0 }}
              />
            </div>
            {/* Desktop: la bandeja de siempre. */}
            <div className="hidden md:block">
              <BandejaV2Client
                tab={tab}
                tareas={enrich}
                usersMap={usersMap}
                tipos={(tipoData ?? []) as TipoTarea[]}
                users={users}
                sucursales={(sucursalesData ?? []) as { id: string; nombre: string }[]}
                currentUserId={profile.id}
                currentUserRol={profile.rol}
                esSuper={esSuper}
                progresoDia={{ total: totalHoy ?? 0, completadas: completadasHoy ?? 0 }}
              />
            </div>
          </>
        ) : (
          <BandejaV2Client
            tab={tab}
            tareas={enrich}
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
