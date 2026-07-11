'use client'

import { EmptyConAccion } from '@/components/os/empty-con-accion'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Download, Search } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type OrdenRow = { id: string; codigo: string | null; rubro: string; estado: string; origen: string; total: number; condicion: string | null; fecha: string; proveedor: string; sucursal: string }
const ALL = '__all__'
const ESTADO_VARIANT: Record<string, any> = { borrador: 'outline', enviada: 'info', confirmada: 'info', recibida_parcial: 'warning', recibida: 'success', cancelada: 'outline' }

export function OrdenesClient({ ordenes }: { ordenes: OrdenRow[] }) {
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState(ALL)

  const rows = useMemo(() => ordenes.filter((o) => {
    if (estado !== ALL && o.estado !== estado) return false
    if (q.trim() && !`${o.proveedor} ${o.codigo ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  }), [ordenes, q, estado])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por proveedor o código…" className="h-9 pl-8" />
        </div>
        <Select value={estado} onValueChange={setEstado}><SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Todos los estados</SelectItem>{['borrador','enviada','confirmada','recibida_parcial','recibida','cancelada'].map((e) => <SelectItem key={e} value={e}>{e.replace(/_/g,' ')}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" size="sm" onClick={() => exportExcel('ordenes-compra', rows.map((o) => ({ Codigo: o.codigo, Proveedor: o.proveedor, Rubro: o.rubro, 'Compra a nombre de': o.sucursal, Origen: o.origen, Estado: o.estado, Total: o.total })))}><Download className="size-4" /> Excel</Button>
        <Button asChild size="sm"><Link href="/admin/compras/ordenes/nueva"><Plus className="size-4" /> Nueva orden</Link></Button>
      </div>

      <div className="text-xs text-muted-foreground">{rows.length} órdenes</div>

      {rows.length === 0 ? (
        <EmptyConAccion app="compras" accionId="orden-nueva" icono="ShoppingCart" titulo="Sin órdenes de compra" subtitulo="Creá una orden nueva o cargá el demo." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Rubro</th><th className="px-3 py-2">Compra a nombre de</th><th className="px-3 py-2">Origen</th><th className="px-3 py-2 text-right">Total est.</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs">{o.codigo ?? '—'}</td>
                  <td className="px-3 py-1.5 font-medium">{o.proveedor}</td>
                  <td className="px-3 py-1.5 text-xs">{o.rubro}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{o.sucursal}</td>
                  <td className="px-3 py-1.5 text-xs">{o.origen === 'sifaco' ? <Badge variant="info" className="font-normal">SIFACO</Badge> : o.origen.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(o.total)}</td>
                  <td className="px-3 py-1.5"><Badge variant={ESTADO_VARIANT[o.estado] ?? 'outline'} className="font-normal">{o.estado.replace(/_/g, ' ')}</Badge></td>
                  <td className="px-3 py-1.5 text-right">
                    {['enviada', 'confirmada', 'recibida_parcial'].includes(o.estado) && (
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]"><Link href="/admin/compras/recepciones"><Plus className="size-3.5" /> Recibir</Link></Button>
                    )}
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
