'use client'

import { Download } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type MovCtaCte = { fecha: string; tipo: string; detalle: string; debe: number; haber: number; saldo?: number }

export function ProveedorCtaCte({ movimientos, proveedor }: { movimientos: MovCtaCte[]; proveedor: string }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cuenta corriente</div>
        <Button variant="outline" size="sm" disabled={!movimientos.length}
          onClick={() => exportExcel(`cta-cte-${proveedor.replace(/\s+/g, '-').toLowerCase()}`, movimientos.map((m) => ({ Fecha: m.fecha, Tipo: m.tipo, Detalle: m.detalle, Debe: m.debe || '', Haber: m.haber || '', Saldo: m.saldo ?? '' })))}>
          <Download className="size-4" /> Excel
        </Button>
      </div>
      {movimientos.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Sin movimientos en la cuenta corriente.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Detalle</th><th className="px-3 py-2 text-right">Debe</th><th className="px-3 py-2 text-right">Haber</th><th className="px-3 py-2 text-right">Saldo</th></tr></thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5 text-xs">{m.fecha}</td>
                  <td className="px-3 py-1.5">{m.tipo}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{m.detalle}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.debe ? formatARS(m.debe) : '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{m.haber ? formatARS(m.haber) : '—'}</td>
                  <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', (m.saldo ?? 0) > 0 && 'text-rose-600 dark:text-rose-400')}>{formatARS(m.saldo ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
