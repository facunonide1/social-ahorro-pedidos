type Bucket = { date: string; count: number; total: number }

/**
 * Gráfico en SVG puro de pedidos por día (últimos 30 días) y
 * monto facturado. Sin librería externa, sin dependencias.
 */
export default function SalesChart({ buckets }: { buckets: Bucket[] }) {
  const maxCount = Math.max(1, ...buckets.map(b => b.count))
  const maxTotal = Math.max(1, ...buckets.map(b => b.total))

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
        <rect x={x + 2} y={y} width={Math.max(2, barW - 4)} height={h}
          fill="#726DFF" rx={3} />
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
        <rect x={x + 2} y={y} width={Math.max(2, barW - 4)} height={h}
          fill="#1f8a4c" rx={3} />
        <title>{`${b.date}\n$${b.total.toLocaleString('es-AR')}`}</title>
      </g>
    )
  })

  // Labels de ejes: primer día, último día
  const firstDate = buckets[0]?.date
  const lastDate  = buckets[buckets.length - 1]?.date
  const totalSuma = buckets.reduce((acc, b) => acc + b.total, 0)
  const countSuma = buckets.reduce((acc, b) => acc + b.count, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Summary label="Pedidos (30d)" value={countSuma.toString()} fg="#726DFF" bg="#eeedff" border="#d9d6ff" />
        <Summary label="Facturado (30d)" value={`$${totalSuma.toLocaleString('es-AR')}`} fg="#1f8a4c" bg="#eaf7ef" border="#8fd1a8" />
        <Summary label="Promedio diario" value={String(Math.round(countSuma / Math.max(1, buckets.length)))} fg="#2855c7" bg="#e9f0ff" border="#9cb6ee" />
        <Summary label="Ticket promedio" value={`$${Math.round(totalSuma / Math.max(1, countSuma)).toLocaleString('es-AR')}`} fg="#c6831a" bg="#fff7ec" border="#edc989" />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#726DFF', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Pedidos por día</span>
          <span style={{ fontSize: 11, color: '#aaa' }}>{firstDate} → {lastDate}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 160, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12 }}>
          {countBars}
        </svg>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1f8a4c', letterSpacing: '0.3px', textTransform: 'uppercase' }}>Facturación por día</span>
          <span style={{ fontSize: 11, color: '#aaa' }}>Sólo pedidos no cancelados</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 160, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12 }}>
          {totalBars}
        </svg>
      </div>
    </div>
  )
}

function Summary({ label, value, fg, bg, border }: { label: string; value: string; fg: string; bg: string; border: string }) {
  return (
    <div style={{ background: bg, border: `0.5px solid ${border}`, borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: fg, letterSpacing: '0.3px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: fg, letterSpacing: '-0.4px', marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}
