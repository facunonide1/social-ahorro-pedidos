import { Info } from 'lucide-react'

import { SECTORES_VACIOS } from '@/lib/demo/sin-datos-reales'

/**
 * LO QUE LE FALTA A ESTE SECTOR, EN LUGAR DE UN CERO.
 *
 * Se muestra sólo cuando de verdad no hay datos reales. Dice las tres cosas que
 * un cero no dice: qué no se puede hacer, por qué, y qué lo destraba.
 */
export function SinDatos({ sector, hayReales }: { sector: keyof typeof SECTORES_VACIOS; hayReales: boolean }) {
  if (hayReales) return null
  const s = SECTORES_VACIOS[sector]
  if (!s) return null

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-sm leading-snug">
          <p className="font-medium">{s.que}</p>
          <p className="text-muted-foreground">{s.porque}</p>
          <p><span className="text-muted-foreground">Se destraba con:</span> {s.destraba}</p>
        </div>
      </div>
    </div>
  )
}
