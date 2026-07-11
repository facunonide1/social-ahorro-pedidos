import Link from 'next/link'
import { Users, AlertTriangle, UserPlus, Megaphone, ArrowRight, PieChart, Repeat, Coins, Building2, Copy } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { AccionesSubApp } from '@/components/os/acciones-subapp'
import { AccesoCentroDatos } from '@/components/centro-datos/acceso-centro-datos'
import { KpiCard } from '@/components/cards/kpi-card'
import { NoraCard } from '@/components/nora/nora-card'
import type { Cliente } from '@/lib/types/crm'
import { ClientesListClient, type ClienteRow } from './clientes-list-client'
import { CrmDemoButton } from './demo-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Clientes · CRM' }

const ACCESOS = [
  { l: 'Segmentos', h: '/admin/clientes/segmentos', i: PieChart },
  { l: 'Comunicación', h: '/admin/clientes/comunicacion', i: Megaphone },
  { l: 'Automatizaciones', h: '/admin/clientes/automatizaciones', i: Repeat },
  { l: 'Puntos', h: '/admin/clientes/puntos', i: Coins },
  { l: 'B2B', h: '/admin/clientes/b2b', i: Building2 },
  { l: 'Duplicados', h: '/admin/clientes/duplicados', i: Copy },
]

export default async function ClientesCrmPage() {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  let q = sb.from('clientes').select('*').eq('activo', true).order('total_gastado_12m', { ascending: false }).limit(3000)
  if (!esTodas && sucursalId) q = q.eq('sucursal_habitual_id', sucursalId)

  const inicioMes = new Date().toISOString().slice(0, 7) + '-01'
  const [{ data: clientesData }, { data: sucs }, { count: campActivas }, { count: dedupPend }] = await Promise.all([
    q,
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb.from('campanias_crm').select('id', { count: 'exact', head: true }).in('estado', ['programada', 'enviada']),
    sb.from('dedup_pendientes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
  ])

  const clientes = (clientesData ?? []) as Cliente[]
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const activos = clientes.length
  const enRiesgo = clientes.filter((c) => c.riesgo_churn !== 'bajo').length
  const nuevosMes = clientes.filter((c) => c.created_at >= inicioMes).length

  const rows: ClienteRow[] = clientes.map((c) => ({
    id: c.id, nombre: c.nombre, tipo: c.tipo, dni: c.dni, telefono: c.telefono, email: c.email,
    nivel: c.nivel, riesgo: c.riesgo_churn, gastado: Number(c.total_gastado_12m),
    ultima_compra: c.ultima_compra, fuentes: c.fuentes ?? [],
    sucursal: c.sucursal_habitual_id ? sucMap.get(c.sucursal_habitual_id) ?? null : null,
  }))

  return (
    <>
      <PageHeader title="Clientes" description="CRM unificado B2C + B2B. Una ficha por persona, de todas las fuentes."
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes' }]}
        actions={<div className="flex gap-2"><CrmDemoButton /><AccesoCentroDatos accion={{ tipo: 'importar-clientes' }} /></div>} />

      <div className="space-y-5 p-4 md:p-6">
        <AccionesSubApp app="clientes" />
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Clientes activos" value={activos} icon={Users} />
          <KpiCard label="En riesgo de churn" value={enRiesgo} icon={AlertTriangle} variant={enRiesgo > 0 ? 'warning' : 'default'} href="/admin/clientes/segmentos" />
          <KpiCard label="Nuevos del mes" value={nuevosMes} icon={UserPlus} variant="success" />
          <KpiCard label="Campañas activas" value={campActivas ?? 0} icon={Megaphone} href="/admin/clientes/comunicacion" />
        </section>

        <NoraCard contexto="clientes">
          {activos === 0
            ? <p>Todavía no hay clientes unificados. Sincronizá las fuentes (Club, pedidos, tickets) o cargá la demo para empezar.</p>
            : <p>Tenés <b>{activos}</b> clientes{enRiesgo > 0 ? <>, <b className="text-amber-600">{enRiesgo} en riesgo</b> de dejar de comprar</> : ''}. Revisá los <Link href="/admin/clientes/segmentos" className="text-primary hover:underline">segmentos</Link> y armá una campaña.</p>}
        </NoraCard>

        {/* Accesos del sector */}
        <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ACCESOS.map((a) => {
            const I = a.i
            return (
              <Link key={a.h} href={a.h} className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center transition-all hover:border-primary/40 hover:shadow-sm">
                <I className="size-5 text-primary" />
                <span className="text-xs font-medium">{a.l}</span>
                {a.l === 'Duplicados' && (dedupPend ?? 0) > 0 && <span className="text-[10px] text-amber-600">{dedupPend} pendientes</span>}
              </Link>
            )
          })}
        </section>

        <ClientesListClient rows={rows} sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre }))} puedeCrear={['super_admin', 'gerente', 'marketing', 'administrativo'].includes(profile.rol)} />
      </div>
    </>
  )
}
