'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

/** Tandas como máximo por clic: cada una revisa hasta 80 líneas y corta a los 40 s. */
const MAX_TANDAS = 40

/**
 * Recorre `POST /api/compras/rematch` siguiendo el cursor hasta que no quede
 * nada. Cada pedido entra en 60 s; lo que ya se cruzó no se pisa.
 */
export function RecalcularCruce() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function correr() {
    setBusy(true)
    let cursor: string | null = null
    let matcheadas = 0
    let revisadas = 0
    try {
      for (let i = 0; i < MAX_TANDAS; i++) {
        const url: string = cursor ? `/api/compras/rematch?cursor=${cursor}` : '/api/compras/rematch'
        const r = await fetch(url, { method: 'POST' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error ?? 'no se pudo recalcular')
        matcheadas += Number(j.matcheadas ?? 0)
        revisadas += Number(j.revisadas ?? 0)
        cursor = j.siguiente ?? null
        if (!cursor) break
      }
      toast.success(`Cruce recalculado: ${matcheadas} de ${revisadas} líneas revisadas se cruzaron.${cursor ? ' Quedan más: volvé a apretar.' : ''}`)
      router.refresh()
    } catch (e: any) {
      toast.error(`${e?.message ?? 'Error'}. Lo que ya se cruzó quedó guardado.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={correr} disabled={busy} variant="outline">
      {busy ? 'Recalculando…' : 'Recalcular cruce'}
    </Button>
  )
}
