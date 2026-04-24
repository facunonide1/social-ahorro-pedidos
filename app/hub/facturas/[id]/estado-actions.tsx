'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaEstado } from '@/lib/types/admin'

const NEXT_ESTADOS: Record<FacturaEstado, FacturaEstado[]> = {
  borrador:             ['pendiente_aprobacion', 'aprobada', 'anulada'],
  pendiente_aprobacion: ['aprobada', 'rechazada'],
  aprobada:             ['programada_pago', 'rechazada'],
  programada_pago:      ['pagada_parcial', 'pagada'],
  pagada_parcial:       ['pagada'],
  pagada:               [],
  vencida:              ['programada_pago', 'pagada'],
  rechazada:            ['borrador'],
  anulada:              [],
}

const COLORS: Record<FacturaEstado, { bg: string; fg: string; border: string }> = {
  borrador:             { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
  pendiente_aprobacion: { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  aprobada:             { fg: '#726DFF', bg: '#eeedff', border: '#d9d6ff' },
  programada_pago:      { fg: '#2855c7', bg: '#e9f0ff', border: '#9cb6ee' },
  pagada_parcial:       { fg: '#c6831a', bg: '#fff7ec', border: '#edc989' },
  pagada:               { fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' },
  vencida:              { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  rechazada:            { fg: '#a33',    bg: '#fbeaea', border: '#e0a8a8' },
  anulada:              { fg: '#888',    bg: '#f5f5f5', border: '#e2e2e2' },
}

export default function EstadoActions({
  facturaId, currentEstado,
}: {
  facturaId: string
  currentEstado: FacturaEstado
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const opciones = NEXT_ESTADOS[currentEstado]
  if (opciones.length === 0) return null

  async function change(next: FacturaEstado) {
    setBusy(true); setErr(null)
    const patch: Record<string, unknown> = { estado: next }
    if (next === 'aprobada') patch.approved_by = (await sb.auth.getUser()).data.user?.id ?? null
    const { error } = await sb.from('facturas_proveedor').update(patch).eq('id', facturaId)
    setBusy(false)
    if (error) { setErr(error.message); return }
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
              → {FACTURA_ESTADO_LABELS[s]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
