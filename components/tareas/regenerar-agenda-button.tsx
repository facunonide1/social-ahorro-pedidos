'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

/**
 * Botón super_admin para regenerar la agenda de hoy a demanda (F6-T · T4).
 * Llama a POST /api/cron/generar-agenda (idempotente).
 */
export function RegenerarAgendaButton({
  variant = 'outline',
}: {
  variant?: 'outline' | 'ghost' | 'default'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!confirm('¿Regenerar la agenda de hoy desde las recurrencias activas? No duplica tareas ya creadas.')) return
    setBusy(true)
    try {
      const r = await fetch('/api/cron/generar-agenda', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo regenerar.')
      toast.success(`Agenda regenerada: ${j.creadas} tarea${j.creadas === 1 ? '' : 's'} nueva${j.creadas === 1 ? '' : 's'}.`)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al regenerar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant={variant} size="sm" disabled={busy} onClick={run}>
      <RefreshCw className={busy ? 'size-4 animate-spin' : 'size-4'} />
      {busy ? 'Regenerando…' : 'Regenerar agenda de hoy'}
    </Button>
  )
}
