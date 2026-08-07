'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PackageX, Receipt, TrendingUp, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatARS } from '@/lib/utils/format'

type Totales = { cantidadFaltante: number; facturadoDeMas: number; precioDistinto: number; total: number }

/**
 * Qué hacer con las diferencias.
 *
 * NORA propone el cálculo; la decisión es siempre de una persona. En especial
 * la de precio: aceptar un aumento sin dejar escrito por qué es cómo se pierde
 * el rastro de cuándo y con qué explicación subió el costo.
 */
export function AccionesConciliacion({
  conciliacionId,
  estado,
  totales,
}: {
  conciliacionId: string
  estado: string
  totales: Totales
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [panel, setPanel] = useState<'precio' | 'cerrar' | null>(null)
  const [motivo, setMotivo] = useState('')
  const cerrada = estado === 'cerrada_manual'

  async function ejecutar(body: any, clave: string) {
    setBusy(clave)
    try {
      const r = await fetch(`/api/conciliaciones/${conciliacionId}/accion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { toast.error(j?.error ?? 'No pude completar la acción.'); return }
      toast.success(j.mensaje ?? 'Listo.')
      setPanel(null)
      setMotivo('')
      router.refresh()
    } catch {
      toast.error('Se cortó la conexión.')
    } finally {
      setBusy(null)
    }
  }

  if (cerrada) {
    return (
      <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
        Esta conciliación se cerró a mano. Queda como registro de la decisión.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Qué hacemos</div>

      <div className="flex flex-wrap gap-2">
        {totales.cantidadFaltante > 0 && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => ejecutar({ accion: 'reclamar_faltante' }, 'falt')}>
            {busy === 'falt' ? <Loader2 className="size-3.5 animate-spin" /> : <PackageX className="size-3.5" />}
            Reclamar faltante ({formatARS(totales.cantidadFaltante)})
          </Button>
        )}

        {totales.facturadoDeMas > 0 && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => ejecutar({ accion: 'esperar_nc' }, 'nc')}>
            {busy === 'nc' ? <Loader2 className="size-3.5 animate-spin" /> : <Receipt className="size-3.5" />}
            Pedir nota de crédito ({formatARS(totales.facturadoDeMas)})
          </Button>
        )}

        {totales.precioDistinto !== 0 && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setPanel(panel === 'precio' ? null : 'precio')}>
            <TrendingUp className="size-3.5" /> Resolver el precio ({formatARS(totales.precioDistinto)})
          </Button>
        )}

        <Button size="sm" variant="ghost" className="ml-auto" disabled={!!busy} onClick={() => setPanel(panel === 'cerrar' ? null : 'cerrar')}>
          <X className="size-3.5" /> Cerrar a mano
        </Button>
      </div>

      {panel === 'precio' && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            El precio vino distinto al pactado en la orden. Elegí qué hacer y dejá escrito por qué:
            dentro de seis meses, esto es lo único que explica el cambio de costo.
          </p>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: lo hablé con el vendedor, subieron toda la línea por el dólar." />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy || !motivo.trim()} onClick={() => ejecutar({ accion: 'precio', decision: 'reclamar', motivo }, 'prec-r')}>
              {busy === 'prec-r' ? <Loader2 className="size-3.5 animate-spin" /> : <PackageX className="size-3.5" />}
              Reclamar la diferencia
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy || !motivo.trim()} onClick={() => ejecutar({ accion: 'precio', decision: 'aceptar', motivo }, 'prec-a')}>
              {busy === 'prec-a' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Aceptar el precio nuevo
            </Button>
          </div>
        </div>
      )}

      {panel === 'cerrar' && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Hay casos que el sistema no puede resolver. Cerrala con el motivo y queda registrado.
          </p>
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: el faltante se entregó en el remito siguiente, ya está." />
          <Button size="sm" disabled={!!busy || !motivo.trim()} onClick={() => ejecutar({ accion: 'cerrar', motivo }, 'cerrar')}>
            {busy === 'cerrar' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Cerrar conciliación
          </Button>
        </div>
      )}
    </div>
  )
}
