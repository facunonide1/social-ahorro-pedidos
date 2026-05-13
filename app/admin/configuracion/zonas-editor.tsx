'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { ZonaReparto } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const COLOR_PRESETS = [
  '#FF6D6E',
  '#726DFF',
  '#6FEF6C',
  '#0066cc',
  '#c6831a',
  '#a33',
  '#555',
]

type Draft = {
  id?: string
  nombre: string
  descripcion: string
  barriosRaw: string
  color: string
  activa: boolean
}

function emptyDraft(): Draft {
  return {
    nombre: '',
    descripcion: '',
    barriosRaw: '',
    color: COLOR_PRESETS[0],
    activa: true,
  }
}

function draftFromZona(z: ZonaReparto): Draft {
  return {
    id: z.id,
    nombre: z.nombre,
    descripcion: z.descripcion ?? '',
    barriosRaw: z.barrios.join(', '),
    color: z.color,
    activa: z.activa,
  }
}

export default function ZonasEditor({
  initialZonas,
}: {
  initialZonas: ZonaReparto[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [zonas, setZonas] = useState(initialZonas)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const editing = !!draft.id

  function resetDraft() {
    setDraft(emptyDraft())
    setErr(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!draft.nombre.trim()) {
      setErr('El nombre es obligatorio.')
      return
    }
    setBusy(true)

    const payload = {
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      barrios: draft.barriosRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      color: draft.color,
      activa: draft.activa,
    }

    if (editing && draft.id) {
      const { error, data } = await sb
        .from('zonas_reparto')
        .update(payload)
        .eq('id', draft.id)
        .select()
        .maybeSingle<ZonaReparto>()
      if (error) {
        setErr(error.message)
        setBusy(false)
        return
      }
      if (data) setZonas((arr) => arr.map((z) => (z.id === data.id ? data : z)))
    } else {
      const { error, data } = await sb
        .from('zonas_reparto')
        .insert(payload)
        .select()
        .maybeSingle<ZonaReparto>()
      if (error) {
        setErr(error.message)
        setBusy(false)
        return
      }
      if (data) setZonas((arr) => [data, ...arr])
    }
    setBusy(false)
    resetDraft()
    router.refresh()
  }

  async function toggleActiva(z: ZonaReparto) {
    const { error, data } = await sb
      .from('zonas_reparto')
      .update({ activa: !z.activa })
      .eq('id', z.id)
      .select()
      .maybeSingle<ZonaReparto>()
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setZonas((arr) => arr.map((x) => (x.id === data.id ? data : x)))
    router.refresh()
  }

  async function remove(z: ZonaReparto) {
    if (
      !confirm(
        `¿Eliminar la zona "${z.nombre}"? Los pedidos con esta zona quedan sin asignar pero no se borran.`,
      )
    )
      return
    const { error } = await sb.from('zonas_reparto').delete().eq('id', z.id)
    if (error) {
      setErr(error.message)
      return
    }
    setZonas((arr) => arr.filter((x) => x.id !== z.id))
    if (draft.id === z.id) resetDraft()
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <form onSubmit={save} className="space-y-3">
            <div className="text-sm font-semibold">
              {editing ? 'Editar zona' : 'Nueva zona'}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_3fr]">
              <Field label="Nombre">
                <Input
                  value={draft.nombre}
                  onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                  placeholder="Ituzaingó Centro"
                />
              </Field>
              <Field label="Descripción">
                <Input
                  value={draft.descripcion}
                  onChange={(e) =>
                    setDraft({ ...draft, descripcion: e.target.value })
                  }
                  placeholder="Microcentro y alrededores"
                />
              </Field>
            </div>
            <Field label="Barrios (separados por coma)">
              <Input
                value={draft.barriosRaw}
                onChange={(e) =>
                  setDraft({ ...draft, barriosRaw: e.target.value })
                }
                placeholder="Centro, Villa Udaondo, Parque Leloir"
              />
              <p className="text-xs text-muted-foreground">
                Sirve para que operadores sepan a qué zona pertenece una dirección.
              </p>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Color
                </Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => {
                    const selected = c === draft.color
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraft({ ...draft, color: c })}
                        className={cn(
                          'size-7 rounded-full transition-transform',
                          selected
                            ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                            : 'hover:scale-110',
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    )
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={draft.activa}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, activa: Boolean(v) })
                  }
                />
                Activa
              </label>
            </div>
            <div className="flex justify-end gap-2">
              {editing && (
                <Button type="button" variant="outline" onClick={resetDraft}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Guardando…
                  </>
                ) : editing ? (
                  'Guardar cambios'
                ) : (
                  'Crear zona'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {zonas.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay zonas. Creá la primera arriba.
            </CardContent>
          </Card>
        )}
        {zonas.map((z) => (
          <Card key={z.id} className={!z.activa ? 'opacity-60' : undefined}>
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: z.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {z.nombre}
                  {!z.activa && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (inactiva)
                    </span>
                  )}
                </div>
                {z.descripcion && (
                  <div className="text-xs text-muted-foreground">{z.descripcion}</div>
                )}
                {z.barrios.length > 0 && (
                  <div className="mt-0.5 text-xs text-muted-foreground/80">
                    {z.barrios.join(' · ')}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft(draftFromZona(z))}
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActiva(z)}
                >
                  {z.activa ? 'Desactivar' : 'Activar'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => remove(z)}
                  aria-label="Eliminar"
                  className="text-destructive hover:text-destructive"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
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
