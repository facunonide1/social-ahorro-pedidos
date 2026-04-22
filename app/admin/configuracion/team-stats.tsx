type RepStat = {
  id: string
  name: string
  delivered: number
  in_progress: number
  avg_minutes: number | null
}

type ZoneStat = {
  id: string | null
  name: string
  color: string
  total: number
  delivered: number
  avg_minutes: number | null
}

function formatMins(m: number | null) {
  if (m === null) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

export default function TeamStats({ reps, zones }: { reps: RepStat[]; zones: ZoneStat[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* REPARTIDORES */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#726DFF', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 8 }}>
          Repartidores (últimos 30 días)
        </div>
        {reps.length === 0 ? (
          <div style={{ fontSize: 13, color: '#aaa' }}>Todavía no hay repartidores activos con entregas.</div>
        ) : (
          <div className="sa-list-table-wrap" style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4' }}>
                  {['Repartidor','Entregados','En progreso','Tiempo prom. entrega'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reps.map(r => (
                  <tr key={r.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '2px 8px', borderRadius: 999 }}>
                        {r.delivered}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: r.in_progress > 0 ? '#2855c7' : '#aaa' }}>
                      {r.in_progress}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{formatMins(r.avg_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ZONAS */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1f8a4c', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 8 }}>
          Zonas (últimos 30 días)
        </div>
        {zones.length === 0 ? (
          <div style={{ fontSize: 13, color: '#aaa' }}>Sin datos de zonas en los últimos 30 días.</div>
        ) : (
          <div className="sa-list-table-wrap" style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4' }}>
                  {['Zona','Total pedidos','Entregados','Tiempo prom. entrega'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map(z => (
                  <tr key={z.id ?? 'sin-zona'} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                    <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: z.color }} />
                      <span style={{ fontWeight: 600 }}>{z.name}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{z.total}</td>
                    <td style={{ padding: '10px 12px', color: '#1f8a4c' }}>{z.delivered}</td>
                    <td style={{ padding: '10px 12px', color: '#666' }}>{formatMins(z.avg_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
