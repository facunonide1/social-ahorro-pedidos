'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MAX = 300

export function DeudaClient({
  porProveedor, facturas, hoyDia,
}: { porProveedor: any[]; facturas: any[]; hoyDia: number }) {
  const [prov, setProv] = useState<string>('')

  const visibles = prov ? facturas.filter((f) => f.proveedor_id === prov) : facturas

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Por proveedor
          </h2>
          <Button variant="outline" size="sm" className="gap-1"
            onClick={() => exportExcel('deuda-por-proveedor', porProveedor.map((p) => ({
              Proveedor: p.proveedor,
              'Facturas abiertas': p.facturas_abiertas ?? 0,
              Saldo: Number(p.saldo ?? 0),
              Vencido: Number(p.vencido ?? 0),
              'Vence primero': p.vence_primero ?? '',
              'Día de cobro': p.dia_cobro != null ? DIAS[p.dia_cobro] : '',
              'Trabaja por resumen': p.trabaja_por_resumen ? 'Sí' : '',
            })))}>
            <Download className="size-3.5" /> Exportar
          </Button>
        </div>

        {porProveedor.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún proveedor con saldo abierto.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Cobra</th>
                  <th className="px-3 py-2 text-right">Facturas</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2 text-right">Vencido</th>
                  <th className="px-3 py-2">Vence primero</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porProveedor.map((p) => (
                  <tr key={p.proveedor_id}
                    className={`cursor-pointer hover:bg-accent/40 ${prov === p.proveedor_id ? 'bg-accent/60' : ''}`}
                    onClick={() => setProv(prov === p.proveedor_id ? '' : p.proveedor_id)}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.proveedor}</div>
                      {p.trabaja_por_resumen && (
                        <Badge variant="outline" className="mt-0.5 text-[10px]">por resumen</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.dia_cobro != null ? (
                        <span className={p.dia_cobro === hoyDia ? 'font-medium text-amber-600 dark:text-amber-400' : ''}>
                          {DIAS[p.dia_cobro]}
                        </span>
                      ) : <span className="text-muted-foreground">sin definir</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.facturas_abiertas ?? 0}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatARS(Number(p.saldo ?? 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(p.vencido ?? 0) > 0
                        ? <span className="text-destructive">{formatARS(Number(p.vencido))}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.vence_primero ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Factura por factura {prov && <span className="font-normal normal-case">· filtrado, tocá de nuevo para ver todo</span>}
        </h2>
        <p className="text-xs text-muted-foreground">
          {visibles.length.toLocaleString('es-AR')} abiertas
          {visibles.length > MAX && <> · se muestran las {MAX} que vencen primero</>}
        </p>
        {visibles.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">Comprobante</th>
                  <th className="px-3 py-2">Emitida</th>
                  <th className="px-3 py-2">Vence</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Pagado</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibles.slice(0, MAX).map((f) => (
                  <tr key={f.factura_id} className={f.situacion === 'vencida' ? 'bg-destructive/5' : ''}>
                    <td className="px-3 py-2">{f.proveedor}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {[f.punto_venta, f.numero_factura].filter(Boolean).join('-')}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{f.fecha_emision}</td>
                    <td className="px-3 py-2 text-xs">
                      {f.situacion === 'vencida'
                        ? <span className="font-medium text-destructive">{f.vence}</span>
                        : f.vence}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatARS(Number(f.total ?? 0))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {Number(f.pagado ?? 0) > 0 ? formatARS(Number(f.pagado)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatARS(Number(f.saldo ?? 0))}</td>
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
