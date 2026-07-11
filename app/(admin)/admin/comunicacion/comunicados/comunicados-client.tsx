'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BellRing, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ComRow = {
  id: string
  canal_id: string
  canal: string
  contenido: string
  fecha: string
  leido: number
  total: number
  pct: number
  faltantes: { id: string; nombre: string }[]
}
export type Cronico = { id: string; nombre: string; pendientes: number }

export function ComunicadosClient({ rows, cronicos }: { rows: ComRow[]; cronicos: Cronico[] }) {
  return (
    <div className="space-y-4">
      {cronicos.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-3.5" /> No-lectores crónicos (pendientes &gt; 48hs)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cronicos.map((c) => (
              <span key={c.id} className="rounded-full border border-amber-500/40 bg-background px-2 py-0.5 text-xs">
                {c.nombre} <b>{c.pendientes}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Sin comunicados. Enviá un mensaje tipo comunicado desde un canal.</div>
      ) : rows.map((c) => <ComunicadoCard key={c.id} c={c} />)}
    </div>
  )
}

function ComunicadoCard({ c }: { c: ComRow }) {
  const [busy, setBusy] = useState(false)
  const [recordados, setRecordados] = useState<number | null>(null)

  async function recordar() {
    setBusy(true)
    try {
      const r = await fetch('/api/comunicacion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'recordar_comunicado', mensaje_id: c.id }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      setRecordados(j.recordados ?? 0)
      toast.success(j.recordados > 0 ? `Recordatorio enviado a ${j.recordados}.` : 'Ya confirmaron todos.')
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/admin/comunicacion?canal=${c.canal_id}&msg=${c.id}`} className="text-xs text-primary hover:underline">{c.canal}</Link>
          <p className="mt-0.5 text-sm">{c.contenido}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{String(c.fecha).slice(0, 16).replace('T', ' ')}</p>
        </div>
        <Badge variant={c.pct === 100 ? 'success' : 'warning'} className="shrink-0 font-normal">{c.leido}/{c.total} leyeron</Badge>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', c.pct === 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${c.pct}%` }} /></div>

      {c.faltantes.length > 0 ? (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">Faltan confirmar ({c.faltantes.length}):</div>
          <div className="flex flex-wrap gap-1">
            {c.faltantes.map((f) => <span key={f.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{f.nombre}</span>)}
          </div>
          <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={busy || recordados != null} onClick={recordar}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
            {recordados != null ? `Recordados: ${recordados}` : 'Recordar a los que faltan'}
          </Button>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">Todos confirmaron ✓</div>
      )}
    </div>
  )
}
