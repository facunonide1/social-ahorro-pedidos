'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Paperclip, FileBadge } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SucLite = { id: string; nombre: string }
export type PapelRow = { id: string; tipo: string; descripcion: string | null; vence_at: string | null; archivo_url: string | null; sucursal: string; dias: number | null }

const TIPOS = [['matafuegos', 'Matafuegos'], ['seguro', 'Seguro'], ['habilitacion', 'Habilitación'], ['libreta_sanitaria_local', 'Libreta sanitaria'], ['otro', 'Otro']]

function semaforo(dias: number | null) {
  if (dias == null) return { v: 'secondary' as const, t: 'sin fecha' }
  if (dias < 0) return { v: 'destructive' as const, t: `vencido hace ${-dias}d` }
  if (dias <= 15) return { v: 'destructive' as const, t: `vence en ${dias}d` }
  if (dias <= 30) return { v: 'warning' as const, t: `vence en ${dias}d` }
  return { v: 'success' as const, t: `${dias}d` }
}

export function PapelesClient({ rows, sucursales, puedeEditar }: { rows: PapelRow[]; sucursales: SucLite[]; puedeEditar: boolean }) {
  const router = useRouter()
  const sb = createClient()
  const [f, setF] = useState({ sucursal_id: sucursales[0]?.id ?? '', tipo: 'habilitacion', descripcion: '', vence_at: '' })
  const [archivo, setArchivo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function subir(file: File) {
    setBusy(true)
    try {
      const path = `papeles/${Date.now()}.${file.name.split('.').pop() || 'pdf'}`
      const { error } = await sb.storage.from('compliance').upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      setArchivo(path); toast.success('Archivo adjunto.')
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo subir.') } finally { setBusy(false) }
  }

  async function agregar() {
    if (!f.sucursal_id || !f.tipo) { toast.error('Sucursal y tipo requeridos.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/compliance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'alta_documento', ...f, archivo_url: archivo }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Papel registrado.'); setF({ ...f, descripcion: '', vence_at: '' }); setArchivo(null); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      {puedeEditar && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registrar papel</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <Select value={f.sucursal_id} onValueChange={(v) => setF({ ...f, sucursal_id: v })}><SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger><SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
            <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            <Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Descripción" />
            <Input type="date" value={f.vence_at} onChange={(e) => setF({ ...f, vence_at: e.target.value })} />
            <div className="flex gap-2">
              <label className="inline-flex"><input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) subir(file) }} /><Button asChild size="icon" variant="outline" className="size-9"><span><Paperclip className={cn('size-4', archivo && 'text-primary')} /></span></Button></label>
              <Button className="flex-1" disabled={busy} onClick={agregar}><Plus className="size-4" /> Agregar</Button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center"><FileBadge className="size-8 text-muted-foreground" /><div className="text-sm text-muted-foreground">Sin papeles cargados.</div></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2">Estado</th></tr></thead>
            <tbody>
              {rows.map((r) => { const s = semaforo(r.dias); return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{r.sucursal}</td>
                  <td className="px-3 py-1.5 text-xs">{TIPOS.find(([v]) => v === r.tipo)?.[1] ?? r.tipo}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.descripcion ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{r.vence_at ?? '—'}</td>
                  <td className="px-3 py-1.5"><Badge variant={s.v} className="font-normal">{s.t}</Badge></td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
