'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Merge, X, Loader2, CheckCircle2, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FUENTE_LABEL } from '@/lib/types/crm'

type Cli = { id: string; nombre: string; dni: string | null; telefono: string | null; email: string | null; fuentes: string[]; total_gastado_12m: number }
export type DedupRow = { id: string; score: number; criterio: string | null; a: Cli | null; b: Cli | null }

export function DuplicadosClient({ rows }: { rows: DedupRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function resolver(id: string, accion: 'fusionar' | 'separar') {
    setBusy(id)
    try {
      const r = await fetch('/api/crm/dedup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(accion === 'fusionar' ? 'Clientes fusionados' : 'Marcados como distintos')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <CheckCircle2 className="size-8 text-emerald-500" />
        <div className="text-sm font-medium">Sin duplicados pendientes</div>
        <div className="text-sm text-muted-foreground">No hay candidatos a fusión. Se detectan al sincronizar fuentes.</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Copy className="size-4 text-amber-500" /> {rows.length} candidatos a duplicado</div>
      {rows.map((d) => (
        <div key={d.id} className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">match {Math.round(d.score)}%</Badge>
            {d.criterio && <span>por {d.criterio}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[d.a!, d.b!].map((c, i) => (
              <div key={c.id} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="text-xs uppercase text-muted-foreground">{i === 0 ? 'Se conserva' : 'Se fusiona acá'}</div>
                <div className="font-medium">{c.nombre}</div>
                <div className="text-xs text-muted-foreground">{c.dni ? `DNI ${c.dni}` : ''} {c.telefono ?? ''} {c.email ?? ''}</div>
                <div className="mt-1 flex flex-wrap gap-1">{c.fuentes.map((f) => <span key={f} className="rounded bg-muted px-1 py-0.5 text-[9px]">{FUENTE_LABEL[f]?.split(' ')[0] ?? f}</span>)}</div>
                <div className="mt-1 text-xs">Gastado: {formatARS(Number(c.total_gastado_12m))}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy === d.id} onClick={() => resolver(d.id, 'separar')}><X className="size-4" /> Son distintos</Button>
            <Button size="sm" disabled={busy === d.id} onClick={() => resolver(d.id, 'fusionar')}>{busy === d.id ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />} Fusionar</Button>
          </div>
        </div>
      ))}
    </div>
  )
}
