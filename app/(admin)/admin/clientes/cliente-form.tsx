'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  CONDICION_IVA_LABELS,
  CONDICION_PAGO_CRM_LABELS,
  TIPO_CLIENTE_CRM_LABELS,
  type ClienteCrm,
  type CondicionIva,
  type CondicionPagoCrm,
  type TipoClienteCrm,
} from '@/lib/types/admin'

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
const TIPOS: TipoClienteCrm[] = [
  'mayorista',
  'corporativo',
  'institucional',
  'particular_vip',
]
const COND_PAGO: CondicionPagoCrm[] = ['contado', '7d', '15d', '30d', '60d', '90d']
const COND_IVA: CondicionIva[] = [
  'responsable_inscripto',
  'monotributo',
  'exento',
  'consumidor_final',
]

export function ClienteForm({
  cliente,
  sucursales,
  vendedores,
}: {
  cliente?: ClienteCrm
  sucursales: { id: string; nombre: string }[]
  vendedores: { id: string; nombre: string | null; email: string }[]
}) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = Boolean(cliente)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    tipo_cliente: cliente?.tipo_cliente ?? ('mayorista' as TipoClienteCrm),
    razon_social: cliente?.razon_social ?? '',
    nombre_fantasia: cliente?.nombre_fantasia ?? '',
    cuit: cliente?.cuit ?? '',
    dni: cliente?.dni ?? '',
    email: cliente?.email ?? '',
    telefono: cliente?.telefono ?? '',
    direccion_completa: cliente?.direccion_completa ?? '',
    localidad: cliente?.localidad ?? '',
    provincia: cliente?.provincia ?? '',
    codigo_postal: cliente?.codigo_postal ?? '',
    sucursal_asignada_id: cliente?.sucursal_asignada_id ?? '',
    vendedor_asignado_id: cliente?.vendedor_asignado_id ?? '',
    condicion_iva: cliente?.condicion_iva ?? ('' as CondicionIva | ''),
    condicion_pago: cliente?.condicion_pago ?? ('contado' as CondicionPagoCrm),
    limite_credito: String(cliente?.limite_credito ?? '0'),
    descuento_general_pct: String(cliente?.descuento_general_pct ?? '0'),
    activo: cliente?.activo ?? true,
    notas: cliente?.notas ?? '',
    tags: (cliente?.tags ?? []).join(', '),
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.razon_social.trim()) {
      setErr('La razón social es obligatoria.')
      return
    }
    if (
      ['mayorista', 'corporativo'].includes(form.tipo_cliente) &&
      !form.cuit.trim()
    ) {
      setErr('Los clientes mayoristas y corporativos necesitan CUIT.')
      return
    }
    setBusy(true)
    const payload = {
      tipo_cliente: form.tipo_cliente,
      razon_social: form.razon_social.trim(),
      nombre_fantasia: form.nombre_fantasia.trim() || null,
      cuit: form.cuit.trim() || null,
      dni: form.dni.trim() || null,
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      direccion_completa: form.direccion_completa.trim() || null,
      localidad: form.localidad.trim() || null,
      provincia: form.provincia.trim() || null,
      codigo_postal: form.codigo_postal.trim() || null,
      sucursal_asignada_id: form.sucursal_asignada_id || null,
      vendedor_asignado_id: form.vendedor_asignado_id || null,
      condicion_iva: form.condicion_iva || null,
      condicion_pago: form.condicion_pago,
      limite_credito: Number(form.limite_credito) || 0,
      descuento_general_pct: Number(form.descuento_general_pct) || 0,
      activo: form.activo,
      notas: form.notas.trim() || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    if (isEdit && cliente) {
      const { error } = await sb
        .from('clientes_crm')
        .update(payload)
        .eq('id', cliente.id)
      setBusy(false)
      if (error) {
        setErr(error.message)
        return
      }
      toast.success('Cliente actualizado.')
      router.push(`/admin/clientes/${cliente.id}`)
      router.refresh()
      return
    }

    const { data, error } = await sb
      .from('clientes_crm')
      .insert(payload)
      .select('id')
      .maybeSingle<{ id: string }>()
    setBusy(false)
    if (error || !data) {
      setErr(error?.message || 'No se pudo crear el cliente.')
      return
    }
    toast.success('Cliente creado.')
    router.push(`/admin/clientes/${data.id}`)
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
            Identificación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo de cliente *">
              <Select
                value={form.tipo_cliente}
                onValueChange={(v) => patch('tipo_cliente', v as TipoClienteCrm)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_CLIENTE_CRM_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Razón social *">
              <Input
                value={form.razon_social}
                onChange={(e) => patch('razon_social', e.target.value)}
              />
            </Field>
            <Field label="Nombre de fantasía">
              <Input
                value={form.nombre_fantasia}
                onChange={(e) => patch('nombre_fantasia', e.target.value)}
              />
            </Field>
            <Field label="CUIT">
              <Input
                value={form.cuit}
                onChange={(e) => patch('cuit', e.target.value)}
                placeholder="30-12345678-9"
              />
            </Field>
            <Field label="DNI (particular VIP)">
              <Input
                value={form.dni}
                onChange={(e) => patch('dni', e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Contacto y domicilio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => patch('email', e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={form.telefono}
                onChange={(e) => patch('telefono', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Dirección completa">
            <Input
              value={form.direccion_completa}
              onChange={(e) => patch('direccion_completa', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Localidad">
              <Input
                value={form.localidad}
                onChange={(e) => patch('localidad', e.target.value)}
              />
            </Field>
            <Field label="Provincia">
              <Input
                value={form.provincia}
                onChange={(e) => patch('provincia', e.target.value)}
              />
            </Field>
            <Field label="Código postal">
              <Input
                value={form.codigo_postal}
                onChange={(e) => patch('codigo_postal', e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Comercial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Sucursal asignada">
              <Select
                value={form.sucursal_asignada_id || NONE}
                onValueChange={(v) =>
                  patch('sucursal_asignada_id', v === NONE ? '' : v)
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
            <Field label="Vendedor asignado">
              <Select
                value={form.vendedor_asignado_id || NONE}
                onValueChange={(v) =>
                  patch('vendedor_asignado_id', v === NONE ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Sin asignar —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Sin asignar —</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre || v.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Condición IVA">
              <Select
                value={form.condicion_iva || NONE}
                onValueChange={(v) =>
                  patch('condicion_iva', v === NONE ? '' : (v as CondicionIva))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Sin definir —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Sin definir —</SelectItem>
                  {COND_IVA.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONDICION_IVA_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Condición de pago">
              <Select
                value={form.condicion_pago}
                onValueChange={(v) =>
                  patch('condicion_pago', v as CondicionPagoCrm)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COND_PAGO.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONDICION_PAGO_CRM_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Límite de crédito ($)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.limite_credito}
                onChange={(e) => patch('limite_credito', e.target.value)}
              />
            </Field>
            <Field label="Descuento general (%)">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.descuento_general_pct}
                onChange={(e) =>
                  patch('descuento_general_pct', e.target.value)
                }
              />
            </Field>
          </div>
          <Field label="Tags (separados por coma)">
            <Input
              value={form.tags}
              onChange={(e) => patch('tags', e.target.value)}
              placeholder="farmacia, zona norte, pago puntual"
            />
          </Field>
          <Field label="Notas">
            <Textarea
              value={form.notas}
              onChange={(e) => patch('notas', e.target.value)}
              rows={2}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.activo}
              onCheckedChange={(v) => patch('activo', v === true)}
            />
            Cliente activo
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
              {isEdit ? 'Guardar cambios' : 'Crear cliente'}
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
