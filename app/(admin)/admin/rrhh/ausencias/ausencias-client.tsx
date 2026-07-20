'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Pill } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export type AusenciaRow = { id: string; tipo: string; desde: string; hasta: string; estado: string; empleado: string; esFarma: boolean; sucursal: string; observaciones: string | null }

const ESTADO_VARIANT: Record<string, any> = { solicitada: 'warning', aprobada: 'success', rechazada: 'destructive' }
const TIPO_LABEL: Record<string, string> = { vacaciones: 'Vacaciones', enfermedad: 'Enfermedad', licencia: 'Licencia', falta: 'Falta' }

export function AusenciasClient({ rows, puedeResolver }: { rows: AusenciaRow[]; puedeResolver: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function resolver(id: string, aprobar: boolean) {
    setBusy(id)
    try {
      const r = await fetch('/api/rrhh/ausencias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'resolver', id, aprobar }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(aprobar ? 'Ausencia aprobada.' : 'Ausencia rechazada.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  if (!rows.length) return <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">Sin ausencias este mes.</div>

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Fechas</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2"></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-1.5 font-medium">{r.empleado}{r.esFarma && <Pill className="ml-1 inline size-3 text-primary" aria-label="farmacéutico" />}</td>
              <td className="px-3 py-1.5 text-xs">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
              <td className="px-3 py-1.5 text-xs">{r.desde}{r.hasta !== r.desde ? ` → ${r.hasta}` : ''}</td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sucursal}</td>
              <td className="px-3 py-1.5"><Badge variant={ESTADO_VARIANT[r.estado] ?? 'outline'} className="font-normal">{r.estado}</Badge></td>
              <td className="px-3 py-1.5 text-right">
                {puedeResolver && r.estado === 'solicitada' && (
                  <span className="flex justify-end gap-1">
                    <Button size="sm" className="h-7 text-xs" disabled={busy === r.id} onClick={() => resolver(r.id, true)}><Check className="size-3.5" /> Aprobar</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" disabled={busy === r.id} onClick={() => resolver(r.id, false)}><X className="size-3.5" /></Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
