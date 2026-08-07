'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Link2, Loader2, PackageX } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

type Candidata = {
  ordenId: string
  codigo: string | null
  fecha: string
  total: number
  estado: string
  itemsEnComun: number
  itemsDocumento: number
  coincidencia: number
  diasDeDiferencia: number
  yaVinculada: boolean
}

/**
 * Vinculación de un documento a su orden de compra.
 *
 * Sugiere candidatas con su porcentaje de coincidencia, pero NUNCA vincula
 * sola: quien carga la factura sabe cosas que el sistema no. Vincular mal
 * genera diferencias fantasma que después alguien tiene que investigar.
 *
 * "Fue una compra directa" siempre está disponible: en perfumería y
 * supermercado se le compra al viajante sin orden previa, y sin esa salida la
 * bandeja se llenaría de casos imposibles de cerrar.
 */
export function VincularOrden({
  documentoId,
  tipo,
  onListo,
}: {
  documentoId: string
  tipo: string
  onListo?: (conciliacionId: string) => void
}) {
  const router = useRouter()
  const [cands, setCands] = useState<Candidata[] | null>(null)
  const [elegidas, setElegidas] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const rol = tipo === 'remito' ? 'remito' : tipo === 'nota_credito' ? 'nota_credito' : 'factura'

  useEffect(() => {
    let vivo = true
    fetch(`/api/documentos/${documentoId}/vincular`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setCands(j?.candidatas ?? []) })
      .catch(() => { if (vivo) setCands([]) })
    return () => { vivo = false }
  }, [documentoId])

  async function enviar(sinOrden: boolean) {
    setBusy(true)
    try {
      const r = await fetch(`/api/documentos/${documentoId}/vincular`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rol, orden_ids: sinOrden ? [] : elegidas, sin_orden: sinOrden }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { toast.error(j?.error ?? 'No pude vincular el documento.'); return }

      toast.success(
        sinOrden
          ? 'Marcado como compra directa.'
          : j.estado === 'con_diferencias'
            ? `Vinculado. Hay diferencias por ${formatARS(j.totales?.total ?? 0)}.`
            : 'Vinculado. Los números cierran.',
      )
      onListo?.(j.conciliacion_id)
      router.refresh()
    } catch {
      toast.error('Se cortó la conexión al vincular.')
    } finally {
      setBusy(false)
    }
  }

  if (cands === null) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Buscando órdenes de este proveedor…
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">¿A qué pedido corresponde?</span>
      </div>

      {cands.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No encontré órdenes de este proveedor en la ventana de búsqueda.
        </p>
      ) : (
        <div className="space-y-1">
          {cands.map((c) => {
            const sel = elegidas.includes(c.ordenId)
            return (
              <button
                key={c.ordenId}
                type="button"
                onClick={() => setElegidas((xs) => (sel ? xs.filter((x) => x !== c.ordenId) : [...xs, c.ordenId]))}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                  sel ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
                )}
              >
                <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border', sel ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {sel && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c.codigo ?? 'Orden sin código'}</span>
                  <span className="ml-1.5 text-muted-foreground">{c.fecha} · {formatARS(c.total)}</span>
                  {c.yaVinculada && <span className="ml-1.5 text-[10px] text-muted-foreground">(ya tiene documentos)</span>}
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {c.itemsEnComun} de {c.itemsDocumento} productos coinciden
                    {c.diasDeDiferencia > 0 && ` · ${c.diasDeDiferencia} días antes`}
                  </span>
                </span>
                <span className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                  c.coincidencia >= 0.7 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
                )}>
                  {Math.round(c.coincidencia * 100)}%
                </span>
              </button>
            )
          })}
          <p className="pt-0.5 text-[10px] text-muted-foreground">
            Podés elegir más de una: un remito puede cubrir dos pedidos.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" disabled={busy || !elegidas.length} onClick={() => enviar(false)}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
          Vincular {elegidas.length > 1 ? `a ${elegidas.length} órdenes` : ''}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => enviar(true)}>
          <PackageX className="size-3.5" /> Fue una compra directa
        </Button>
      </div>
    </div>
  )
}
