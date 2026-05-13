'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

export default function SyncButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  async function runSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'error')
      toast.success(`+${json.inserted} nuevos`, {
        description: `${json.fetched} revisados`,
      })
      router.refresh()
    } catch (e: unknown) {
      toast.error('No pudimos sincronizar', {
        description: e instanceof Error ? e.message : 'Error desconocido',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Button onClick={runSync} disabled={syncing} variant="outline" size="sm">
      <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
      {syncing ? 'Sincronizando…' : 'Sincronizar Woo'}
    </Button>
  )
}
