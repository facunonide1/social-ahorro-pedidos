'use client'

import { Download } from 'lucide-react'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'

export type RendRow = { id: string; codigo: string | null; nombre: string; tipo: string; uplift: number; unidades: number; rentabilidad: number; mejorSucursal: string; etiqueta: string }

export function RendimientoExport({ rows }: { rows: RendRow[] }) {
  return (
    <Button variant="outline" size="sm" className="ml-auto" disabled={!rows.length}
      onClick={() => exportExcel('rendimiento-ofertas', rows.map((r) => ({ Codigo: r.codigo, Oferta: r.nombre, Tipo: r.tipo, 'Uplift %': r.uplift, Unidades: r.unidades, 'Margen entregado': r.rentabilidad, 'Mejor sucursal': r.mejorSucursal, Etiqueta: r.etiqueta })))}>
      <Download className="size-4" /> Excel
    </Button>
  )
}
