'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Search, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

export type FilaBandeja = {
  id: string
  estado: string
  proveedor: string
  sucursal: string | null
  ordenes: string[]
  tieneRemito: boolean
  tieneFactura: boolean
  tiposDiferencia: string[]
  monto: number
  dias: number
  compraDirecta: boolean
}

const TODOS = '__all__'

const TIPO_LABEL: Record<string, string> = {
  cantidad_faltante: 'Faltante',
  facturado_de_mas: 'Facturado de más',
  precio_distinto: 'Precio distinto',
}

const ESTADO_VARIANT: Record<string, any> = {
  abierta: 'outline',
  conciliada: 'success',
  con_diferencias: 'warning',
  cerrada_manual: 'secondary',
}

export function BandejaClient({ filas }: { filas: FilaBandeja[] }) {
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState('con_diferencias')
  const [tipo, setTipo] = useState(TODOS)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return filas.filter((f) => {
      if (estado !== TODOS && f.estado !== estado) return false
      if (tipo !== TODOS && !f.tiposDiferencia.includes(tipo)) return false
      if (t && !`${f.proveedor} ${f.ordenes.join(' ')}`.toLowerCase().includes(t)) return false
      return true
    })
  }, [filas, q, estado, tipo])

  const totalAbierto = filas
    .filter((f) => f.estado === 'con_diferencias')
    .reduce((a, f) => a + Math.abs(f.monto), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por proveedor u orden…" className="h-9 pl-8" />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            <SelectItem value="con_diferencias">Con diferencias</SelectItem>
            <SelectItem value="abierta">Falta un papel</SelectItem>
            <SelectItem value="conciliada">Conciliadas</SelectItem>
            <SelectItem value="cerrada_manual">Cerradas a mano</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Toda diferencia</SelectItem>
            {Object.entries(TIPO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!rows.length}
          onClick={() => exportExcel('conciliaciones', rows.map((f) => ({
            // Regla de oro: SKU primero. Acá el detalle por SKU está en la
            // ficha, así que la bandeja exporta la orden como identificador.
            SKU: '',
            Proveedor: f.proveedor,
            Orden: f.ordenes.join(' / ') || (f.compraDirecta ? 'compra directa' : ''),
            Estado: f.estado,
            Diferencias: f.tiposDiferencia.map((t) => TIPO_LABEL[t] ?? t).join(', '),
            Monto: f.monto,
            'Días': f.dias,
            Sucursal: f.sucursal ?? '',
          })))}
        >
          <Download className="size-4" /> Excel
        </Button>
      </div>

      {totalAbierto > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          Hay <b className="tabular-nums">{formatARS(totalAbierto)}</b> en diferencias sin resolver.
        </div>
      )}

      {!rows.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <ShieldCheck className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            {filas.length ? 'Nada coincide con el filtro.' : 'Todavía no hay documentos vinculados a órdenes.'}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-normal">Proveedor</th>
                <th className="px-3 py-2 font-normal">Orden</th>
                <th className="px-3 py-2 font-normal">Papeles</th>
                <th className="px-3 py-2 font-normal">Diferencia</th>
                <th className="px-3 py-2 text-right font-normal">Monto</th>
                <th className="px-3 py-2 text-right font-normal">Días</th>
                <th className="px-3 py-2 font-normal">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-3 py-1.5">
                    <Link href={`/admin/compras/conciliaciones/${f.id}`} className="font-medium text-primary hover:underline">
                      {f.proveedor}
                    </Link>
                    {f.sucursal && <div className="text-[10px] text-muted-foreground">{f.sucursal}</div>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    {f.ordenes.join(' / ') || <span className="font-sans text-muted-foreground">compra directa</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    {[f.tieneRemito && 'remito', f.tieneFactura && 'factura'].filter(Boolean).join(' + ') || '—'}
                    {!f.tieneFactura && <span className="ml-1 text-amber-600 dark:text-amber-400">falta factura</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {f.tiposDiferencia.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{TIPO_LABEL[t] ?? t}</span>
                      ))}
                    </div>
                  </td>
                  <td className={cn('px-3 py-1.5 text-right font-mono tabular-nums', Math.abs(f.monto) > 0 && 'font-medium')}>
                    {f.monto ? formatARS(f.monto) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[11px] text-muted-foreground">{f.dias}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant={ESTADO_VARIANT[f.estado] ?? 'outline'} className="font-normal">{f.estado.replace('_', ' ')}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
