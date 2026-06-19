import Link from 'next/link'
import { AtSign, MessageSquare, Bell, ListChecks } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mi bandeja' }

export default async function MiBandejaPage() {
  const profile = await requireAdminHubAccess()
  const adm = createAdminClient()

  const [{ data: menciones }, { data: notifs }, { data: directos }] = await Promise.all([
    adm.from('mensajes').select('id, canal_id, contenido, created_at, autor_user_id, canales(nombre)').contains('menciones', [profile.id]).order('created_at', { ascending: false }).limit(50),
    adm.from('notificaciones_admin').select('id, tipo, titulo, mensaje, url_accion, created_at, leida').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(60),
    adm.from('canales').select('id, nombre').eq('tipo', 'directo').limit(50),
  ])

  const items = [
    ...((menciones ?? []) as any[]).map((m) => ({ tipo: 'mencion', titulo: `Te mencionaron en ${m.canales?.nombre ?? 'un canal'}`, texto: m.contenido ?? '', url: `/admin/comunicacion?canal=${m.canal_id}`, at: m.created_at })),
    ...((notifs ?? []) as any[]).map((n) => ({ tipo: n.tipo === 'urgente' ? 'urgente' : n.tipo, titulo: n.titulo, texto: n.mensaje ?? '', url: n.url_accion ?? '/admin/comunicacion', at: n.created_at })),
  ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

  const icon = (t: string) => t === 'mencion' ? AtSign : t === 'urgente' ? Bell : t === 'alerta' ? Bell : t.includes('tarea') ? ListChecks : MessageSquare

  return (
    <>
      <PageHeader title="Mi bandeja" description="Tus menciones, mensajes directos y avisos del sistema en un solo lugar."
        breadcrumbs={[{ label: 'Comunicación', href: '/admin/comunicacion' }, { label: 'Mi bandeja' }]} />
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
        {((directos ?? []) as any[]).length > 0 && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Directos</h2>
            <div className="flex flex-wrap gap-2">{((directos ?? []) as any[]).map((d) => <Link key={d.id} href={`/admin/comunicacion?canal=${d.id}`} className="rounded-full border border-border px-3 py-1 text-sm hover:bg-accent">{d.nombre}</Link>)}</div>
          </section>
        )}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Novedades</h2>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin novedades. Cuando te mencionen o te asignen algo, aparece acá.</div>
          ) : items.map((it, i) => {
            const Ic = icon(it.tipo)
            return (
              <Link key={i} href={it.url} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent/40">
                <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${it.tipo === 'urgente' ? 'bg-rose-500/10 text-rose-600' : 'bg-primary/10 text-primary'}`}><Ic className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="text-sm font-medium">{it.titulo}</span>{it.tipo === 'urgente' && <Badge variant="destructive" className="font-normal">urgente</Badge>}</div>
                  <div className="truncate text-xs text-muted-foreground">{it.texto}</div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{String(it.at ?? '').slice(5, 16).replace('T', ' ')}</span>
              </Link>
            )
          })}
        </section>
      </div>
    </>
  )
}
