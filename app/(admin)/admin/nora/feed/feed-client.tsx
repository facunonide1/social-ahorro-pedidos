'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, RefreshCw, Loader2, Check, X, ArrowRight, AlertTriangle, Info, Flame, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AvisoRow = {
  id: string; tipo: string; severidad: 'info' | 'sugerencia' | 'alerta' | 'critico'
  titulo: string; detalle: string | null; modulo: string | null
  accion_label: string | null; accion_href: string | null; created_at: string
}

const SEV: Record<string, { icon: any; cls: string }> = {
  info: { icon: Info, cls: 'text-blue-600 border-blue-500/30 bg-blue-500/5' },
  sugerencia: { icon: Sparkles, cls: 'text-primary border-primary/30 bg-primary/5' },
  alerta: { icon: AlertTriangle, cls: 'text-amber-600 border-amber-500/40 bg-amber-500/5' },
  critico: { icon: Flame, cls: 'text-rose-600 border-rose-500/40 bg-rose-500/5' },
}

export function FeedClient({ rows }: { rows: AvisoRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [revisando, setRevisando] = useState(false)

  async function gestionar(id: string, accion: 'aprobar' | 'descartar' | 'resolver') {
    setBusy(id)
    try {
      const r = await fetch('/api/nora/feed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, accion }) })
      if (!r.ok) throw new Error((await r.json())?.error)
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  async function revisarAhora() {
    setRevisando(true)
    try {
      const r = await fetch('/api/nora/auditar', { method: 'POST' })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(j.avisos > 0 ? `NORA encontró ${j.avisos} cosas para avisarte` : 'Todo en orden, sin novedades')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setRevisando(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{rows.length} avisos pendientes</p>
        <Button size="sm" variant="outline" className="ml-auto" disabled={revisando} onClick={revisarAhora}>
          {revisando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Revisar ahora
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <div className="text-sm font-medium">Sin avisos pendientes</div>
          <div className="text-sm text-muted-foreground">NORA no detectó nada que requiera tu atención. Tocá "Revisar ahora" para forzar un chequeo.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => {
            const s = SEV[a.severidad] ?? SEV.sugerencia; const I = s.icon
            return (
              <div key={a.id} className={cn('flex items-start gap-3 rounded-lg border p-3', s.cls)}>
                <I className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{a.titulo}</div>
                  {a.detalle && <div className="mt-0.5 text-sm text-muted-foreground">{a.detalle}</div>}
                  {a.accion_href && a.accion_label && (
                    <Link href={a.accion_href} className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline" onClick={() => gestionar(a.id, 'resolver')}>
                      {a.accion_label} <ArrowRight className="size-3" />
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-7" title="Listo" disabled={busy === a.id} onClick={() => gestionar(a.id, 'aprobar')}><Check className="size-4 text-emerald-600" /></Button>
                  <Button variant="ghost" size="icon" className="size-7" title="Descartar" disabled={busy === a.id} onClick={() => gestionar(a.id, 'descartar')}><X className="size-4 text-muted-foreground" /></Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
