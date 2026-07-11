'use client'

import { useRef, useState } from 'react'
import { ShieldAlert, Check } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

/**
 * NORA OS · botón de pánico (OS-2b · D).
 *
 * Siempre accesible en mobile (fijo, abajo-izquierda). LONG-PRESS de 1.5s con
 * feedback visual para evitar falsos toques. Al completarse dispara la acción
 * de pánico (notif urgente a encargados + super_admin + mensaje en el canal de
 * la sucursal). No hace llamadas ni integraciones externas.
 */
export function PanicButton() {
  const [pressing, setPressing] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function start() {
    if (busy || sent) return
    setPressing(true)
    timer.current = setTimeout(fire, 1500)
  }
  function cancel() {
    setPressing(false)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  async function fire() {
    setPressing(false)
    setBusy(true)
    try {
      const r = await fetch('/api/comunicacion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'panico' }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo enviar.')
      try { navigator.vibrate?.(200) } catch { /* no vibrate */ }
      setSent(true)
      toast.success('🚨 Aviso de pánico enviado a los encargados.')
      setTimeout(() => setSent(false), 6000)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo enviar el aviso.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      aria-label="Botón de pánico — mantené presionado"
      title="Mantené presionado 1.5s para pedir ayuda"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      className={cn(
        'fixed bottom-20 left-4 z-30 flex size-12 items-center justify-center overflow-hidden rounded-full text-white shadow-lg transition-transform active:scale-95 lg:hidden',
        sent ? 'bg-emerald-600' : 'bg-rose-600',
      )}
    >
      {/* Relleno de long-press */}
      <span
        className={cn('absolute inset-0 origin-bottom bg-rose-900/70', pressing ? 'scale-y-100 duration-[1500ms]' : 'scale-y-0 duration-100')}
        style={{ transitionProperty: 'transform' }}
      />
      {sent ? <Check className="relative size-5" /> : <ShieldAlert className="relative size-5" />}
    </button>
  )
}
