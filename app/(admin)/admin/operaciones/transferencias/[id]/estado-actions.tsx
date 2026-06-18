'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { EstadoTransferencia } from '@/lib/types/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ACCIONES: Record<EstadoTransferencia, { accion: string; label: string }[]> = {
  solicitada: [{ accion: 'aprobar', label: 'Aprobar' }, { accion: 'cancelar', label: 'Cancelar' }],
  aprobada: [{ accion: 'enviar', label: 'Enviar (descuenta origen)' }, { accion: 'cancelar', label: 'Cancelar' }],
  en_transito: [{ accion: 'recibir', label: 'Recibir (suma destino)' }],
  recibida: [],
  cancelada: [],
}

export default function TransferenciaEstadoActions({
  transferenciaId,
  currentEstado,
}: {
  transferenciaId: string
  currentEstado: EstadoTransferencia
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const opciones = ACCIONES[currentEstado]
  if (opciones.length === 0) return null

  async function run(accion: string) {
    setBusy(accion)
    try {
      const r = await fetch('/api/inventario/transferencia', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: transferenciaId, accion }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success(j.conDiferencias ? 'Recibida con diferencias (se generó alerta).' : 'Estado actualizado.')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Acciones</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {opciones.map((o) => (
            <Button key={o.accion} type="button" variant={o.accion === 'cancelar' ? 'ghost' : 'outline'} size="sm" disabled={busy !== null} onClick={() => run(o.accion)}>
              {busy === o.accion ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
              {o.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
