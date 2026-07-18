'use client'

import { Download } from 'lucide-react'

import { exportExcel, exportCsv } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'

export type FilaExport = { sku: string; ean: string; producto: string; precio: number | null; fecha_inicio: string | null; fecha_fin: string | null; oferta: string }

export function ExportDownload({ nombre, filas }: { nombre: string; filas: FilaExport[] }) {
  const rows = filas.map((f) => ({ SKU: f.sku, EAN: f.ean, Producto: f.producto, Precio: f.precio, Desde: f.fecha_inicio, Hasta: f.fecha_fin, Oferta: f.oferta }))
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => exportExcel(nombre, rows)} disabled={!rows.length}><Download className="size-4" /> Descargar .xlsx</Button>
      <Button size="sm" variant="outline" onClick={() => exportCsv(nombre, rows)} disabled={!rows.length}><Download className="size-4" /> .csv</Button>
    </div>
  )
}
