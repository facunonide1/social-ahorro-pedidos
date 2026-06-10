'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Pause, Play, Repeat } from 'lucide-react'
import { toast } from 'sonner'

import {
  ASIGNACION_LABELS,
  DIAS_SEMANA,
  hhmm,
  type TareaAsignacion,
  type TurnoSucursal,
} from '@/lib/types/tareas-enterprise'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { AdminUserOption } from '@/lib/admin-hub/users'

type Recurrencia = {
  id: string
  tipo_tarea_id: string
  titulo_plantilla: string | null
  patron: string
  dias_semana: number[] | null
  dia_mes: number | null
  hora_limite: string | null
  sucursal_id: string | null
  asignacion_tipo: TareaAsignacion
  turno_id: string | null
  usuario_fijo_id: string | null
  activa: boolean
}
type Tipo = { id: string; nombre: string; codigo: string }
type Sucursal = { id: string; nombre: string; codigo: string | null }

const PATRON_LABELS: Record<string, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
  unica: 'Única',
}

export function RecurrenciasClient({
  recurrencias,
  tipos,
  sucursales,
  turnos,
  users,
}: {
  recurrencias: Recurrencia[]
  tipos: Tipo[]
  sucursales: Sucursal[]
  turnos: TurnoSucursal[]
  users: AdminUserOption[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Recurrencia | null>(null)
  const [creating, setCreating] = useState(false)

  const tipoName = (id: string) => tipos.find((t) => t.id === id)?.nombre ?? '—'
  const sucName = (id: string | null) =>
    id ? (sucursales.find((s) => s.id === id)?.nombre ?? '—') : '—'

  async function togglePausa(r: Recurrencia) {
    const res = await fetch(`/api/admin/recurrencias/${r.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ activa: !r.activa }),
    })
    if (!res.ok) { toast.error('No se pudo cambiar el estado.'); return }
    toast.success(r.activa ? 'Recurrencia pausada.' : 'Recurrencia reactivada.')
    router.refresh()
  }

  async function eliminar(r: Recurrencia) {
    if (!confirm('¿Eliminar esta recurrencia? No borra las tareas ya generadas.')) return
    const res = await fetch(`/api/admin/recurrencias/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('No se pudo eliminar.'); return }
    toast.success('Recurrencia eliminada.')
    router.refresh()
  }

  function patronLabel(r: Recurrencia) {
    if (r.patron === 'semanal' && r.dias_semana?.length) {
      return `Semanal · ${DIAS_SEMANA.filter((d) => r.dias_semana!.includes(d.value)).map((d) => d.corto).join('')}`
    }
    if (r.patron === 'mensual' && r.dia_mes) return `Mensual · día ${r.dia_mes}`
    return PATRON_LABELS[r.patron] ?? r.patron
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {recurrencias.filter((r) => r.activa).length} activas · {recurrencias.length} totales
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nueva recurrencia
        </Button>
      </div>

      {recurrencias.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          <Repeat className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            No hay recurrencias. Creá una para que la agenda se genere sola.
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nueva recurrencia
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Tipo / título</th>
                <th className="px-3 py-2 font-medium">Sucursal</th>
                <th className="px-3 py-2 font-medium">Patrón</th>
                <th className="px-3 py-2 font-medium">Asignación</th>
                <th className="px-3 py-2 font-medium">Hora límite</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {recurrencias.map((r) => (
                <tr key={r.id} className={cn('border-t border-border', !r.activa && 'opacity-60')}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.titulo_plantilla || tipoName(r.tipo_tarea_id)}</div>
                    <div className="text-xs text-muted-foreground">{tipoName(r.tipo_tarea_id)}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{sucName(r.sucursal_id)}</td>
                  <td className="px-3 py-2">{patronLabel(r)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{ASIGNACION_LABELS[r.asignacion_tipo]}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{hhmm(r.hora_limite) || '—'}</td>
                  <td className="px-3 py-2">
                    {r.activa ? (
                      <Badge variant="secondary" className="font-normal">Activa</Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-muted-foreground">Pausada</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => togglePausa(r)} aria-label={r.activa ? 'Pausar' : 'Reactivar'}>
                        {r.activa ? <Pause className="size-4" /> : <Play className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => eliminar(r)} aria-label="Eliminar">
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <RecurrenciaSheet
          rec={editing ?? undefined}
          tipos={tipos}
          sucursales={sucursales}
          turnos={turnos}
          users={users}
          onClose={() => { setCreating(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function RecurrenciaSheet({
  rec, tipos, sucursales, turnos, users, onClose,
}: {
  rec?: Recurrencia
  tipos: Tipo[]
  sucursales: Sucursal[]
  turnos: TurnoSucursal[]
  users: AdminUserOption[]
  onClose: () => void
}) {
  const router = useRouter()
  const editing = Boolean(rec)
  const [busy, setBusy] = useState(false)

  const [tipoId, setTipoId] = useState(rec?.tipo_tarea_id ?? '')
  const [sucId, setSucId] = useState(rec?.sucursal_id ?? '')
  const [titulo, setTitulo] = useState(rec?.titulo_plantilla ?? '')
  const [patron, setPatron] = useState(rec?.patron ?? 'diaria')
  const [dias, setDias] = useState<number[]>(rec?.dias_semana ?? [1, 2, 3, 4, 5, 6])
  const [diaMes, setDiaMes] = useState(rec?.dia_mes?.toString() ?? '1')
  const [horaLimite, setHoraLimite] = useState(hhmm(rec?.hora_limite) || '12:00')
  const [asignacion, setAsignacion] = useState<TareaAsignacion>(rec?.asignacion_tipo ?? 'pool_turno')
  const [turnoId, setTurnoId] = useState(rec?.turno_id ?? '')
  const [usuarioId, setUsuarioId] = useState(rec?.usuario_fijo_id ?? '')

  const turnosSuc = useMemo(() => turnos.filter((t) => t.sucursal_id === sucId), [turnos, sucId])

  function toggleDia(d: number) {
    setDias((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))
  }

  async function submit() {
    if (!tipoId) { toast.error('Elegí un tipo.'); return }
    if (!sucId) { toast.error('Elegí una sucursal.'); return }
    if (asignacion === 'pool_turno' && !turnoId) { toast.error('Elegí un turno.'); return }
    if (asignacion === 'usuario_especifico' && !usuarioId) { toast.error('Elegí un usuario.'); return }

    const payload: any = {
      tipo_tarea_id: tipoId,
      sucursal_id: sucId,
      titulo_plantilla: titulo.trim() || null,
      patron,
      dias_semana: patron === 'semanal' ? dias : null,
      dia_mes: patron === 'mensual' ? Number(diaMes) : null,
      hora_limite: horaLimite + ':00',
      asignacion_tipo: asignacion,
      turno_id: asignacion === 'pool_turno' ? turnoId : null,
      usuario_fijo_id: asignacion === 'usuario_especifico' ? usuarioId : null,
    }

    setBusy(true)
    try {
      const url = editing ? `/api/admin/recurrencias/${rec!.id}` : '/api/admin/recurrencias'
      const r = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error al guardar.')
      toast.success(editing ? 'Recurrencia actualizada.' : 'Recurrencia creada.')
      onClose()
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{editing ? 'Editar recurrencia' : 'Nueva recurrencia'}</SheetTitle></SheetHeader>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Tipo de tarea">
            <Select value={tipoId} onValueChange={setTipoId} disabled={editing}>
              <SelectTrigger><SelectValue placeholder="Elegí un tipo" /></SelectTrigger>
              <SelectContent>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sucursal">
            <Select value={sucId} onValueChange={(v) => { setSucId(v); setTurnoId('') }}>
              <SelectTrigger><SelectValue placeholder="Elegí una sucursal" /></SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.codigo ? `${s.codigo} · ` : ''}{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Título (opcional)">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Si vacío, usa el nombre del tipo" />
          </Field>

          <Field label="Patrón">
            <Select value={patron} onValueChange={setPatron}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PATRON_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {patron === 'semanal' && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Días</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d) => (
                  <button key={d.value} type="button" onClick={() => toggleDia(d.value)} aria-pressed={dias.includes(d.value)}
                    className={cn('flex size-9 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                      dias.includes(d.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent')}
                    title={d.largo}>{d.corto}</button>
                ))}
              </div>
            </div>
          )}

          {patron === 'mensual' && (
            <Field label="Día del mes">
              <Input type="number" min={1} max={31} value={diaMes} onChange={(e) => setDiaMes(e.target.value)} />
            </Field>
          )}

          <Field label="Hora límite">
            <Input type="time" value={horaLimite} onChange={(e) => setHoraLimite(e.target.value)} />
          </Field>

          <Field label="Asignación">
            <Select value={asignacion} onValueChange={(v) => setAsignacion(v as TareaAsignacion)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pool_turno">Pool del turno</SelectItem>
                <SelectItem value="pool_sucursal">Pool de la sucursal</SelectItem>
                <SelectItem value="usuario_especifico">Usuario específico</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {asignacion === 'pool_turno' && (
            <Field label="Turno">
              <Select value={turnoId} onValueChange={setTurnoId}>
                <SelectTrigger><SelectValue placeholder={turnosSuc.length ? 'Elegí un turno' : 'Esta sucursal no tiene turnos'} /></SelectTrigger>
                <SelectContent>
                  {turnosSuc.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre} ({hhmm(t.hora_inicio)}–{hhmm(t.hora_fin)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {asignacion === 'usuario_especifico' && (
            <Field label="Usuario fijo">
              <Select value={usuarioId} onValueChange={setUsuarioId}>
                <SelectTrigger><SelectValue placeholder="Elegí un usuario" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.nombre || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear recurrencia'}
          </Button>
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
