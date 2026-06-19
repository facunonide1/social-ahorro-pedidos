import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { PanelClient, type OfertaPanel } from './panel-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ofertas para ofrecer' }

export default async function PanelOfertasPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const adm = createAdminClient()

  const [{ data: ofertas }, { data: confs }] = await Promise.all([
    adm.from('ofertas').select('id, codigo, nombre, tipo, valor, productos_ids, canales, version, fecha_fin').eq('estado', 'activa').order('updated_at', { ascending: false }).limit(200),
    adm.from('ofertas_confirmaciones').select('oferta_id, version_confirmada').eq('empleado_user_id', profile.id),
  ])
  const confMap = new Map(((confs ?? []) as any[]).map((c) => [c.oferta_id, c.version_confirmada]))

  // nombres de productos
  const allPids = [...new Set(((ofertas ?? []) as any[]).flatMap((o) => o.productos_ids ?? []))]
  const prodMap = new Map<string, string>()
  if (allPids.length) {
    const { data: prods } = await adm.from('productos_catalogo').select('id, nombre').in('id', allPids)
    for (const p of (prods ?? []) as any[]) prodMap.set(p.id, p.nombre)
  }

  const rows: OfertaPanel[] = ((ofertas ?? []) as any[]).map((o) => {
    const conf = confMap.get(o.id) ?? 0
    const estadoLectura = conf >= (o.version ?? 1) ? 'vista' : conf > 0 ? 'cambio' : 'nueva'
    return {
      id: o.id, nombre: o.nombre, tipo: o.tipo, valor: o.valor != null ? Number(o.valor) : null,
      productos: (o.productos_ids ?? []).map((pid: string) => prodMap.get(pid)).filter(Boolean).slice(0, 4),
      canales: o.canales ?? [], fechaFin: o.fecha_fin, estadoLectura,
    }
  })

  return (
    <>
      <PageHeader title="Ofertas de hoy · para ofrecer" description="Confirmá que las viste para poder ofrecerlas en el mostrador."
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Para ofrecer' }]} />
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <PanelClient ofertas={rows} />
      </div>
    </>
  )
}
