'use client'

export default function PrintButton() {
  return (
    <button onClick={() => window.print()}
      style={{
        padding: '9px 14px', border: 'none', borderRadius: 10,
        background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
      🖨 Imprimir
    </button>
  )
}
