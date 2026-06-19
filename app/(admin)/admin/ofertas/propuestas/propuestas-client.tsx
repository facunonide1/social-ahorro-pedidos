'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, X, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TIPO_LABEL } from '../ofertas-client'

export type PropuestaRow = { id: string; codigo: string | null; nombre: string; tipo: string; valor: number | null; justificacion: string | null; motivo: string | null; canales: string[] }
const MOTIVO_LABEL: Record<string, string> = { por_vencer: 'Por vencer', dormido: 'Dormido', combo_iman_dormido: 'Combo imán+dormido' }

export function PropuestasClient({ propuestas }: { propuestas: PropuestaRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function generar() {
    setBusy(true)
    try {
      const r = await fetch('/api/ofertas/proponer', { method: 'POST' })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`${j.propuestas} propuestas generadas.`); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }
  async function accion(id: string, accion: string, ok: string, motivo?: string) {
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, id, motivo }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(ok); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{propuestas.length} propuestas pendientes</p>
        <Button size="sm" className="ml-auto" disabled={busy} onClick={generar}><RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} /> Generar propuestas</Button>
      </div>

      {propuestas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Sparkles className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Sin propuestas. Generá nuevas a partir de vencimientos y dormidos.</div>
          <Button size="sm" disabled={busy} onClick={generar}><RefreshCw className="size-4" /> Generar propuestas</Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {propuestas.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{p.nombre}</span>
                {p.motivo && <Badge variant="info" className="shrink-0 font-normal">{MOTIVO_LABEL[p.motivo] ?? p.motivo}</Badge>}
              </div>
              <Badge variant="secondary" className="w-fit font-normal">{TIPO_LABEL[p.tipo] ?? p.tipo}{p.valor != null ? ` ${p.valor}` : ''}</Badge>
              {p.justificacion && <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Sparkles className="mt-0.5 size-3 shrink-0 text-primary" /> {p.justificacion}</p>}
              <div className="mt-auto flex gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs" onClick={() => accion(p.id, 'enviar_aprobacion', 'Enviada a aprobación.')}><Send className="size-3.5" /> A aprobación</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => accion(p.id, 'rechazar', 'Descartada.', 'descartada por NORA')}><X className="size-3.5" /> Descartar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
