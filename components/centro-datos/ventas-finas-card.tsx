import Link from 'next/link'
import { ShoppingBag, ArrowRight } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'

/**
 * Card drop-in: ranking de más vendidos según la fuente FINA (ventas_diarias
 * del Centro de Datos), complemento del MES_ACT acumulado. Se inserta en
 * Operaciones/Análisis y Compras/faltantes. No rompe nada si no hay datos.
 */
export async function VentasFinasCard({
  sucursalId, esTodas, dias = 7, limit = 8, titulo = 'Más vendidos (ventas reales)',
}: { sucursalId: string | null; esTodas: boolean; dias?: number; limit?: number; titulo?: string }) {
  const sb = createClient()
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
  const hasta = new Date().toISOString().slice(0, 10)
  const { data } = await sb.rpc('cd_ranking_vendidos', {
    p_sucursal: esTodas ? null : sucursalId, p_desde: desde, p_hasta: hasta, p_limit: limit,
  })
  const rows = (data ?? []) as { sku: string; descripcion: string | null; cantidad: number; monto: number }[]
  if (!rows.length) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium"><ShoppingBag className="size-4 text-primary" /> {titulo}</div>
        <Link href="/admin/centro-datos/ventas-diarias" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">Ver todo <ArrowRight className="size-3" /></Link>
      </div>
      <div className="text-[11px] text-muted-foreground">Últimos {dias} días · fuente fina del Centro de Datos</div>
      <div className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <div key={r.sku} className="flex items-center gap-2 text-sm">
            <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{r.descripcion ?? r.sku}</span>
            <span className="font-medium">{Math.round(r.cantidad).toLocaleString('es-AR')} u.</span>
          </div>
        ))}
      </div>
    </div>
  )
}
