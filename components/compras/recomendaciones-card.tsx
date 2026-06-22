import Link from 'next/link'
import { Sparkles, ArrowRight, Zap, Moon } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { getRecomendaciones } from '@/lib/compras/recomendaciones'

/**
 * Card drop-in: NORA narra qué comprar y cuánto dinero está dormido, según las
 * ventas reales (ventas_diarias). No rompe nada si no hay ventas cargadas
 * (devuelve un aviso suave que linkea al Centro de Datos).
 */
export async function RecomendacionesComprasCard({
  sucursalId, esTodas, dias = 14, compact = false,
}: { sucursalId: string | null; esTodas: boolean; dias?: number; compact?: boolean }) {
  const sb = createClient()
  const { resumen, recomendaciones } = await getRecomendaciones(sb, { sucursalId, esTodas, dias, diasObjetivo: dias })

  if (!resumen.hayVentas) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-4">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4 text-primary" /> Qué comprar</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá las ventas del día en el <Link href="/admin/centro-datos/ventas-diarias" className="text-primary hover:underline">Centro de Datos</Link> para que NORA recomiende qué comprar.
        </p>
      </div>
    )
  }

  const top = recomendaciones.slice(0, compact ? 3 : 5)
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-primary"><Sparkles className="size-4" /> NORA · Qué comprar</div>
        <Link href="/admin/compras/recomendaciones" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">Ver todo <ArrowRight className="size-3" /></Link>
      </div>
      <p className="text-sm">
        {resumen.nUrgentes > 0 && <><b className="text-rose-600">{resumen.nUrgentes}</b> quiebre{resumen.nUrgentes === 1 ? '' : 's'} inminente{resumen.nUrgentes === 1 ? '' : 's'} · </>}
        <b>{resumen.nRecomendados}</b> productos a reponer ({formatARS(resumen.costoReposicion)})
        {resumen.plataDormida > 0 && <> · <b className="text-amber-600">{formatARS(resumen.plataDormida)}</b> dormidos</>}.
      </p>
      {!compact && top.length > 0 && (
        <div className="mt-2 space-y-1">
          {top.map((r) => (
            <div key={r.producto_id} className="flex items-center gap-2 text-sm">
              {r.urgente ? <Zap className="size-3.5 shrink-0 text-rose-600" /> : <span className="w-3.5" />}
              <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
              <span className="text-xs text-muted-foreground">se agota en {r.cobertura_dias}d</span>
              <span className="font-medium">+{r.sugerido}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
