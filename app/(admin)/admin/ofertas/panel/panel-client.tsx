'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Tag, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TIPO_LABEL } from '../ofertas-client'

export type OfertaPanel = { id: string; nombre: string; tipo: string; valor: number | null; productos: string[]; canales: string[]; fechaFin: string | null; estadoLectura: 'nueva' | 'cambio' | 'vista' }

export function PanelClient({ ofertas }: { ofertas: OfertaPanel[] }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState<string | null>(null)

  async function confirmar(id: string) {
    setConfirmando(id)
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'confirmar_lectura', oferta_id: id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('¡Confirmada! Ya la podés ofrecer.'); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setConfirmando(null) }
  }

  const pendientes = ofertas.filter((o) => o.estadoLectura !== 'vista')
  const vistas = ofertas.filter((o) => o.estadoLectura === 'vista')

  if (ofertas.length === 0) return <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">No hay ofertas activas ahora.</div>

  return (
    <div className="space-y-5">
      {pendientes.length > 0 && (
        <section className="space-y-3">
          {pendientes.map((o) => (
            <div key={o.id} className="rounded-xl border-2 border-primary/40 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.nombre}</span>
                    <Badge variant={o.estadoLectura === 'nueva' ? 'info' : 'warning'} className="font-normal">{o.estadoLectura === 'nueva' ? 'NUEVA' : 'CAMBIÓ'}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="secondary" className="font-normal">{TIPO_LABEL[o.tipo] ?? o.tipo}{o.valor != null ? ` ${o.valor}` : ''}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{o.productos.join(', ') || 'productos varios'}</div>
                  {o.fechaFin && <div className="text-[11px] text-muted-foreground">hasta {o.fechaFin}</div>}
                  <div className="mt-1.5 flex items-start gap-1 text-xs text-primary"><Sparkles className="mt-0.5 size-3 shrink-0" /> NORA: ofrecela a quien lleve algo del mismo rubro.</div>
                </div>
                <Button size="sm" disabled={confirmando === o.id} onClick={() => confirmar(o.id)}><Check className="size-4" /> La vi</Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {vistas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ya confirmadas</h2>
          {vistas.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 p-3 opacity-70">
              <div className="flex items-center gap-2 text-sm"><Tag className="size-3.5 text-muted-foreground" /> {o.nombre} <span className="text-xs text-muted-foreground">· {TIPO_LABEL[o.tipo] ?? o.tipo}</span></div>
              <Check className="size-4 text-emerald-500" />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
