'use client'

import { useState } from 'react'
import { Download, Search } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Fila = {
  producto_id: string; sku: string; nombre: string; codigo_barras: string | null
  laboratorio: string | null; condicion_venta: string | null; lista_controlado: string | null
  stock: number; precio_sugerido: number | null; visible_antes_de_v091: boolean; por_que: string
}

const MAX_EN_PANTALLA = 200

export function Regla9Client({ filas }: { filas: Fila[] }) {
  const [q, setQ] = useState('')
  const [soloInvisibles, setSoloInvisibles] = useState(false)

  const t = q.trim().toLowerCase()
  const filtradas = filas.filter((f) =>
    (!soloInvisibles || !f.visible_antes_de_v091) &&
    (!t || f.nombre.toLowerCase().includes(t) || f.sku.includes(t) || (f.codigo_barras ?? '').includes(t)),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Nombre, SKU o código de barras…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant={soloInvisibles ? 'default' : 'outline'} size="sm"
          onClick={() => setSoloInvisibles((v) => !v)}>
          Sólo los invisibles antes de v0.91
        </Button>
        <Button variant="outline" size="sm" className="gap-1"
          onClick={() => exportExcel('regla-9-no-publicables', filtradas.map((f) => ({
            SKU: f.sku,
            'Código de barras': f.codigo_barras ?? '',
            Producto: f.nombre,
            Laboratorio: f.laboratorio ?? '',
            'Condición en SIFACO': f.condicion_venta ?? '',
            Controlado: f.lista_controlado ?? '',
            Stock: Number(f.stock),
            Precio: f.precio_sugerido ?? '',
            'NORA lo sabía antes de v0.91': f.visible_antes_de_v091 ? 'sí' : 'no',
            'Qué hacer': 'Buscar este código de barras en lo que se subió al canal. Si está, despublicarlo.',
          })))}>
          <Download className="size-3.5" /> Exportar los {filtradas.length}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtradas.length.toLocaleString('es-AR')} de {filas.length.toLocaleString('es-AR')} productos
        {filtradas.length > MAX_EN_PANTALLA && (
          <> · se muestran los primeros {MAX_EN_PANTALLA}; el .xlsx trae todos</>
        )}
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Código de barras</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Condición</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="px-3 py-2">NORA lo sabía</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtradas.slice(0, MAX_EN_PANTALLA).map((f) => (
              <tr key={f.producto_id}>
                <td className="px-3 py-2 tabular-nums">{f.sku}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{f.codigo_barras}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{f.nombre}</div>
                  {f.laboratorio && <div className="text-xs text-muted-foreground">{f.laboratorio}</div>}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="destructive" className="text-[10px]">{f.condicion_venta}</Badge>
                  {f.lista_controlado && (
                    <Badge variant="outline" className="ml-1 text-[10px]">{f.lista_controlado}</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(f.stock)}</td>
                <td className="px-3 py-2 text-xs">
                  {f.visible_antes_de_v091
                    ? <span className="text-muted-foreground">sí</span>
                    : <span className="font-medium text-amber-600 dark:text-amber-400">no, era invisible</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
