'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'

import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

type Punto = { neto: number; fecha: string; proveedor: string; dias: number; origen?: string }
type Datos = { ultimo: Punto | null; mejor: Punto | null; precioSugerido: number | null; diasFresco?: number }

/**
 * Costo de reposición en la ficha de producto.
 *
 * SOLO informa costos. No sugiere precio de venta ni propone cambiarlo: SIFACO
 * es la autoridad de precio de venta. Si el catálogo ya tiene un precio
 * cargado, se muestra el margen que resulta — como dato, para que quien decide
 * lo vea, no como recomendación de hacer nada.
 */
export function CostoReposicion({ itemId }: { itemId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    fetch(`/api/documentos/costo/${itemId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) { setDatos(j); setCargando(false) } })
      .catch(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [itemId])

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Buscando costos…
      </div>
    )
  }

  if (!datos?.ultimo) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        Todavía no hay compras cargadas de este producto.
      </div>
    )
  }

  const { ultimo, mejor, precioSugerido, diasFresco = 60 } = datos
  const viejo = ultimo.dias > diasFresco
  const hayMejor = mejor && mejor.neto < ultimo.neto
  const margen = precioSugerido && precioSugerido > 0
    ? ((precioSugerido - ultimo.neto) / precioSugerido) * 100
    : null

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Costo de reposición</span>
        <Link href={`/admin/compras/costos/${itemId}`} className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">
          Ver histórico <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Último costo neto</div>
          <div className="font-mono text-lg tabular-nums">{formatARS(ultimo.neto)}</div>
          <div className={cn('text-[10px]', viejo ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
            {ultimo.fecha} · {ultimo.proveedor}
            {viejo && ` · hace ${ultimo.dias} días`}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Mejor disponible hoy</div>
          {mejor ? (
            <>
              <div className={cn('font-mono text-lg tabular-nums', hayMejor && 'text-emerald-600 dark:text-emerald-400')}>
                {formatARS(mejor.neto)}
              </div>
              <div className="text-[10px] text-muted-foreground">{mejor.proveedor} · {mejor.fecha}</div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Sin datos recientes (menos de {diasFresco} días).</div>
          )}
        </div>
      </div>

      {hayMejor && mejor && (
        <div className="rounded bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
          {mejor.proveedor} lo facturó {formatARS(ultimo.neto - mejor.neto)} más barato por unidad.
        </div>
      )}

      {margen != null && (
        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Con el precio de venta cargado en el catálogo ({formatARS(precioSugerido!)}), el margen sobre
          este costo da <b className="text-foreground tabular-nums">{margen.toFixed(1)}%</b>.
          {' '}Es un dato: el precio de venta se define en SIFACO.
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Importes netos, sin IVA.
      </p>
    </div>
  )
}
