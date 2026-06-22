'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Save, Download, Crown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PUNTOS_EVENTO_LABEL, NIVEL_LABEL, type PuntosRegla, type ClienteNivel } from '@/lib/types/crm'

export type MovRow = { id: string; evento: string; puntos: number; fecha: string; sincronizado: boolean; cliente: string }

const NIVELES: { nivel: ClienteNivel; min: number }[] = [
  { nivel: 'socio', min: 0 }, { nivel: 'plus', min: 1000 }, { nivel: 'premium', min: 5000 },
]

async function post(body: any) {
  const r = await fetch('/api/crm/puntos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export function PuntosClient({ reglas, movimientos }: { reglas: PuntosRegla[]; movimientos: MovRow[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Record<string, { puntos: string; ratio: string }>>(() => {
    const d: Record<string, { puntos: string; ratio: string }> = {}
    for (const r of reglas) d[r.evento] = { puntos: String(r.puntos), ratio: r.ratio_monto != null ? String(r.ratio_monto) : '' }
    return d
  })
  const [busy, setBusy] = useState<string | null>(null)

  async function guardar(r: PuntosRegla) {
    setBusy(r.evento)
    try {
      const d = draft[r.evento]
      await post({ accion: 'regla', evento: r.evento, puntos: Number(d.puntos) || 0, ratio_monto: d.ratio ? Number(d.ratio) : null, activa: r.activa })
      toast.success('Regla actualizada'); router.refresh()
    } catch (e: any) { toast.error(e?.message) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      {/* Reglas */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Reglas de puntos</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {reglas.map((r) => (
            <div key={r.evento} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-1.5 text-sm font-medium"><Coins className="size-4 text-primary" /> {PUNTOS_EVENTO_LABEL[r.evento]}</div>
              {r.evento === 'compra' ? (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs">1 punto cada $</Label>
                  <Input type="number" value={draft[r.evento]?.ratio ?? ''} onChange={(e) => setDraft((p) => ({ ...p, [r.evento]: { ...p[r.evento], ratio: e.target.value } }))} />
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  <Label className="text-xs">Puntos fijos</Label>
                  <Input type="number" value={draft[r.evento]?.puntos ?? ''} onChange={(e) => setDraft((p) => ({ ...p, [r.evento]: { ...p[r.evento], puntos: e.target.value } }))} />
                </div>
              )}
              <Button size="sm" className="mt-3 w-full" disabled={busy === r.evento} onClick={() => guardar(r)}>{busy === r.evento ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar</Button>
            </div>
          ))}
        </div>
      </section>

      {/* Niveles */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Niveles del Club</h2>
        <div className="flex flex-wrap gap-2">
          {NIVELES.map((n) => (
            <div key={n.nivel} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <Crown className="size-4 text-primary" />
              <span className="text-sm font-medium">{NIVEL_LABEL[n.nivel]}</span>
              <Badge variant="secondary" className="text-[10px]">desde {n.min} pts</Badge>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Los niveles y el canje se administran en la cuponera. NORA HQ define las reglas de acumulación y sincroniza el saldo.</p>
      </section>

      {/* Movimientos */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Movimientos recientes</h2>
          <Button variant="outline" size="sm" disabled={!movimientos.length} onClick={() => exportExcel('puntos', movimientos.map((m) => ({ Fecha: m.fecha, Cliente: m.cliente, Evento: PUNTOS_EVENTO_LABEL[m.evento as keyof typeof PUNTOS_EVENTO_LABEL] ?? m.evento, Puntos: m.puntos, Sincronizado: m.sincronizado ? 'Sí' : 'No' })))}><Download className="size-4" /> Excel</Button>
        </div>
        {movimientos.length === 0 ? <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">Sin movimientos. Se generan al cargar tickets o registrar compras.</div> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Evento</th><th className="px-3 py-2 text-right">Puntos</th><th className="px-3 py-2">Cuponera</th></tr></thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-xs">{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
                    <td className="px-3 py-1.5">{m.cliente}</td>
                    <td className="px-3 py-1.5 text-xs">{PUNTOS_EVENTO_LABEL[m.evento as keyof typeof PUNTOS_EVENTO_LABEL] ?? m.evento}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${m.puntos >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{m.puntos >= 0 ? '+' : ''}{m.puntos}</td>
                    <td className="px-3 py-1.5">{m.sincronizado ? <Badge variant="success" className="text-[10px]">sync ✓</Badge> : <Badge variant="outline" className="text-[10px]">solo HQ</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
