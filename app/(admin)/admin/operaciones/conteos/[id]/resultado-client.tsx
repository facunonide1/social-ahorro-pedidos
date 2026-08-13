'use client'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AMBITO_TEXTO, type Ambito } from '@/lib/conteo/ambito'
import { exportExcel } from '@/lib/utils/export-excel'

export type FilaResultado = {
  sku: string | null
  descripcion: string
  contada: number | null
  esperada: number | null
  diferencia: number | null
  valor: number | null
  salteado: boolean
  motivo: string | null
  nota: string | null
}

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

/** El detalle, ordenado por monto. Y el .xlsx con SKU (regla de oro 6). */
export default function ResultadoClient({
  zona,
  ambito,
  filas,
}: {
  zona: string
  ambito: Ambito
  filas: FilaResultado[]
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Renglón por renglón</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            exportExcel(
              `conteo-${zona.toLowerCase().replace(/\s+/g, '-')}`,
              filas.map((f) => ({
                Zona: zona,
                // Va en CADA fila y no en el nombre del archivo: quien recibe la
                // tarea de corrección abre el Excel, no lee cómo se llama, y sin
                // esto no sabe si el faltante es contra góndola o contra el total.
                'Comparado contra': AMBITO_TEXTO[ambito].corto,
                SKU: f.sku ?? '',
                Descripción: f.descripcion,
                Contada: f.contada ?? '',
                'Según el sistema': f.esperada ?? '',
                Diferencia: f.diferencia ?? '',
                'Valor de la diferencia': f.valor ?? '',
                Salteado: f.salteado ? 'sí' : '',
                Motivo: f.motivo ?? '',
                Nota: f.nota ?? '',
              })),
              { sheet: 'Conteo' },
            )
          }
        >
          <Download className="mr-2 size-4" />
          Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="p-2 font-medium">SKU</th>
              <th className="p-2 font-medium">Item</th>
              <th className="p-2 text-right font-medium">Contaste</th>
              <th className="p-2 text-right font-medium">El sistema dice</th>
              <th className="p-2 text-right font-medium">Diferencia</th>
              <th className="p-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={`${f.sku ?? 'x'}-${i}`} className="border-t">
                <td className="p-2 font-mono text-xs">{f.sku ?? '—'}</td>
                <td className="p-2">
                  {f.descripcion}
                  {f.nota ? <span className="block text-xs text-muted-foreground">{f.nota}</span> : null}
                  {f.salteado ? (
                    <span className="block text-xs text-muted-foreground">
                      salteado: {f.motivo ?? 'sin motivo'}
                    </span>
                  ) : null}
                </td>
                <td className="p-2 text-right">{f.contada ?? '—'}</td>
                <td className="p-2 text-right">
                  {f.esperada ?? <span className="text-xs text-muted-foreground">no se pudo comparar</span>}
                </td>
                <td
                  className={`p-2 text-right font-medium ${
                    f.diferencia === null || f.diferencia === 0
                      ? ''
                      : f.diferencia < 0
                        ? 'text-destructive'
                        : 'text-amber-700'
                  }`}
                >
                  {f.diferencia === null ? '—' : f.diferencia > 0 ? `+${f.diferencia}` : f.diferencia}
                </td>
                <td className="p-2 text-right">
                  {f.valor === null || Number(f.valor) === 0 ? '—' : pesos(Math.abs(Number(f.valor)))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
