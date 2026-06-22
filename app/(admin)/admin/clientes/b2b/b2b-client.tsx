'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Loader2, FileText, Repeat } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export type B2bRow = { id: string; nombre: string; cuit: string | null; telefono: string | null; email: string | null; gastado: number; saldo: number; limite: number; recurrentes: number }

export function B2bClient({ rows }: { rows: B2bRow[] }) {
  const router = useRouter()
  const [crear, setCrear] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{rows.length} clientes B2B. Conecta con Finanzas (cta cte) y Ofertas (oferta B2B).</p>
        <Button size="sm" className="ml-auto" onClick={() => setCrear(true)}><Plus className="size-4" /> Nuevo B2B</Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Sin clientes B2B todavía. (B2C es el grueso; B2B queda preparado.)</div>
          <Button size="sm" onClick={() => setCrear(true)}><Plus className="size-4" /> Alta de mayorista / institución</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Institución</th><th className="px-3 py-2">CUIT</th><th className="px-3 py-2 text-right">Saldo cta cte</th><th className="px-3 py-2 text-right">Límite</th><th className="px-3 py-2 text-right">Recurrentes</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-1.5"><Link href={`/admin/clientes/${c.id}`} className="font-medium hover:underline">{c.nombre}</Link><div className="text-[11px] text-muted-foreground">{c.telefono ?? c.email ?? ''}</div></td>
                  <td className="px-3 py-1.5 font-mono text-xs">{c.cuit ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(c.saldo)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{formatARS(c.limite)}</td>
                  <td className="px-3 py-1.5 text-right">{c.recurrentes > 0 ? <Badge variant="secondary" className="text-[10px]"><Repeat className="mr-0.5 size-3" />{c.recurrentes}</Badge> : '—'}</td>
                  <td className="px-3 py-1.5 text-right"><Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href={`/admin/clientes/${c.id}`}><FileText className="size-3.5" /> Ficha</Link></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crear && <AltaB2b onClose={() => setCrear(false)} onDone={(id) => { setCrear(false); router.push(`/admin/clientes/${id}`) }} />}
    </div>
  )
}

function AltaB2b({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [cuit, setCuit] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [limite, setLimite] = useState('')
  const [busy, setBusy] = useState(false)

  async function guardar() {
    if (!nombre.trim()) { toast.error('Poné el nombre de la institución'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/b2b', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'alta', nombre, cuit, telefono: tel, email, limite_credito: Number(limite) || 0 }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Cliente B2B creado'); onDone(j.id)
    } catch (e: any) { toast.error(e?.message) } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader><SheetTitle>Alta cliente B2B</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-3 pt-4">
          <div className="space-y-1"><Label className="text-xs">Institución / razón social *</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Geriátrico San José" /></div>
          <div className="space-y-1"><Label className="text-xs">CUIT</Label><Input value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-12345678-9" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Teléfono</Label><Input value={tel} onChange={(e) => setTel(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Límite de crédito</Label><Input type="number" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="0" /></div>
          <Button disabled={busy} onClick={guardar}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />} Crear B2B</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
