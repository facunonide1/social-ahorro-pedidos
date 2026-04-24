'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PAGO_ESTADO_LABELS } from '@/lib/types/admin'
import type { PagoEstado } from '@/lib/types/admin'

const NEXT_ESTADOS: Record<PagoEstado, PagoEstado[]> = {
  solicitado: ['aprobado', 'anulado'],
  aprobado:   ['ejecutado', 'anulado'],
  ejecutado:  ['conciliado', 'anulado'],
  conciliado: [],
  anulado:    [],
}

const COLORS: Record<PagoEstado, { bg: string; fg: string; border: string }> = {
  solicitado: { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  aprobado:   { fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
  ejecutado:  { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  conciliado: { fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
  anulado:    { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export default function PagoEstadoActions({
  pagoId, currentEstado,
}: {
  pagoId: string
  currentEstado: PagoEstado
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opciones = NEXT_ESTADOS[currentEstado]
  if (opciones.length === 0) return null

  async function change(next: PagoEstado) {
    if (next === 'anulado' && !window.confirm('Anular el pago revierte las facturas asociadas. ¿Confirmás?')) return
    setBusy(true); setErr(null)
    const res = await fetch(`/api/hub/pagos/${pagoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: next }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(json.hint || json.error || 'Error al cambiar el estado.'); return }
    router.refresh()
  }

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CAMBIAR ESTADO</div>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {opciones.map(s => {
          const c = COLORS[s]
          return (
            <button key={s} onClick={() => change(s)} disabled={busy}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: c.bg, color: c.fg, border: `1.5px solid ${c.border}`,
                cursor: busy ? 'wait' : 'pointer',
              }}>
              → {PAGO_ESTADO_LABELS[s]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
