'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { Sucursal } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Draft = {
  nombre: string
  codigo: string
  direccion: string
  localidad: string
  provincia: string
  telefono: string
  email: string
  latitud: string
  longitud: string
  activa: boolean
}

function fromSucursal(s?: Sucursal): Draft {
  return {
    nombre: s?.nombre ?? '',
    codigo: s?.codigo ?? '',
    direccion: s?.direccion ?? '',
    localidad: s?.localidad ?? '',
    provincia: s?.provincia ?? '',
    telefono: s?.telefono ?? '',
    email: s?.email ?? '',
    latitud: s?.latitud != null ? String(s.latitud) : '',
    longitud: s?.longitud != null ? String(s.longitud) : '',
    activa: s?.activa ?? true,
  }
}

export default function SucursalForm({
  mode,
  initial,
}: {
  mode: 'create' | 'edit'
  initial?: Sucursal
}) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(fromSucursal(initial))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  async function save() {
    setErr(null)
    setMsg(null)
    if (!draft.nombre.trim()) {
      setErr('El nombre es obligatorio.')
      return
    }
    setBusy(true)

    const payload = {
      nombre: draft.nombre.trim(),
      codigo: draft.codigo.trim() || null,
      direccion: draft.direccion.trim() || null,
      localidad: draft.localidad.trim() || null,
      provincia: draft.provincia.trim() || null,
      telefono: draft.telefono.trim() || null,
      email: draft.email.trim().toLowerCase() || null,
      latitud: draft.latitud ? Number(draft.latitud) : null,
      longitud: draft.longitud ? Number(draft.longitud) : null,
      activa: draft.activa,
    }

    if (mode === 'create') {
      const { data, error } = await sb
        .from('sucursales')
        .insert(payload)
        .select('id')
        .maybeSingle<{ id: string }>()
      setBusy(false)
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '23505') setErr('Ya existe una sucursal con ese código.')
        else setErr(error.message)
        return
      }
      if (data?.id) router.push(`/hub/sucursales/${data.id}`)
      else router.push('/hub/sucursales')
    } else if (initial) {
      const { error } = await sb.from('sucursales').update(payload).eq('id', initial.id)
      setBusy(false)
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '23505') setErr('Ya existe una sucursal con ese código.')
        else setErr(error.message)
        return
      }
      setMsg('Cambios guardados.')
      router.refresh()
      setTimeout(() => setMsg(null), 2500)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Datos de la sucursal
        </CardTitle>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={draft.activa}
            onCheckedChange={(v) => patch('activa', Boolean(v))}
          />
          Activa
        </label>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        {msg && (
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Nombre *">
            <Input
              value={draft.nombre}
              onChange={(e) => patch('nombre', e.target.value)}
              placeholder="Ituzaingó Centro"
            />
          </Field>
          <Field label="Código interno">
            <Input
              value={draft.codigo}
              onChange={(e) => patch('codigo', e.target.value)}
              placeholder="SA-01"
            />
          </Field>
        </div>

        <Field label="Dirección">
          <Input
            value={draft.direccion}
            onChange={(e) => patch('direccion', e.target.value)}
            placeholder="Av. Rivadavia 1234"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Localidad">
            <Input
              value={draft.localidad}
              onChange={(e) => patch('localidad', e.target.value)}
            />
          </Field>
          <Field label="Provincia">
            <Input
              value={draft.provincia}
              onChange={(e) => patch('provincia', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Teléfono">
            <Input
              value={draft.telefono}
              onChange={(e) => patch('telefono', e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={draft.email}
              onChange={(e) => patch('email', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Latitud (opcional)">
            <Input
              type="number"
              step="any"
              value={draft.latitud}
              onChange={(e) => patch('latitud', e.target.value)}
              placeholder="-34.6536"
            />
          </Field>
          <Field label="Longitud (opcional)">
            <Input
              type="number"
              step="any"
              value={draft.longitud}
              onChange={(e) => patch('longitud', e.target.value)}
              placeholder="-58.6783"
            />
          </Field>
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={save} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : mode === 'create' ? (
              'Crear sucursal'
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
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
