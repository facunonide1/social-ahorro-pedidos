import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { FeedClient, type AvisoRow } from './feed-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Feed de NORA' }

export default async function NoraFeedPage() {
  await requireAdminHubAccess()
  const sb = createClient()
  const { data } = await sb.from('nora_avisos').select('*').eq('estado', 'pendiente').order('created_at', { ascending: false }).limit(200)
  const rows = ((data ?? []) as any[]).map((a) => ({
    id: a.id, tipo: a.tipo, severidad: a.severidad, titulo: a.titulo, detalle: a.detalle,
    modulo: a.modulo, accion_label: a.accion_label, accion_href: a.accion_href, created_at: a.created_at,
  })) as AvisoRow[]

  return (
    <>
      <PageHeader title="Feed de NORA" description="Lo que NORA detectó y te propone. Aprobá, descartá o accioná."
        breadcrumbs={[{ label: 'Mission Control', href: '/admin' }, { label: 'Feed de NORA' }]} />
      <div className="p-4 md:p-6">
        <FeedClient rows={rows} />
      </div>
    </>
  )
}
