'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Settings, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  CATEGORIAS,
  CATEGORIA_LABELS,
  EVIDENCIA_TIPOS,
  EVIDENCIA_LABELS,
  PRIORIDAD_LABELS,
  type TareaCategoria,
  type TareaPrioridad,
  type EvidenciaTipo,
  type TipoTareaFull,
} from '@/lib/types/tareas-enterprise'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Icon } from '@/components/icon'
import { cn } from '@/lib/utils'

export function TiposClient({ tipos }: { tipos: TipoTareaFull[] }) {
  const [editing, setEditing] = useState<TipoTareaFull | null>(null)
  const [creating, setCreating] = useState(false)

  const porCategoria = new Map<string, TipoTareaFull[]>()
  for (const t of tipos) {
    const arr = porCategoria.get(t.categoria) ?? []
    arr.push(t)
    porCategoria.set(t.categoria, arr)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{tipos.length} tipos configurados</div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nuevo tipo
        </Button>
      </div>

      {[...porCategoria.entries()].map(([cat, items]) => (
        <section key={cat}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {CATEGORIA_LABELS[cat as TareaCategoria] ?? cat}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <Card key={t.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setEditing(t)}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-white" style={{ background: t.color ?? '#94a3b8' }}>
                      {t.icono ? <Icon name={t.icono} className="size-4" /> : <Settings className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="truncate text-sm font-semibold">{t.nombre}</div>
                        {!t.activo && <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{t.codigo}</div>
                    </div>
                    <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    <Stat label="Prioridad" value={PRIORIDAD_LABELS[t.prioridad_default]} />
                    <Stat label="SLA" value={t.sla_horas ? `${t.sla_horas}h` : '—'} />
                    <Stat label="Puntos" value={String(t.puntos_completar)} />
                    <Stat label="Verif." value={t.verificacion_humana ? 'humana' : 'NORA'} />
                  </div>
                  {t.evidencia_requerida?.length > 0 && (
                    <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                      {t.evidencia_requerida.map((e) => (
                        <Badge key={e} variant="outline" className="text-[10px]">
                          {EVIDENCIA_LABELS[e as EvidenciaTipo] ?? e}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {(creating || editing) && (
        <TipoSheet tipo={editing ?? undefined} onClose={() => { setCreating(false); setEditing(null) }} />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function TipoSheet({ tipo, onClose }: { tipo?: TipoTareaFull; onClose: () => void }) {
  const router = useRouter()
  const editing = Boolean(tipo)
  const [busy, setBusy] = useState(false)

  const [f, setF] = useState({
    codigo: tipo?.codigo ?? '',
    nombre: tipo?.nombre ?? '',
    descripcion: tipo?.descripcion ?? '',
    categoria: (tipo?.categoria ?? 'otro') as TareaCategoria,
    icono: tipo?.icono ?? 'ListTodo',
    color: tipo?.color ?? '#6E3CDB',
    prioridad_default: (tipo?.prioridad_default ?? 'media') as TareaPrioridad,
    sla_horas: tipo?.sla_horas?.toString() ?? '',
    verificacion_humana: tipo?.verificacion_humana ?? true,
    verificacion_ia: tipo?.verificacion_ia ?? true,
    ia_prompt_verificacion: tipo?.ia_prompt_verificacion ?? '',
    puntos_completar: tipo?.puntos_completar?.toString() ?? '10',
    plantilla_titulo: tipo?.plantilla_titulo ?? '',
    permite_recurrencia: tipo?.permite_recurrencia ?? true,
    activo: tipo?.activo ?? true,
  })
  const [evidencias, setEvidencias] = useState<EvidenciaTipo[]>(
    (tipo?.evidencia_requerida ?? []) as EvidenciaTipo[],
  )
  const [checklist, setChecklist] = useState<string[]>(tipo?.checklist_items ?? [])
  const [nuevoItem, setNuevoItem] = useState('')

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }))
  }
  function toggleEv(e: EvidenciaTipo) {
    setEvidencias((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]))
  }

  async function submit() {
    if (!editing && !f.codigo.trim()) { toast.error('Poné un código.'); return }
    if (!f.nombre.trim()) { toast.error('Poné un nombre.'); return }

    const payload = {
      ...(editing ? {} : { codigo: f.codigo }),
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || null,
      categoria: f.categoria,
      icono: f.icono.trim() || null,
      color: f.color,
      prioridad_default: f.prioridad_default,
      sla_horas: f.sla_horas.trim() === '' ? null : Number(f.sla_horas),
      verificacion_humana: f.verificacion_humana,
      verificacion_ia: f.verificacion_ia,
      ia_prompt_verificacion: f.ia_prompt_verificacion.trim() || null,
      evidencia_requerida: evidencias,
      checklist_items: evidencias.includes('checklist') && checklist.length > 0 ? checklist : null,
      puntos_completar: Number(f.puntos_completar || '0'),
      plantilla_titulo: f.plantilla_titulo.trim() || null,
      permite_recurrencia: f.permite_recurrencia,
      activo: f.activo,
    }

    setBusy(true)
    try {
      const url = editing ? `/api/admin/tipos-tareas/${tipo!.id}` : '/api/admin/tipos-tareas'
      const r = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error al guardar.')
      toast.success(editing ? 'Tipo actualizado.' : 'Tipo creado.')
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
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>{editing ? 'Editar tipo' : 'Nuevo tipo de tarea'}</SheetTitle></SheetHeader>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          {!editing && (
            <Field label="Código *">
              <Input value={f.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="ej. apertura_sucursal" />
            </Field>
          )}
          <Field label="Nombre *">
            <Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </Field>
          <Field label="Descripción">
            <Textarea value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={2} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select value={f.categoria} onValueChange={(v) => set('categoria', v as TareaCategoria)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridad">
              <Select value={f.prioridad_default} onValueChange={(v) => set('prioridad_default', v as TareaPrioridad)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['baja','media','alta','critica'] as TareaPrioridad[]).map((p) => (
                    <SelectItem key={p} value={p}>{PRIORIDAD_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Icono (lucide)">
              <Input value={f.icono} onChange={(e) => set('icono', e.target.value)} />
            </Field>
            <Field label="Color">
              <div className="flex items-center gap-2">
                <input type="color" value={f.color} onChange={(e) => set('color', e.target.value)} className="h-9 w-12 rounded border" />
                <Input value={f.color} onChange={(e) => set('color', e.target.value)} className="flex-1" />
              </div>
            </Field>
            <Field label="SLA (horas)">
              <Input type="number" value={f.sla_horas} onChange={(e) => set('sla_horas', e.target.value)} />
            </Field>
            <Field label="Puntos">
              <Input type="number" value={f.puntos_completar} onChange={(e) => set('puntos_completar', e.target.value)} />
            </Field>
          </div>

          {/* Workflow de verificación */}
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-medium">Verificación</div>
            <div className="flex flex-wrap gap-4">
              <Check label="Verificación humana" checked={f.verificacion_humana} onChange={(v) => set('verificacion_humana', v)} />
              <Check label="Pre-verificación NORA (IA)" checked={f.verificacion_ia} onChange={(v) => set('verificacion_ia', v)} />
            </div>
            {f.verificacion_ia && (
              <div className="mt-2">
                <Field label="Prompt de verificación IA">
                  <Textarea value={f.ia_prompt_verificacion} onChange={(e) => set('ia_prompt_verificacion', e.target.value)} rows={2} placeholder="Qué debe chequear NORA en la evidencia…" />
                </Field>
              </div>
            )}
          </div>

          {/* Evidencias */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidencia requerida</Label>
            <div className="flex flex-wrap gap-1.5">
              {EVIDENCIA_TIPOS.map((e) => (
                <button key={e} type="button" onClick={() => toggleEv(e)} aria-pressed={evidencias.includes(e)}
                  className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors',
                    evidencias.includes(e) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent')}>
                  {EVIDENCIA_LABELS[e]}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist builder */}
          {evidencias.includes('checklist') && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-medium">Ítems del checklist</div>
              <div className="space-y-1.5">
                {checklist.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm">
                    <span className="flex-1">{it}</span>
                    <button type="button" onClick={() => setChecklist((p) => p.filter((_, j) => j !== i))} aria-label="Quitar ítem">
                      <X className="size-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={nuevoItem} onChange={(e) => setNuevoItem(e.target.value)} placeholder="Nuevo ítem…"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (nuevoItem.trim()) { setChecklist((p) => [...p, nuevoItem.trim()]); setNuevoItem('') } } }} />
                  <Button type="button" variant="outline" size="sm" onClick={() => { if (nuevoItem.trim()) { setChecklist((p) => [...p, nuevoItem.trim()]); setNuevoItem('') } }}>
                    Agregar
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Field label="Plantilla de título">
            <Input value={f.plantilla_titulo} onChange={(e) => set('plantilla_titulo', e.target.value)} placeholder="Ej. Apertura {{sucursal}}" />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Check label="Permite recurrencia" checked={f.permite_recurrencia} onChange={(v) => set('permite_recurrencia', v)} />
            <Check label="Activo" checked={f.activo} onChange={(v) => set('activo', v)} />
          </div>

          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear tipo'}
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

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
      {label}
    </label>
  )
}
