'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

export function RegenerarResumenButton({
  label = 'Regenerar',
}: {
  label?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function regenerar() {
    setBusy(true)
    try {
      const res = await fetch('/api/ai/resumen-diario', { method: 'POST' })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`)
      toast.success('Resumen generado.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo generar el resumen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={regenerar} disabled={busy} variant="outline">
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Generando…
        </>
      ) : (
        <>
          <RefreshCw className="size-4" />
          {label}
        </>
      )}
    </Button>
  )
}
