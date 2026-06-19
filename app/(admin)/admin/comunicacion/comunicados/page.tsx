import Link from 'next/link'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comunicados' }

export default async function ComunicadosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'auditor'] })
  const adm = createAdminClient()

  const { data: coms } = await adm.from('mensajes').select('id, canal_id, contenido, created_at, canales(nombre)').eq('tipo', 'comunicado').order('created_at', { ascending: false }).limit(100)
  const ids = ((coms ?? []) as any[]).map((c) => c.id)
  const canalIds = [...new Set(((coms ?? []) as any[]).map((c) => c.canal_id))]

  const lecturas = new Map<string, number>(); const miembrosPorCanal = new Map<string, number>()
  if (ids.length) {
    const { data: lec } = await adm.from('mensaje_lecturas').select('mensaje_id').in('mensaje_id', ids)
    for (const l of (lec ?? []) as any[]) lecturas.set(l.mensaje_id, (lecturas.get(l.mensaje_id) ?? 0) + 1)
  }
  if (canalIds.length) {
    const { data: mm } = await adm.from('canal_miembros').select('canal_id').in('canal_id', canalIds)
    for (const m of (mm ?? []) as any[]) miembrosPorCanal.set(m.canal_id, (miembrosPorCanal.get(m.canal_id) ?? 0) + 1)
  }

  const rows = ((coms ?? []) as any[]).map((c) => {
    const total = miembrosPorCanal.get(c.canal_id) ?? 0
    const leido = lecturas.get(c.id) ?? 0
    return { id: c.id, canal_id: c.canal_id, canal: c.canales?.nombre ?? '—', contenido: c.contenido ?? '', fecha: c.created_at, leido, total, pct: total > 0 ? Math.round((leido / total) * 100) : 0 }
  })

  return (
    <>
      <PageHeader title="Comunicados" description="Avisos importantes con confirmación de lectura (protocolos, cambios ANMAT…)."
        breadcrumbs={[{ label: 'Comunicación', href: '/admin/comunicacion' }, { label: 'Comunicados' }]} />
      <div className="space-y-3 p-4 md:p-6">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin comunicados. Enviá un mensaje tipo comunicado desde un canal.</div>
        ) : rows.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/admin/comunicacion?canal=${c.canal_id}`} className="text-xs text-primary hover:underline">{c.canal}</Link>
                <p className="mt-0.5 text-sm">{c.contenido}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{String(c.fecha).slice(0, 16).replace('T', ' ')}</p>
              </div>
              <Badge variant={c.pct === 100 ? 'success' : 'warning'} className="shrink-0 font-normal">{c.leido}/{c.total} leyeron</Badge>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', c.pct === 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${c.pct}%` }} /></div>
          </div>
        ))}
      </div>
    </>
  )
}
