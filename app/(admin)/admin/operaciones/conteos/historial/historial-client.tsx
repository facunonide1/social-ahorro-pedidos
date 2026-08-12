'use client'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ItemEnElTiempo, ZonaEnElTiempo } from '@/lib/conteo/historial'
import { exportExcel } from '@/lib/utils/export-excel'

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

/** Los items que repiten, y el .xlsx con SKU de todo lo exportable. */
export default function HistorialClient({
  zonas,
  items,
}: {
  zonas: ZonaEnElTiempo[]
  items: ItemEnElTiempo[]
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Items que repiten</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportExcel(
                'conteos-por-zona',
                zonas.map((z) => ({
                  Zona: z.zona,
                  Punto: z.punto ?? '',
                  Items: z.items,
                  Conteos: z.conteos,
                  // Vacío y no cero: una zona sin contar no tiene cero diferencias.
                  'Último con diferencia': z.ultimoConDiferencia ?? '',
                  'Último valor': z.ultimoValor ?? '',
                  Estado:
                    z.estado === 'nunca_contada'
                      ? 'nunca se contó'
                      : z.estado === 'sin_diferencias'
                        ? 'sin diferencias'
                        : 'con diferencias',
                  Tendencia: z.tendencia,
                })),
                { sheet: 'Zonas' },
              )
            }
          >
            <Download className="mr-2 size-4" />
            Zonas
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            onClick={() =>
              exportExcel(
                'items-que-repiten',
                items.map((i) => ({
                  SKU: i.sku ?? '',
                  Descripción: i.descripcion,
                  'Veces contado': i.vecesContado,
                  'Veces con diferencia': i.vecesConDiferencia,
                  'Valor acumulado': i.valorAcumulado,
                })),
                { sheet: 'Items' },
              )
            }
          >
            <Download className="mr-2 size-4" />
            Items
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Ningún item dio diferencia en dos conteos distintos todavía. Con un solo conteo
          por zona esto siempre va a estar vacío: la lista necesita repetición para decir
          algo.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-2 font-medium">SKU</th>
                <th className="p-2 font-medium">Item</th>
                <th className="p-2 text-right font-medium">Contado</th>
                <th className="p-2 text-right font-medium">Con diferencia</th>
                <th className="p-2 text-right font-medium">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.sku ?? i.descripcion}`} className="border-t">
                  <td className="p-2 font-mono text-xs">{i.sku ?? '—'}</td>
                  <td className="p-2">{i.descripcion}</td>
                  <td className="p-2 text-right">{i.vecesContado}</td>
                  <td className="p-2 text-right font-medium">{i.vecesConDiferencia}</td>
                  <td className="p-2 text-right">{pesos(i.valorAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
