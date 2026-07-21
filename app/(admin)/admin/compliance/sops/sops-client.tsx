'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type SopRow = { id: string; codigo: string | null; titulo: string | null; contenido: string; version: number; estado: string; firmadoAt: string | null }

/** Markdown mínimo → líneas (headings, checklist, negrita). */
function render(md: string) {
  return md.split('\n').map((l, i) => {
    if (l.startsWith('# ')) return <h1 key={i} className="mt-2 text-lg font-bold">{l.slice(2)}</h1>
    if (l.startsWith('## ')) return <h2 key={i} className="mt-3 text-sm font-semibold">{l.slice(3)}</h2>
    if (l.startsWith('> ')) return <p key={i} className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">{l.slice(2)}</p>
    if (l.startsWith('- [ ] ')) return <label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" /> {l.slice(6)}</label>
    if (l.trim() === '') return <div key={i} className="h-1" />
    return <p key={i} className="text-sm">{l.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : <span key={j}>{p}</span>)}</p>
  })
}

export function SopsClient({ rows, puedeFirmar }: { rows: SopRow[]; puedeFirmar: boolean }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(rows[0]?.id ?? null)
  const [busy, setBusy] = useState(false)

  async function firmar(id: string) {
    if (!confirm('¿Marcar el SOP como VIGENTE? Registra tu firma y dispara el anuncio con confirmación de lectura a todo el mostrador.')) return
    setBusy(true)
    try {
      const r = await fetch('/api/compliance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'sop_vigente', id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('SOP vigente — anuncio enviado.'); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  if (!rows.length) return <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">Sin SOPs cargados.</div>

  return (
    <div className="space-y-3">
      {rows.map((s) => (
        <div key={s.id} className="rounded-lg border border-border">
          <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setAbierto(abierto === s.id ? null : s.id)}>
            <FileText className="size-4 text-primary" />
            <span className="font-medium">{s.codigo} · {s.titulo}</span>
            <Badge variant={s.estado === 'vigente' ? 'success' : 'warning'} className="ml-1 font-normal">{s.estado}{s.estado === 'vigente' && s.firmadoAt ? ` · ${s.firmadoAt}` : ''}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">v{s.version}</span>
          </button>
          {abierto === s.id && (
            <div className="border-t border-border px-4 py-3">
              <div className={cn('space-y-0.5')}>{render(s.contenido)}</div>
              {puedeFirmar && s.estado !== 'vigente' && (
                <Button size="sm" className="mt-3" disabled={busy} onClick={() => firmar(s.id)}><CheckCircle2 className="size-4" /> Marcar vigente (firmar)</Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
