export default function DiagnosticPanel({
  title,
  details,
}: {
  title: string
  details: Record<string, string | null | undefined>
}) {
  return (
    <div style={{
      minHeight: '100vh', background: '#faf8f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        maxWidth: 720, width: '100%', background: '#fff',
        border: '0.5px solid #ede9e4', borderRadius: 18, padding: 24,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#FF6D6E', letterSpacing: '0.4px', marginBottom: 8 }}>
          DIAGNÓSTICO
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#2a2a2a', marginBottom: 14, letterSpacing: '-0.3px' }}>
          {title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', marginBottom: 16 }}>
          {Object.entries(details).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                {k}
              </div>
              <div style={{ fontSize: 13, color: '#2a2a2a', background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 8, padding: '8px 10px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                {v || '—'}
              </div>
            </div>
          ))}
        </div>
        <a href="/logout"
          style={{ display: 'inline-block', padding: '10px 14px', border: '1.5px solid #f0ede8', borderRadius: 12, background: '#fff', color: '#666', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Cerrar sesión
        </a>
      </div>
    </div>
  )
}
