import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { tituloDePantalla } from '@/lib/os/definicion'

import { AlertasClient, type AlertaRow } from './alertas-client'

import { sinDemo } from '@/lib/demo/estado'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Alertas' }

export default async function AlertasPage() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones/alertas', 'Alertas de stock')

  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  // El lente de demostración (v0.81) llegaba sólo al panel de inicio y a la
  // campana. El sector Operaciones mostraba datos inventados sin decirlo, y el
  // panel llegó a afirmar «56 quiebres» sobre 480 filas de demostración (v0.85).
  let alertasQ = sb.from('alertas_stock').select('id, tipo, severidad, datos, producto_id, sucursal_id, created_at').eq('estado', 'activa').order('severidad').order('created_at', { ascending: false }).limit(500)
  if (sinDemo()) alertasQ = alertasQ.eq('es_demo', false)
  if (!esTodas && sucursalId) alertasQ = alertasQ.eq('sucursal_id', sucursalId)

  const [{ data: alertas }, { data: sucs }] = await Promise.all([
    alertasQ,
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
  ])

  const rows = (alertas ?? []) as AlertaRow[]
  const esSuper = ['super_admin', 'gerente'].includes(profile.rol)

  return (
    <>
      <PageHeader title={tituloDeclarado} description="Quiebres, sobrestock, sin rotación, stock fantasma y vencimientos."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Alertas' }]} />
      <div className="p-4 md:p-6">
        <AlertasClient alertas={rows} sucursales={((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre }))} puedeRegenerar={esSuper} />
      </div>
    </>
  )
}
