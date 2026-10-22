import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { PageHeader } from '@/components/shared/page-header'

import { TroquelesClient } from './troqueles-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Troqueles' }

/**
 * F.1 · LOS TROQUELES, DESDE EL CELULAR.
 *
 * ── POR QUÉ ESTA PANTALLA EXISTE APARTE ─────────────────────────────────────
 *
 * Mandar los troqueles y sacar la foto del remito se hace **de pie**, con el
 * sobre en una mano y el celular en la otra. Entrar a la presentación, buscar
 * la sección de troqueles y completar tres campos chicos no se hace así.
 *
 * Esta pantalla tiene una sola pregunta por vez: a esta presentación le falta
 * mandar los troqueles, o le falta el acuse. Nada más.
 *
 * ── Y POR QUÉ ES LA PANTALLA MÁS IMPORTANTE DEL CELULAR ─────────────────────
 *
 * Porque el acuse se consigue al momento. Cuando llega el débito —semanas
 * después— el acuse ya está o ya no está, y sin acuse un débito por troquel
 * faltante no se puede reclamar. Es la única tarea del sector donde llegar
 * tarde no se puede arreglar.
 */
export default async function TroquelesPage() {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()

  // La RLS acota por sucursal: un encargado ve las suyas.
  const { data: pres } = await sb.from('convenio_presentaciones')
    .select('id, periodo_desde, periodo_hasta, estado, fecha_envio, total_declarado, cantidad_comprobantes, convenios(nombre, troquel), sucursales(nombre)')
    .in('estado', ['armada', 'enviada', 'liquidada'])
    .order('fecha_envio', { ascending: false, nullsFirst: true })
    .limit(200)

  const ids = ((pres ?? []) as any[]).map((p) => p.id)
  const { data: troq } = ids.length
    ? await sb.from('convenio_troqueles')
        .select('id, presentacion_id, remito_numero, cantidad, enviado_at, foto_remito_url, acuse_at, acuse_foto_url')
        .in('presentacion_id', ids)
    : { data: [] as any[] }

  return (
    <>
      <PageHeader
        title="Troqueles"
        description="Qué falta mandar y qué falta acusar."
        breadcrumbs={[{ label: 'Obras sociales', href: '/admin/convenios' }, { label: 'Troqueles' }]}
      />
      <div className="p-4 md:p-6">
        <TroquelesClient
          presentaciones={(pres ?? []) as any}
          troqueles={(troq ?? []) as any}
          puedeCargar={puede(perfil.rol, me?.permisos_custom ?? null, 'convenios', 'crear')}
        />
      </div>
    </>
  )
}
