'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import type {
  TipoTarea,
  TareaPrioridad,
  CampoCustom,
} from '@/lib/types/tareas'
import {
  TAREA_CATEGORIA_LABELS,
  TAREA_PRIORIDAD_LABELS,
} from '@/lib/constants/tareas'

import { Button } from '@/components/ui/button'
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
  SheetTrigger,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

const NONE = '__none__'
const PRIORIDADES: TareaPrioridad[] = ['baja', 'media', 'alta', 'critica']

type UserOption = {
  id: string
  nombre: string | null
  email: string
}

export function NuevaTareaSheet({
  tipos,
  users,
  sucursales,
  currentUserId,
  triggerLabel = 'Nueva tarea',
  defaultTipoId,
  defaultEntidad,
}: {
  tipos: TipoTarea[]
  users: UserOption[]
  sucursales: { id: string; nombre: string }[]
  currentUserId: string
  triggerLabel?: string
  defaultTipoId?: string
  defaultEntidad?: {
    tipo: string
    id: string
    url?: string | null
    titulo?: string | null
  }
}) {
  const router = useRouter()
  const sb = createClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tipoId, setTipoId] = useState(defaultTipoId ?? '')
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    prioridad: 'media' as TareaPrioridad,
    responsable_id: '',
    verificador_id: '',
    aprobador_final_id: '',
    sucursal_id: '',
    fecha_vencimiento: '',
  })
  const [datosCustom, setDatosCustom] = useState<Record<string, unknown>>({})

  const tipo = useMemo(
    () => tipos.find((t) => t.id === tipoId) ?? null,
    [tipos, tipoId],
  )
  const niveles = tipo?.niveles_workflow ?? 1

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function onSelectTipo(id: string) {
    setTipoId(id)
    const t = tipos.find((x) => x.id === id)
    if (!t) return
    // Cargar defaults del tipo
    setForm((f) => ({
      ...f,
      prioridad: t.prioridad_default,
      titulo: f.titulo || t.plantilla_titulo?.replace(/\{[^}]+\}/g, '') || '',
      descripcion: f.descripcion || t.plantilla_descripcion || '',
    }))
    setDatosCustom({})
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) {
      toast.error('Poné un título a la tarea.')
      return
    }
    setBusy(true)
    const vencimientoISO = form.fecha_vencimiento
      ? new Date(form.fecha_vencimiento).toISOString()
      : null

    const { data, error } = await sb
      .from('tareas')
      .insert({
        tipo_tarea_id: tipoId || null,
        tipo_origen: 'manual',
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        prioridad: form.prioridad,
        estado: form.responsable_id ? 'asignada' : 'pendiente',
        responsable_id: form.responsable_id || null,
        verificador_id: niveles >= 2 ? form.verificador_id || null : null,
        aprobador_final_id: niveles === 3 ? form.aprobador_final_id || null : null,
        sucursal_id: form.sucursal_id || null,
        fecha_asignacion: form.responsable_id ? new Date().toISOString() : null,
        fecha_vencimiento: vencimientoISO,
        sla_horas: tipo?.sla_horas ?? null,
        datos_custom: datosCustom,
        entidad_relacionada: defaultEntidad?.tipo ?? null,
        entidad_id: defaultEntidad?.id ?? null,
        entidad_url: defaultEntidad?.url ?? null,
        creado_por: currentUserId,
      })
      .select('id')
      .maybeSingle<{ id: string }>()

    setBusy(false)
    if (error || !data) {
      toast.error(error?.message || 'No se pudo crear la tarea.')
      return
    }

    // Historial
    await sb.from('tareas_historial').insert({
      tarea_id: data.id,
      user_id: currentUserId,
      accion: 'creada',
      estado_nuevo: { estado: form.responsable_id ? 'asignada' : 'pendiente' },
    })

    toast.success('Tarea creada.')
    setOpen(false)
    setTipoId('')
    setForm({
      titulo: '',
      descripcion: '',
      prioridad: 'media',
      responsable_id: '',
      verificador_id: '',
      aprobador_final_id: '',
      sucursal_id: '',
      fecha_vencimiento: '',
    })
    setDatosCustom({})
    router.push(`/admin/tareas/${data.id}`)
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus className="size-4" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Nueva tarea</SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Tipo de tarea">
            <Select value={tipoId || NONE} onValueChange={(v) => onSelectTipo(v === NONE ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Genérica" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Genérica —</SelectItem>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}{' '}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      · {TAREA_CATEGORIA_LABELS[t.categoria]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipo && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Workflow {niveles} nivel{niveles > 1 ? 'es' : ''} ·{' '}
                {tipo.sla_horas ? `SLA ${tipo.sla_horas}h` : 'Sin SLA'} ·{' '}
                {tipo.puntos_completar} pts
                {tipo.evidencia_requerida.length > 0 &&
                  ` · evidencia: ${tipo.evidencia_requerida.join(', ')}`}
              </p>
            )}
          </Field>

          <Field label="Título *">
            <Input
              value={form.titulo}
              onChange={(e) => patch('titulo', e.target.value)}
              autoFocus
            />
          </Field>

          <Field label="Descripción">
            <Textarea
              rows={3}
              value={form.descripcion}
              onChange={(e) => patch('descripcion', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridad">
              <Select
                value={form.prioridad}
                onValueChange={(v) => patch('prioridad', v as TareaPrioridad)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TAREA_PRIORIDAD_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vencimiento">
              <Input
                type="datetime-local"
                value={form.fecha_vencimiento}
                onChange={(e) => patch('fecha_vencimiento', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Responsable">
            <UserSelect
              value={form.responsable_id}
              onChange={(v) => patch('responsable_id', v)}
              users={users}
              placeholder="— Asignar después —"
            />
          </Field>

          {niveles >= 2 && (
            <Field label="Verificador">
              <UserSelect
                value={form.verificador_id}
                onChange={(v) => patch('verificador_id', v)}
                users={users}
                placeholder="— Sin asignar —"
              />
            </Field>
          )}
          {niveles === 3 && (
            <Field label="Aprobador final">
              <UserSelect
                value={form.aprobador_final_id}
                onChange={(v) => patch('aprobador_final_id', v)}
                users={users}
                placeholder="— Sin asignar —"
              />
            </Field>
          )}

          <Field label="Sucursal">
            <Select
              value={form.sucursal_id || NONE}
              onValueChange={(v) => patch('sucursal_id', v === NONE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="— Sin sucursal —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Sin sucursal —</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {tipo && tipo.campos_custom.length > 0 && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Datos específicos del tipo
              </div>
              {tipo.campos_custom.map((c) => (
                <CampoCustomInput
                  key={c.codigo}
                  campo={c}
                  value={datosCustom[c.codigo]}
                  onChange={(v) =>
                    setDatosCustom((d) => ({ ...d, [c.codigo]: v }))
                  }
                />
              ))}
            </div>
          )}

          {defaultEntidad && (
            <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Vinculada a {defaultEntidad.tipo}
              {defaultEntidad.titulo ? ` · ${defaultEntidad.titulo}` : ''}
            </p>
          )}

          <div className="mt-auto flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creando…
                </>
              ) : (
                <>
                  Crear tarea
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function UserSelect({
  value,
  onChange,
  users,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  users: UserOption[]
  placeholder: string
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.nombre || u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CampoCustomInput({
  campo,
  value,
  onChange,
}: {
  campo: CampoCustom
  value: unknown
  onChange: (v: unknown) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {campo.label}
        {campo.requerido && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {campo.tipo === 'textarea' ? (
        <Textarea
          rows={2}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
        />
      ) : campo.tipo === 'select' ? (
        <Select
          value={(value as string) ?? NONE}
          onValueChange={(v) => onChange(v === NONE ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={campo.placeholder ?? '— Elegí —'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {(campo.opciones ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : campo.tipo === 'boolean' ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4"
        />
      ) : (
        <Input
          type={
            campo.tipo === 'number'
              ? 'number'
              : campo.tipo === 'date'
                ? 'date'
                : 'text'
          }
          value={(value as string | number) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
        />
      )}
    </div>
  )
}
