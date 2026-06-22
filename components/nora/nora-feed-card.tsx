import Link from 'next/link'
import { Sparkles, ArrowRight, AlertTriangle, Info, Flame } from 'lucide-react'

import { createAdminClient } from '@/lib/supabase/server'

const SEV_ICON: Record<string, any> = { info: Info, sugerencia: Sparkles, alerta: AlertTriangle, critico: Flame }
const SEV_CLS: Record<string, string> = { info: 'text-blue-600', sugerencia: 'text-primary', alerta: 'text-amber-600', critico: 'text-rose-600' }

/** Card de Mission Control: lo más urgente que detectó NORA (feed). */
export async function NoraFeedCard() {
  const adm = createAdminClient()
  const { data, count } = await adm.from('nora_avisos').select('id, tipo, severidad, titulo, accion_href, accion_label', { count: 'exact' })
    .eq('estado', 'pendiente')
    .order('severidad', { ascending: true }).order('created_at', { ascending: false }).limit(4)
  const avisos = (data ?? []) as any[]
  if (!avisos.length) return null

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-primary"><Sparkles className="size-4" /> NORA detectó {count ?? avisos.length} cosa{(count ?? 1) === 1 ? '' : 's'}</div>
        <Link href="/admin/nora/feed" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">Ver feed <ArrowRight className="size-3" /></Link>
      </div>
      <div className="space-y-1.5">
        {avisos.map((a) => {
          const I = SEV_ICON[a.severidad] ?? Sparkles
          return (
            <Link key={a.id} href={a.accion_href ?? '/admin/nora/feed'} className="flex items-center gap-2 text-sm hover:underline">
              <I className={`size-3.5 shrink-0 ${SEV_CLS[a.severidad] ?? 'text-primary'}`} />
              <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
