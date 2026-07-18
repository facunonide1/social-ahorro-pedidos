import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Briefs de ofertas' }

const VARIANT: Record<string, any> = { generado: 'outline', abierto: 'info', publicado: 'success' }

export default async function BriefsPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { data: briefs } = await adm.from('ofertas_briefs').select('token, estado, created_at, abierto_at, publicado_at, ofertas(nombre, codigo)').order('created_at', { ascending: false }).limit(200)
  const rows = (briefs ?? []) as any[]

  return (
    <>
      <PageHeader title="Briefs al community manager" description="Links públicos para reenviar por WhatsApp. Se marcan abierto al primer acceso y publicado cuando el CM lo sube."
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Briefs' }]} />
      <div className="p-4 md:p-6">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">Sin briefs todavía. Se generan al aprobar una oferta con canal Web/redes.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Oferta</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Creado</th><th className="px-3 py-2">Link</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.token} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{(b.ofertas as any)?.nombre ?? '—'} <span className="font-mono text-[10px] text-muted-foreground">{(b.ofertas as any)?.codigo}</span></td>
                    <td className="px-3 py-1.5"><Badge variant={VARIANT[b.estado] ?? 'outline'} className="font-normal">{b.estado}</Badge></td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{String(b.created_at).slice(0, 10)}</td>
                    <td className="px-3 py-1.5"><Link href={`/brief/${b.token}`} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3.5" /> abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
