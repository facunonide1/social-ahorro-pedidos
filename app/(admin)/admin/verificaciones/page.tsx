import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { adminUsersMap } from '@/lib/admin-hub/users'
import { PageHeader } from '@/components/shared/page-header'

import { VerificacionesClient, type VerifItem } from './verificaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Verificaciones' }

const TRANSVERSAL = ['super_admin', 'gerente', 'auditor']

export default async function VerificacionesPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const adm = createAdminClient()

  // Sucursales que supervisa
  let sucursalIds: string[] | null = null // null = todas
  if (!TRANSVERSAL.includes(profile.rol)) {
    const { data: sups } = await sb
      .from('supervisores_tareas')
      .select('sucursal_id')
      .eq('user_id', profile.id)
      .eq('activo', true)
    sucursalIds = (sups ?? []).map((s: any) => s.sucursal_id)
  }

  let q = sb
    .from('tareas')
    .select('id, codigo, titulo, sucursal_id, responsable_id, fecha_completada, evidencias, pre_verificacion_ia, tipo:tipos_tareas(nombre,categoria,prioridad_default,evidencia_requerida)')
    .eq('estado', 'en_verificacion')
    .order('fecha_completada', { ascending: true })
    .limit(200)
  if (sucursalIds) {
    if (sucursalIds.length === 0) {
      // no supervisa nada → lista vacía
      q = q.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      q = q.in('sucursal_id', sucursalIds)
    }
  }

  const { data: rows } = await q
  const usersMap = await adminUsersMap()

  // Sucursales para nombres
  const { data: sucs } = await sb.from('sucursales').select('id, nombre')
  const sucMap = Object.fromEntries((sucs ?? []).map((s: any) => [s.id, s.nombre]))

  // Firmar URLs de evidencias tipo foto/archivo/firma/foto_termometro
  const items: VerifItem[] = []
  for (const r of (rows ?? []) as any[]) {
    const evid = Array.isArray(r.evidencias) ? r.evidencias : []
    const firmadas = await Promise.all(
      evid.map(async (e: any) => {
        let signedUrl: string | null = null
        if (e.url && typeof e.url === 'string' && !e.url.startsWith('http')) {
          const { data } = await adm.storage.from('tareas-evidencias').createSignedUrl(e.url, 3600)
          signedUrl = data?.signedUrl ?? null
        } else if (e.url) {
          signedUrl = e.url
        }
        return { tipo: e.tipo, valor: e.valor ?? null, signedUrl }
      }),
    )
    const resp = r.responsable_id ? usersMap[r.responsable_id] : null
    items.push({
      id: r.id,
      codigo: r.codigo,
      titulo: r.titulo,
      sucursal: sucMap[r.sucursal_id] ?? '—',
      responsable: resp?.nombre || resp?.email || '—',
      completadaHace: r.fecha_completada ? minutosDesde(r.fecha_completada) : null,
      tipoNombre: r.tipo?.nombre ?? null,
      categoria: r.tipo?.categoria ?? null,
      prioridad: r.tipo?.prioridad_default ?? 'media',
      preVerif: r.pre_verificacion_ia ?? null,
      evidencias: firmadas,
    })
  }

  return (
    <>
      <PageHeader
        title="Verificaciones"
        description="Aprobá o rechazá las tareas completadas. NORA pre-verifica para acelerar."
        breadcrumbs={[{ label: 'Operación' }, { label: 'Verificaciones' }]}
      />
      <div className="p-4 md:p-6">
        <VerificacionesClient items={items} />
      </div>
    </>
  )
}

function minutosDesde(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}
