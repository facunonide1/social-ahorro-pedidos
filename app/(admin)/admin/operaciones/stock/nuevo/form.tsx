'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { Producto } from '@/lib/types/admin'

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
import { Textarea } from '@/components/ui/textarea'

type Draft = {
  codigo_interno: string
  codigo_barras: string
  nombre: string
  descripcion: string
  categoria: string
  laboratorio: string
  presentacion: string
  precio_costo: string
  precio_venta_sugerido: string
  iva_alicuota: string
  activo: boolean
}

function fromProducto(p?: Producto): Draft {
  return {
    codigo_interno: p?.codigo_interno ?? '',
    codigo_barras: p?.codigo_barras ?? '',
    nombre: p?.nombre ?? '',
    descripcion: p?.descripcion ?? '',
    categoria: p?.categoria ?? '',
    laboratorio: p?.laboratorio ?? '',
    presentacion: p?.presentacion ?? '',
    precio_costo: p?.precio_costo != null ? String(p.precio_costo) : '',
    precio_venta_sugerido:
      p?.precio_venta_sugerido != null ? String(p.precio_venta_sugerido) : '',
    iva_alicuota: String(p?.iva_alicuota ?? 21),
    activo: p?.activo ?? true,
  }
}

export default function ProductoForm({
  mode,
  initial,
}: {
  mode: 'create' | 'edit'
  initial?: Producto
}) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(fromProducto(initial))
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
      codigo_interno: draft.codigo_interno.trim() || null,
      codigo_barras: draft.codigo_barras.trim() || null,
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      categoria: draft.categoria.trim() || null,
      laboratorio: draft.laboratorio.trim() || null,
      presentacion: draft.presentacion.trim() || null,
      precio_costo: draft.precio_costo ? Number(draft.precio_costo) : null,
      precio_venta_sugerido: draft.precio_venta_sugerido
        ? Number(draft.precio_venta_sugerido)
        : null,
      iva_alicuota: Number(draft.iva_alicuota) || 21,
      activo: draft.activo,
    }
    if (mode === 'create') {
      const { data, error } = await sb
        .from('productos')
        .insert(payload)
        .select('id')
        .maybeSingle<{ id: string }>()
      setBusy(false)
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '23505') setErr('Ya existe un producto con ese código interno.')
        else setErr(error.message)
        return
      }
      router.push(
        data?.id
          ? `/hub/operaciones/stock/${data.id}`
          : '/hub/operaciones/stock',
      )
      router.refresh()
    } else if (initial) {
      const { error } = await sb.from('productos').update(payload).eq('id', initial.id)
      setBusy(false)
      if (error) {
        setErr(error.message)
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
          Datos del producto
        </CardTitle>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={draft.activo}
            onCheckedChange={(v) => patch('activo', Boolean(v))}
          />
          Activo
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

        <Field label="Nombre *">
          <Input
            value={draft.nombre}
            onChange={(e) => patch('nombre', e.target.value)}
            placeholder="Ibuprofeno 400mg x 20 comp."
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Código interno">
            <Input
              value={draft.codigo_interno}
              onChange={(e) => patch('codigo_interno', e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label="Código de barras">
            <Input
              value={draft.codigo_barras}
              onChange={(e) => patch('codigo_barras', e.target.value)}
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Categoría">
            <Input
              value={draft.categoria}
              onChange={(e) => patch('categoria', e.target.value)}
            />
          </Field>
          <Field label="Laboratorio">
            <Input
              value={draft.laboratorio}
              onChange={(e) => patch('laboratorio', e.target.value)}
            />
          </Field>
          <Field label="Presentación">
            <Input
              value={draft.presentacion}
              onChange={(e) => patch('presentacion', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Precio costo">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={draft.precio_costo}
              onChange={(e) => patch('precio_costo', e.target.value)}
            />
          </Field>
          <Field label="Precio venta sugerido">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={draft.precio_venta_sugerido}
              onChange={(e) => patch('precio_venta_sugerido', e.target.value)}
            />
          </Field>
          <Field label="IVA %">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={draft.iva_alicuota}
              onChange={(e) => patch('iva_alicuota', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Descripción">
          <Textarea
            value={draft.descripcion}
            onChange={(e) => patch('descripcion', e.target.value)}
            rows={2}
          />
        </Field>

        <div className="flex justify-end pt-1">
          <Button onClick={save} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : mode === 'create' ? (
              'Crear producto'
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
