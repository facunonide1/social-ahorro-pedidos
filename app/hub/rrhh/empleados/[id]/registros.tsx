'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  TIPO_AUSENCIA_LABELS,
  type EmpleadoAusencia,
  type EmpleadoTurno,
  type TipoAusencia,
} from '@/lib/types/admin'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const TIPOS_AUSENCIA: TipoAusencia[] = [
  'vacaciones',
  'enfermedad',
  'licencia',
  'falta',
]

const AUSENCIA_VARIANT: Record<
  TipoAusencia,
  'info' | 'warning' | 'secondary' | 'destructive'
> = {
  vacaciones: 'info',
  enfermedad: 'warning',
  licencia: 'secondary',
  falta: 'destructive',
}

function horasEntre(entrada: string, salida: string): number | null {
  if (!entrada || !salida) return null
  const [h1, m1] = entrada.split(':').map(Number)
  const [h2, m2] = salida.split(':').map(Number)
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null
  let diff = h2 * 60 + m2 - (h1 * 60 + m1)
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

/* ---------- Turnos ---------- */

export function TurnosPanel({
  empleadoId,
  initial,
}: {
  empleadoId: string
  initial: EmpleadoTurno[]
}) {
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [turnos, setTurnos] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    fecha: today,
    hora_entrada: '',
    hora_salida: '',
    observaciones: '',
  })

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fecha) {
      toast.error('Elegí la fecha del turno.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('empleado_turnos')
      .insert({
        empleado_id: empleadoId,
        fecha: form.fecha,
        hora_entrada: form.hora_entrada || null,
        hora_salida: form.hora_salida || null,
        horas_trabajadas: horasEntre(form.hora_entrada, form.hora_salida),
        observaciones: form.observaciones.trim() || null,
      })
      .select('*')
      .maybeSingle<EmpleadoTurno>()
    setBusy(false)
    if (error || !data) {
      toast.error(error?.message || 'No se pudo registrar el turno.')
      return
    }
    setTurnos((arr) => [data, ...arr])
    setForm({ fecha: today, hora_entrada: '', hora_salida: '', observaciones: '' })
    toast.success('Turno registrado.')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Registrar turno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={agregar}
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          >
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Fecha
              </Label>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Entrada
              </Label>
              <Input
                type="time"
                value={form.hora_entrada}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hora_entrada: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Salida
              </Label>
              <Input
                type="time"
                value={form.hora_salida}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hora_salida: e.target.value }))
                }
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Registrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Turnos registrados ({turnos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {turnos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay turnos registrados.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {turnos.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium">
                    {new Date(t.fecha).toLocaleDateString('es-AR')}
                  </span>
                  <span className="text-muted-foreground">
                    {t.hora_entrada?.slice(0, 5) || '—'} ·{' '}
                    {t.hora_salida?.slice(0, 5) || '—'}
                  </span>
                  <span className="tabular-nums font-medium">
                    {t.horas_trabajadas != null
                      ? `${t.horas_trabajadas} h`
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------- Ausencias ---------- */

export function AusenciasPanel({
  empleadoId,
  initial,
}: {
  empleadoId: string
  initial: EmpleadoAusencia[]
}) {
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [ausencias, setAusencias] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    tipo: 'vacaciones' as TipoAusencia,
    fecha_desde: today,
    fecha_hasta: today,
    justificada: true,
    observaciones: '',
  })

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.fecha_desde || !form.fecha_hasta) {
      toast.error('Completá las fechas de la ausencia.')
      return
    }
    if (form.fecha_hasta < form.fecha_desde) {
      toast.error('La fecha hasta no puede ser anterior a la fecha desde.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('empleado_ausencias')
      .insert({
        empleado_id: empleadoId,
        tipo: form.tipo,
        fecha_desde: form.fecha_desde,
        fecha_hasta: form.fecha_hasta,
        justificada: form.justificada,
        observaciones: form.observaciones.trim() || null,
      })
      .select('*')
      .maybeSingle<EmpleadoAusencia>()
    setBusy(false)
    if (error || !data) {
      toast.error(error?.message || 'No se pudo registrar la ausencia.')
      return
    }
    setAusencias((arr) => [data, ...arr])
    setForm({
      tipo: 'vacaciones',
      fecha_desde: today,
      fecha_hasta: today,
      justificada: true,
      observaciones: '',
    })
    toast.success('Ausencia registrada.')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Registrar ausencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={agregar} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tipo
                </Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, tipo: v as TipoAusencia }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_AUSENCIA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_AUSENCIA_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Desde
                </Label>
                <Input
                  type="date"
                  value={form.fecha_desde}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_desde: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Hasta
                </Label>
                <Input
                  type="date"
                  value={form.fecha_hasta}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fecha_hasta: e.target.value }))
                  }
                />
              </div>
            </div>
            <Textarea
              placeholder="Observaciones (opcional)"
              value={form.observaciones}
              onChange={(e) =>
                setForm((f) => ({ ...f, observaciones: e.target.value }))
              }
              rows={2}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.justificada}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, justificada: v === true }))
                  }
                />
                Justificada
              </label>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Registrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Ausencias registradas ({ausencias.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ausencias.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sin ausencias registradas.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {ausencias.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={AUSENCIA_VARIANT[a.tipo]}
                      className="text-[10px]"
                    >
                      {TIPO_AUSENCIA_LABELS[a.tipo]}
                    </Badge>
                    {!a.justificada && (
                      <span className="text-[10px] text-destructive">
                        injustificada
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(a.fecha_desde).toLocaleDateString('es-AR')} –{' '}
                    {new Date(a.fecha_hasta).toLocaleDateString('es-AR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
