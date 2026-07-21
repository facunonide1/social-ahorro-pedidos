'use client'

import { useRouter } from 'next/navigation'
import { Download, ShieldCheck } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type DespachoRow = { id: string; fecha: string; turno: string; producto: string; sku: string | null; sucursal: string; persona: string }
const TURNO_LABEL: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' }

export function DespachosClient({ rows, dias }: { rows: DespachoRow[]; dias: number }) {
  const router = useRouter()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => router.push(`/admin/compliance/despachos?dias=${d}`)} className={cn('rounded px-3 py-1 text-xs font-medium', dias === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{d}d</button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{rows.length} despacho(s)</span>
        <Button variant="outline" size="sm" className="ml-auto" disabled={!rows.length} onClick={() => exportExcel('despachos-controlados', rows.map((r) => ({ Fecha: r.fecha, Turno: TURNO_LABEL[r.turno] ?? r.turno, Producto: r.producto, SKU: r.sku, Sucursal: r.sucursal, Persona: r.persona })))}><Download className="size-4" /> Excel</Button>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <ShieldCheck className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Sin despachos en el período. Usá "Registrar despacho controlado" desde el "+".</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Turno</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Persona</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs">{r.fecha}</td>
                  <td className="px-3 py-1.5"><Badge variant="secondary" className="font-normal">{TURNO_LABEL[r.turno] ?? r.turno}</Badge></td>
                  <td className="px-3 py-1.5 font-medium">{r.producto} <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span></td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sucursal}</td>
                  <td className="px-3 py-1.5 text-xs">{r.persona}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
