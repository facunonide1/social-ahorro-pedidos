'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Pause, Play, Square, CheckCircle2, Image, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type TareaLite = { id: string; titulo: string; estado: string; tipo: string }
export type ConfRow = { ok: number; total: number; faltan: string[] }

export function OfertaGestion({ ofertaId, estado, version, rol, tareas, cartel, confirmacion }: { ofertaId: string; estado: string; version: number; rol: string; tareas: TareaLite[]; cartel: { ok: number; total: number }; confirmacion: ConfRow }) {
  const router = useRouter()
  const gestor = ['super_admin', 'gerente', 'administrativo'].includes(rol)
  const [busy, setBusy] = useState(false)

  async function accion(body: any, ok: string) {
    setBusy(true)
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(ok); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  const pct = confirmacion.total > 0 ? Math.round((confirmacion.ok / confirmacion.total) * 100) : 0

  return (
    <div className="space-y-5">
      {gestor && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/admin/ofertas/${ofertaId}/cartel`}><Image className="size-4" /> Ver cartel</Link></Button>
          {estado === 'activa' && <Button size="sm" variant="outline" disabled={busy} onClick={() => accion({ accion: 'estado', id: ofertaId, estado: 'pausada' }, 'Oferta pausada.')}><Pause className="size-4" /> Pausar</Button>}
          {estado === 'pausada' && <Button size="sm" variant="outline" disabled={busy} onClick={() => accion({ accion: 'estado', id: ofertaId, estado: 'activa' }, 'Oferta reactivada.')}><Play className="size-4" /> Reactivar</Button>}
          {['activa', 'pausada', 'aprobada'].includes(estado) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('¿Finalizar la oferta? Dispara descartelado, despublicación y reversión SIFACO.')) accion({ accion: 'finalizar', id: ofertaId }, 'Finalizada — ciclo de cierre disparado.') }}><Square className="size-4" /> Finalizar</Button>}
          {['activa', 'pausada', 'aprobada'].includes(estado) && <Button size="sm" variant="ghost" className="text-rose-600" disabled={busy} onClick={() => { const m = prompt('Motivo de la cancelación (obligatorio):'); if (m && m.trim().length >= 3) accion({ accion: 'cancelar', id: ofertaId, motivo: m.trim() }, 'Oferta cancelada.'); else if (m != null) toast.error('El motivo es obligatorio.') }}><X className="size-4" /> Cancelar</Button>}
        </div>
      )}

      {tareas.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold">Tareas disparadas</h2>{cartel.total > 0 && <Badge variant={cartel.ok === cartel.total ? 'success' : 'warning'} className="font-normal">cartel {cartel.ok}/{cartel.total}</Badge>}</div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {tareas.map((t) => (
                  <tr key={t.id} className="border-t border-border/60 first:border-t-0">
                    <td className="px-3 py-1.5">{t.titulo}</td>
                    <td className="px-3 py-1.5 text-right"><Badge variant={['completada','en_aprobacion','en_verificacion'].includes(t.estado) ? 'success' : 'outline'} className="font-normal">{t.estado.replace(/_/g, ' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold">Confirmación del equipo</h2>
          <span className="text-sm text-muted-foreground">{confirmacion.ok}/{confirmacion.total} ({pct}%)</span>
          {gestor && confirmacion.faltan.length > 0 && <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={busy} onClick={() => accion({ accion: 'recordar', id: ofertaId }, 'Recordatorio enviado.')}><Bell className="size-3.5" /> Recordar a los que faltan</Button>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
        {confirmacion.faltan.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Faltan: {confirmacion.faltan.slice(0, 12).join(', ')}{confirmacion.faltan.length > 12 ? '…' : ''}</p>
        ) : confirmacion.total > 0 ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3.5" /> Todo el equipo confirmó.</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Las confirmaciones se generan al aprobar la oferta.</p>
        )}
      </section>
    </div>
  )
}
