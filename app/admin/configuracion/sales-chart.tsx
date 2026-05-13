import { KpiCard } from '@/components/cards/kpi-card'

type Bucket = { date: string; count: number; total: number }

/**
 * Gráfico SVG de pedidos y facturación por día (últimos 30). Sin dependencias.
 */
export default function SalesChart({ buckets }: { buckets: Bucket[] }) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count))
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total))

  const W = 760
  const H = 160
  const PAD = 24
  const barW = (W - PAD * 2) / Math.max(1, buckets.length)

  const countBars = buckets.map((b, i) => {
    const x = PAD + i * barW
    const h = (b.count / maxCount) * (H - PAD * 2)
    const y = H - PAD - h
    return (
      <g key={`c-${b.date}`}>
        <rect
          x={x + 2}
          y={y}
          width={Math.max(2, barW - 4)}
          height={h}
          className="fill-primary"
          rx={3}
        />
        <title>{`${b.date}\n${b.count} pedidos`}</title>
      </g>
    )
  })

  const totalBars = buckets.map((b, i) => {
    const x = PAD + i * barW
    const h = (b.total / maxTotal) * (H - PAD * 2)
    const y = H - PAD - h
    return (
      <g key={`t-${b.date}`}>
        <rect
          x={x + 2}
          y={y}
          width={Math.max(2, barW - 4)}
          height={h}
          className="fill-success"
          rx={3}
        />
        <title>{`${b.date}\n$${b.total.toLocaleString('es-AR')}`}</title>
      </g>
    )
  })

  const firstDate = buckets[0]?.date
  const lastDate = buckets[buckets.length - 1]?.date
  const totalSuma = buckets.reduce((acc, b) => acc + b.total, 0)
  const countSuma = buckets.reduce((acc, b) => acc + b.count, 0)
  const promedioDiario = Math.round(countSuma / Math.max(1, buckets.length))
  const ticketPromedio = Math.round(totalSuma / Math.max(1, countSuma))

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Pedidos (30d)" value={countSuma} />
        <KpiCard
          label="Facturado (30d)"
          value={totalSuma}
          format="currency"
          variant="success"
        />
        <KpiCard label="Promedio diario" value={promedioDiario} />
        <KpiCard
          label="Ticket promedio"
          value={ticketPromedio}
          format="currency"
          variant="warning"
        />
      </section>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Pedidos por día
          </span>
          <span className="text-xs text-muted-foreground">
            {firstDate} → {lastDate}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-40 w-full rounded-md border border-border bg-muted/30"
        >
          {countBars}
        </svg>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-success">
            Facturación por día
          </span>
          <span className="text-xs text-muted-foreground">
            Sólo pedidos no cancelados
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-40 w-full rounded-md border border-border bg-muted/30"
        >
          {totalBars}
        </svg>
      </div>
    </div>
  )
}
