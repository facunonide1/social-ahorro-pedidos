'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import type { Empleado } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
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

const NONE = '__none__'

export function EmpleadoForm({
  empleado,
  sucursales,
}: {
  empleado?: Empleado
  sucursales: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = Boolean(empleado)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre_completo: empleado?.nombre_completo ?? '',
    dni: empleado?.dni ?? '',
    fecha_nacimiento: empleado?.fecha_nacimiento ?? '',
    telefono: empleado?.telefono ?? '',
    email: empleado?.email ?? '',
    sucursal_id: empleado?.sucursal_id ?? '',
    puesto: empleado?.puesto ?? '',
    es_farmaceutico: (empleado as any)?.es_farmaceutico ?? false,
    matricula: (empleado as any)?.matricula ?? '',
    fecha_ingreso: empleado?.fecha_ingreso ?? '',
    fecha_egreso: empleado?.fecha_egreso ?? '',
    salario_base: String(empleado?.salario_base ?? ''),
    activo: empleado?.activo ?? true,
    observaciones: empleado?.observaciones ?? '',
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.nombre_completo.trim()) {
      setErr('El nombre completo es obligatorio.')
      return
    }
    setBusy(true)
    const payload = {
      nombre_completo: form.nombre_completo.trim(),
      dni: form.dni.trim() || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      sucursal_id: form.sucursal_id || null,
      puesto: form.puesto.trim() || null,
      es_farmaceutico: form.es_farmaceutico,
      matricula: form.es_farmaceutico ? (form.matricula.trim() || null) : null,
      fecha_ingreso: form.fecha_ingreso || null,
      fecha_egreso: form.fecha_egreso || null,
      salario_base: form.salario_base ? Number(form.salario_base) : null,
      activo: form.activo,
      observaciones: form.observaciones.trim() || null,
    }

    if (isEdit && empleado) {
      const { error } = await sb
        .from('empleados')
        .update(payload)
        .eq('id', empleado.id)
      setBusy(false)
      if (error) {
        setErr(error.message)
        return
      }
      toast.success('Empleado actualizado.')
      router.push(`/admin/rrhh/empleados/${empleado.id}`)
      router.refresh()
      return
    }

    const { data, error } = await sb
      .from('empleados')
      .insert(payload)
      .select('id')
      .maybeSingle<{ id: string }>()
    setBusy(false)
    if (error || !data) {
      setErr(error?.message || 'No se pudo crear el empleado.')
      return
    }
    toast.success('Empleado creado.')
    router.push(`/admin/rrhh/empleados/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Datos personales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre completo *">
              <Input
                value={form.nombre_completo}
                onChange={(e) => patch('nombre_completo', e.target.value)}
              />
            </Field>
            <Field label="DNI">
              <Input
                value={form.dni}
                onChange={(e) => patch('dni', e.target.value)}
              />
            </Field>
            <Field label="Fecha de nacimiento">
              <Input
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => patch('fecha_nacimiento', e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={form.telefono}
                onChange={(e) => patch('telefono', e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => patch('email', e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Datos laborales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Sucursal">
              <Select
                value={form.sucursal_id || NONE}
                onValueChange={(v) =>
                  patch('sucursal_id', v === NONE ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Sin asignar —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Sin asignar —</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Puesto">
              <Input
                value={form.puesto}
                onChange={(e) => patch('puesto', e.target.value)}
                placeholder="Farmacéutico, cajero, repositor…"
              />
            </Field>
            <Field label="Farmacéutico/a">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={form.es_farmaceutico} onChange={(e) => patch('es_farmaceutico', e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                Cuenta para la cobertura farmacéutica
              </label>
            </Field>
            {form.es_farmaceutico && (
              <Field label="Matrícula">
                <Input value={form.matricula} onChange={(e) => patch('matricula', e.target.value)} placeholder="N° de matrícula" />
              </Field>
            )}
            <Field label="Fecha de ingreso">
              <Input
                type="date"
                value={form.fecha_ingreso}
                onChange={(e) => patch('fecha_ingreso', e.target.value)}
              />
            </Field>
            <Field label="Fecha de egreso">
              <Input
                type="date"
                value={form.fecha_egreso}
                onChange={(e) => patch('fecha_egreso', e.target.value)}
              />
            </Field>
            <Field label="Salario base ($)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.salario_base}
                onChange={(e) => patch('salario_base', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Observaciones">
            <Textarea
              value={form.observaciones}
              onChange={(e) => patch('observaciones', e.target.value)}
              rows={2}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.activo}
              onCheckedChange={(v) => patch('activo', v === true)}
            />
            Empleado activo
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              {isEdit ? 'Guardar cambios' : 'Crear empleado'}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
