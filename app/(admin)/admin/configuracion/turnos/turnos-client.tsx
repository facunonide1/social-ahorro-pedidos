'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Clock, AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  DIAS_SEMANA,
  diasLabel,
  hhmm,
  turnosSolapan,
  type TurnoSucursal,
} from '@/lib/types/tareas-enterprise'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Sucursal = { id: string; nombre: string; codigo: string | null }

export function TurnosClient({
  sucursales,
  turnos,
}: {
  sucursales: Sucursal[]
  turnos: TurnoSucursal[]
}) {
  const [sucId, setSucId] = useState<string>(sucursales[0]?.id ?? '')
  const [editing, setEditing] = useState<TurnoSucursal | null>(null)
  const [creating, setCreating] = useState(false)

  const turnosSuc = useMemo(
    () => turnos.filter((t) => t.sucursal_id === sucId).sort((a, b) => a.orden - b.orden),
    [turnos, sucId],
  )

  if (sucursales.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No hay sucursales activas. Cargá sucursales primero.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={sucId} onValueChange={setSucId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sucursales.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.codigo ? `${s.codigo} · ` : ''}
                {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setCreating(true)} disabled={!sucId}>
          <Plus className="size-4" />
          Nuevo turno
        </Button>
      </div>

      {turnosSuc.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          <Clock className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Esta sucursal no tiene turnos. Creá el primero.
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo turno
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {turnosSuc.map((t) => {
            const solapa = turnosSuc.some((o) => o.id !== t.id && turnosSolapan(t, o))
            return (
              <div
                key={t.id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border bg-card p-4',
                  !t.activo && 'opacity-60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Clock className="size-4 text-nora" />
                    {t.nombre}
                  </div>
                  {t.activo ? (
                    <Badge variant="secondary" className="font-normal">Activo</Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal text-muted-foreground">Inactivo</Badge>
                  )}
                </div>
                <div className="font-mono text-lg tabular-nums">
                  {hhmm(t.hora_inicio)} – {hhmm(t.hora_fin)}
                </div>
                <div className="text-xs text-muted-foreground">{diasLabel(t.dias_semana)}</div>
                {solapa && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3" /> Se solapa con otro turno
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-fit"
                  onClick={() => setEditing(t)}
                >
                  <Pencil className="size-3.5" /> Editar
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <TurnoSheet
          sucursalId={sucId}
          turno={editing ?? undefined}
          otros={turnosSuc.filter((t) => t.id !== editing?.id)}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function TurnoSheet({
  sucursalId,
  turno,
  otros,
  onClose,
}: {
  sucursalId: string
  turno?: TurnoSucursal
  otros: TurnoSucursal[]
  onClose: () => void
}) {
  const router = useRouter()
  const sb = createClient()
  const editing = Boolean(turno)
  const [busy, setBusy] = useState(false)

  const [nombre, setNombre] = useState(turno?.nombre ?? '')
  const [hi, setHi] = useState(hhmm(turno?.hora_inicio) || '08:00')
  const [hf, setHf] = useState(hhmm(turno?.hora_fin) || '14:00')
  const [dias, setDias] = useState<number[]>(turno?.dias_semana ?? [1, 2, 3, 4, 5, 6])
  const [activo, setActivo] = useState(turno?.activo ?? true)

  function toggleDia(d: number) {
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  // Warning de solapamiento en vivo (no bloquea)
  const provisional: TurnoSucursal = {
    id: turno?.id ?? 'nuevo',
    sucursal_id: sucursalId,
    nombre,
    hora_inicio: hi + ':00',
    hora_fin: hf + ':00',
    dias_semana: dias,
    activo,
    orden: turno?.orden ?? 0,
    created_at: '',
    updated_at: '',
  }
  const solapaCon = otros.find((o) => turnosSolapan(provisional, o))

  async function submit() {
    if (!nombre.trim()) {
      toast.error('Poné un nombre al turno.')
      return
    }
    if (hf <= hi) {
      toast.error('La hora de fin debe ser posterior a la de inicio.')
      return
    }
    if (dias.length === 0) {
      toast.error('Elegí al menos un día.')
      return
    }
    setBusy(true)
    const payload = {
      sucursal_id: sucursalId,
      nombre: nombre.trim(),
      hora_inicio: hi + ':00',
      hora_fin: hf + ':00',
      dias_semana: dias,
      activo,
    }
    try {
      if (editing) {
        const { error } = await sb.from('turnos_sucursal').update(payload).eq('id', turno!.id)
        if (error) throw new Error(error.message)
        toast.success('Turno actualizado.')
      } else {
        const { error } = await sb.from('turnos_sucursal').insert({ ...payload, orden: otros.length })
        if (error) throw new Error(error.message)
        toast.success('Turno creado.')
      }
      onClose()
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  async function eliminar() {
    if (!turno) return
    if (!confirm(`¿Eliminar el turno "${turno.nombre}"?`)) return
    setBusy(true)
    const { error } = await sb.from('turnos_sucursal').delete().eq('id', turno.id)
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Turno eliminado.')
    onClose()
    router.refresh()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar turno' : 'Nuevo turno'}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mañana, Tarde…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora inicio">
              <Input type="time" value={hi} onChange={(e) => setHi(e.target.value)} />
            </Field>
            <Field label="Hora fin">
              <Input type="time" value={hf} onChange={(e) => setHf(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Días</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDia(d.value)}
                  aria-pressed={dias.includes(d.value)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                    dias.includes(d.value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                  title={d.largo}
                >
                  {d.corto}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Turno activo
          </label>

          {solapaCon && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              Se solapa con &ldquo;{solapaCon.nombre}&rdquo; ({hhmm(solapaCon.hora_inicio)}–{hhmm(solapaCon.hora_fin)}). Podés guardarlo igual.
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={submit}>
              {busy ? 'Guardando…' : editing ? 'Guardar' : 'Crear turno'}
            </Button>
            {editing && (
              <Button variant="outline" size="icon" disabled={busy} onClick={eliminar} aria-label="Eliminar turno">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
