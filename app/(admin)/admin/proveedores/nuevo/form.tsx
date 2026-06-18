'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { CondicionIva } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
const CATEGORIAS = ['Laboratorio', 'Droguería', 'Perfumería', 'Accesorios', 'Servicios', 'Otro']

const CONDICIONES: CondicionIva[] = [
  'responsable_inscripto',
  'monotributo',
  'exento',
  'consumidor_final',
]

type FormState = {
  razon_social: string
  nombre_comercial: string
  cuit: string
  condicion_iva: CondicionIva | ''
  categoria: string
  domicilio_fiscal: string
  localidad: string
  provincia: string
  codigo_postal: string
  email_general: string
  telefono_general: string
  sitio_web: string
  plazo_pago_dias: string
  descuento_pronto_pago_pct: string
  minimo_compra: string
  frecuencia_visita_dias: string
  calificacion_interna: string
  notas: string
}

const initialForm: FormState = {
  razon_social: '',
  nombre_comercial: '',
  cuit: '',
  condicion_iva: '',
  categoria: '',
  domicilio_fiscal: '',
  localidad: '',
  provincia: '',
  codigo_postal: '',
  email_general: '',
  telefono_general: '',
  sitio_web: '',
  plazo_pago_dias: '30',
  descuento_pronto_pago_pct: '0',
  minimo_compra: '0',
  frecuencia_visita_dias: '',
  calificacion_interna: '',
  notas: '',
}

export default function NuevoProveedorForm() {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(initialForm)

  function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    if (!form.razon_social.trim()) {
      setErr('Razón social es obligatoria.')
      return
    }
    const cuit = form.cuit.replace(/\D/g, '')
    if (cuit.length !== 11) {
      setErr('CUIT debe tener 11 dígitos.')
      return
    }

    setBusy(true)
    const payload = {
      razon_social: form.razon_social.trim(),
      nombre_comercial: form.nombre_comercial.trim() || null,
      cuit,
      condicion_iva: form.condicion_iva || null,
      categoria: form.categoria.trim() || null,
      domicilio_fiscal: form.domicilio_fiscal.trim() || null,
      localidad: form.localidad.trim() || null,
      provincia: form.provincia.trim() || null,
      codigo_postal: form.codigo_postal.trim() || null,
      email_general: form.email_general.trim().toLowerCase() || null,
      telefono_general: form.telefono_general.trim() || null,
      sitio_web: form.sitio_web.trim() || null,
      plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
      descuento_pronto_pago_pct: Number(form.descuento_pronto_pago_pct) || 0,
      minimo_compra: Number(form.minimo_compra) || 0,
      frecuencia_visita_dias: form.frecuencia_visita_dias
        ? Number(form.frecuencia_visita_dias)
        : null,
      calificacion_interna: form.calificacion_interna
        ? Number(form.calificacion_interna)
        : null,
      notas: form.notas.trim() || null,
    }

    const { data, error } = await sb
      .from('proveedores')
      .insert(payload)
      .select('id')
      .maybeSingle<{ id: string }>()
    setBusy(false)
    if (error) {
      const code = (error as { code?: string }).code
      if (error.message.includes('duplicate') || code === '23505') {
        setErr('Ya existe un proveedor con ese CUIT.')
      } else {
        setErr(error.message)
      }
      return
    }
    if (data?.id) {
      router.push(`/admin/proveedores/${data.id}`)
      router.refresh()
    } else {
      router.push('/admin/proveedores')
    }
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
            Datos fiscales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Razón social *">
              <Input
                value={form.razon_social}
                onChange={(e) => patch('razon_social', e.target.value)}
                placeholder="Droguería Norte S.A."
                required
              />
            </Field>
            <Field label="CUIT *">
              <Input
                value={form.cuit}
                onChange={(e) => patch('cuit', e.target.value)}
                placeholder="30123456789"
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Nombre comercial">
              <Input
                value={form.nombre_comercial}
                onChange={(e) => patch('nombre_comercial', e.target.value)}
                placeholder="Droguería Norte"
              />
            </Field>
            <Field label="Condición IVA">
              <Select
                value={form.condicion_iva || NONE}
                onValueChange={(v) =>
                  patch('condicion_iva', v === NONE ? '' : (v as CondicionIva))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {CONDICIONES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONDICION_IVA_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Categoría">
            <Input
              list="sa-hub-categorias"
              value={form.categoria}
              onChange={(e) => patch('categoria', e.target.value)}
              placeholder="Laboratorio, Droguería, etc."
            />
            <datalist id="sa-hub-categorias">
              {CATEGORIAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Contacto y dirección
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Domicilio fiscal">
            <Input
              value={form.domicilio_fiscal}
              onChange={(e) => patch('domicilio_fiscal', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
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
            <Field label="CP">
              <Input
                value={form.codigo_postal}
                onChange={(e) => patch('codigo_postal', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email general">
              <Input
                type="email"
                value={form.email_general}
                onChange={(e) => patch('email_general', e.target.value)}
                placeholder="ventas@proveedor.com"
              />
            </Field>
            <Field label="Teléfono general">
              <Input
                value={form.telefono_general}
                onChange={(e) => patch('telefono_general', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Sitio web">
            <Input
              value={form.sitio_web}
              onChange={(e) => patch('sitio_web', e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Condiciones comerciales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Plazo de pago (días)">
              <Input
                type="number"
                min={0}
                value={form.plazo_pago_dias}
                onChange={(e) => patch('plazo_pago_dias', e.target.value)}
              />
            </Field>
            <Field label="Dto. pronto pago %">
              <Input
                type="number"
                min={0}
                step={0.1}
                value={form.descuento_pronto_pago_pct}
                onChange={(e) => patch('descuento_pronto_pago_pct', e.target.value)}
              />
            </Field>
            <Field label="Mínimo compra">
              <Input
                type="number"
                min={0}
                value={form.minimo_compra}
                onChange={(e) => patch('minimo_compra', e.target.value)}
              />
            </Field>
            <Field label="Visita cada (días)">
              <Input
                type="number"
                min={0}
                value={form.frecuencia_visita_dias}
                onChange={(e) => patch('frecuencia_visita_dias', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_3fr]">
            <Field label="Calificación (1-5)">
              <Input
                type="number"
                min={1}
                max={5}
                value={form.calificacion_interna}
                onChange={(e) => patch('calificacion_interna', e.target.value)}
              />
            </Field>
            <Field label="Notas internas">
              <Textarea
                value={form.notas}
                onChange={(e) => patch('notas', e.target.value)}
                rows={2}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando…
            </>
          ) : (
            <>
              Crear proveedor
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
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
