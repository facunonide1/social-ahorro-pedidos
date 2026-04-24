import BootstrapForm from './form'

export const dynamic = 'force-dynamic'

export default function BootstrapPage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#faf8f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: '#fff', border: '0.5px solid #ede9e4', padding: '10px 16px',
          borderRadius: 999, fontSize: 13, fontWeight: 700, color: '#2a2a2a',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: '#FF6D6E' }} />
          Social Ahorro · Admin Hub
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#999' }}>
          Configuración inicial · una sola vez
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 24, padding: '28px 24px', border: '0.5px solid #ede9e4' }}>
        <BootstrapForm />
      </div>
    </div>
  )
}
