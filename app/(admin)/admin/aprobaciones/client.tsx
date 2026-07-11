'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, HelpCircle, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  ESTADO_APROBACION_LABELS,
  TIPO_APROBACION_LABELS,
  type Aprobacion,
  type EstadoAprobacion,
  type TipoAprobacion,
} from '@/lib/types/admin'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const TIPOS: TipoAprobacion[] = [
  'pago_alto',
  'nuevo_proveedor',
  'campania',
  'transferencia',
  'devolucion_grande',
  'otro',
]

const ESTADO_VARIANT: Record<
  EstadoAprobacion,
  'warning' | 'success' | 'destructive' | 'info'
> = {
  pendiente: 'warning',
  aprobada: 'success',
  rechazada: 'destructive',
  solicita_info: 'info',
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export function NuevaAprobacionButton({ userId }: { userId: string }) {
  const router = useRouter()
  const sb = createClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    tipo: 'pago_alto' as TipoAprobacion,
    descripcion: '',
    monto_afectado: '',
  })

  async function crear() {
    if (!form.descripcion.trim()) {
      toast.error('Describí qué se necesita aprobar.')
      return
    }
    setBusy(true)
    const { error } = await sb.from('aprobaciones').insert({
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      monto_afectado: form.monto_afectado
        ? Number(form.monto_afectado)
        : null,
      solicitante_id: userId,
      estado: 'pendiente',
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Solicitud creada.')
    setOpen(false)
    setForm({ tipo: 'pago_alto', descripcion: '', monto_afectado: '' })
    router.refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Nueva solicitud
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="text-sm font-semibold">Nueva solicitud de aprobación</div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tipo
          </Label>
          <Select
            value={form.tipo}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, tipo: v as TipoAprobacion }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_APROBACION_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Descripción
          </Label>
          <Textarea
            rows={3}
            value={form.descripcion}
            onChange={(e) =>
              setForm((f) => ({ ...f, descripcion: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Monto afectado (opcional)
          </Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.monto_afectado}
            onChange={(e) =>
              setForm((f) => ({ ...f, monto_afectado: e.target.value }))
            }
          />
        </div>
        <Button onClick={crear} disabled={busy} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : 'Crear solicitud'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function AprobacionesList({
  initial,
  canResolve,
  userId,
}: {
  initial: Aprobacion[]
  canResolve: boolean
  userId: string
}) {
  const router = useRouter()
  const sb = createClient()
  const [items, setItems] = useState(initial)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [comentarios, setComentarios] = useState<Record<string, string>>({})

  async function resolver(a: Aprobacion, estado: EstadoAprobacion) {
    setWorkingId(a.id)
    const comentario = comentarios[a.id]?.trim() || null
    try {
      // Aprobar/rechazar pasan por el endpoint (ejecuta los efectos del pago, etc.).
      if (estado === 'aprobada' || estado === 'rechazada') {
        const r = await fetch('/api/aprobaciones/resolver', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aprobacion_id: a.id, accion: estado === 'aprobada' ? 'aprobar' : 'rechazar', comentarios: comentario }),
        })
        const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error')
      } else {
        // solicita_info: no ejecuta nada, solo marca el estado.
        const { error } = await sb.from('aprobaciones').update({ estado, aprobador_id: userId, comentarios: comentario }).eq('id', a.id)
        if (error) throw new Error(error.message)
      }
      setItems((arr) => arr.map((x) => (x.id === a.id ? { ...x, estado, comentarios: comentario, aprobador_id: userId } : x)))
      toast.success(`Solicitud marcada como ${ESTADO_APROBACION_LABELS[estado]}.`)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setWorkingId(null)
    }
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay solicitudes en esta vista.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((a) => {
        const pendiente = a.estado === 'pendiente' || a.estado === 'solicita_info'
        return (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-sm font-semibold">
                    {TIPO_APROBACION_LABELS[a.tipo]}
                  </CardTitle>
                  <Badge
                    variant={ESTADO_VARIANT[a.estado]}
                    className="text-[10px]"
                  >
                    {ESTADO_APROBACION_LABELS[a.estado]}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString('es-AR')}
                </div>
              </div>
              {a.monto_afectado != null && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Monto
                  </div>
                  <div className="text-sm font-bold tabular-nums">
                    {fmt(a.monto_afectado)}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {a.descripcion && (
                <p className="text-sm text-foreground">{a.descripcion}</p>
              )}
              {a.comentarios && (
                <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium">Comentario:</span>{' '}
                  {a.comentarios}
                </p>
              )}

              {canResolve && pendiente && (
                <div className="space-y-2 border-t border-border pt-3">
                  <Textarea
                    rows={2}
                    placeholder="Comentario (opcional)"
                    value={comentarios[a.id] ?? ''}
                    onChange={(e) =>
                      setComentarios((c) => ({
                        ...c,
                        [a.id]: e.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={workingId === a.id}
                      onClick={() => resolver(a, 'aprobada')}
                      className={cn(
                        'gap-1 bg-success text-success-foreground hover:bg-success/90',
                      )}
                    >
                      {workingId === a.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={workingId === a.id}
                      onClick={() => resolver(a, 'rechazada')}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <X className="size-3.5" />
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={workingId === a.id}
                      onClick={() => resolver(a, 'solicita_info')}
                      className="gap-1"
                    >
                      <HelpCircle className="size-3.5" />
                      Pedir info
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
