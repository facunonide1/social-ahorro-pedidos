'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { CondicionIva, Proveedor } from '@/lib/types/admin'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const NONE = '__none__'

type Draft = {
  razon_social: string
  nombre_comercial: string
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
  activo: boolean
}

function fromProveedor(p: Proveedor): Draft {
  return {
    razon_social: p.razon_social,
    nombre_comercial: p.nombre_comercial ?? '',
    condicion_iva: p.condicion_iva ?? '',
    categoria: p.categoria ?? '',
    domicilio_fiscal: p.domicilio_fiscal ?? '',
    localidad: p.localidad ?? '',
    provincia: p.provincia ?? '',
    codigo_postal: p.codigo_postal ?? '',
    email_general: p.email_general ?? '',
    telefono_general: p.telefono_general ?? '',
    sitio_web: p.sitio_web ?? '',
    plazo_pago_dias: String(p.plazo_pago_dias ?? 30),
    descuento_pronto_pago_pct: String(p.descuento_pronto_pago_pct ?? 0),
    minimo_compra: String(p.minimo_compra ?? 0),
    frecuencia_visita_dias: p.frecuencia_visita_dias ? String(p.frecuencia_visita_dias) : '',
    calificacion_interna: p.calificacion_interna ? String(p.calificacion_interna) : '',
    notas: p.notas ?? '',
    activo: p.activo,
  }
}

const CONDICIONES: CondicionIva[] = [
  'responsable_inscripto',
  'monotributo',
  'exento',
  'consumidor_final',
]

export default function ProveedorEditor({
  initial,
  readOnly,
}: {
  initial: Proveedor
  readOnly: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(fromProveedor(initial))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const original = fromProveedor(initial)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  async function save() {
    setBusy(true)
    setErr(null)
    setMsg(null)
    const payload = {
      razon_social: draft.razon_social.trim(),
      nombre_comercial: draft.nombre_comercial.trim() || null,
      condicion_iva: draft.condicion_iva || null,
      categoria: draft.categoria.trim() || null,
      domicilio_fiscal: draft.domicilio_fiscal.trim() || null,
      localidad: draft.localidad.trim() || null,
      provincia: draft.provincia.trim() || null,
      codigo_postal: draft.codigo_postal.trim() || null,
      email_general: draft.email_general.trim().toLowerCase() || null,
      telefono_general: draft.telefono_general.trim() || null,
      sitio_web: draft.sitio_web.trim() || null,
      plazo_pago_dias: Number(draft.plazo_pago_dias) || 30,
      descuento_pronto_pago_pct: Number(draft.descuento_pronto_pago_pct) || 0,
      minimo_compra: Number(draft.minimo_compra) || 0,
      frecuencia_visita_dias: draft.frecuencia_visita_dias
        ? Number(draft.frecuencia_visita_dias)
        : null,
      calificacion_interna: draft.calificacion_interna
        ? Number(draft.calificacion_interna)
        : null,
      notas: draft.notas.trim() || null,
      activo: draft.activo,
    }
    const { error } = await sb.from('proveedores').update(payload).eq('id', initial.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setMsg('Cambios guardados.')
    router.refresh()
    setTimeout(() => setMsg(null), 2500)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Datos del proveedor
        </CardTitle>
        {!readOnly && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={draft.activo}
              onCheckedChange={(v) => patch('activo', Boolean(v))}
            />
            Activo
          </label>
        )}
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

        <fieldset disabled={readOnly} className="space-y-3 disabled:opacity-70">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Razón social">
              <Input
                value={draft.razon_social}
                onChange={(e) => patch('razon_social', e.target.value)}
              />
            </Field>
            <Field label="Condición IVA">
              <Select
                value={draft.condicion_iva || NONE}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Nombre comercial">
              <Input
                value={draft.nombre_comercial}
                onChange={(e) => patch('nombre_comercial', e.target.value)}
              />
            </Field>
            <Field label="Categoría">
              <Input
                value={draft.categoria}
                onChange={(e) => patch('categoria', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Domicilio fiscal">
            <Input
              value={draft.domicilio_fiscal}
              onChange={(e) => patch('domicilio_fiscal', e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
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
            <Field label="CP">
              <Input
                value={draft.codigo_postal}
                onChange={(e) => patch('codigo_postal', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Email">
              <Input
                type="email"
                value={draft.email_general}
                onChange={(e) => patch('email_general', e.target.value)}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={draft.telefono_general}
                onChange={(e) => patch('telefono_general', e.target.value)}
              />
            </Field>
            <Field label="Sitio web">
              <Input
                value={draft.sitio_web}
                onChange={(e) => patch('sitio_web', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Plazo pago (d)">
              <Input
                type="number"
                min={0}
                value={draft.plazo_pago_dias}
                onChange={(e) => patch('plazo_pago_dias', e.target.value)}
              />
            </Field>
            <Field label="Dto. pronto %">
              <Input
                type="number"
                min={0}
                step={0.1}
                value={draft.descuento_pronto_pago_pct}
                onChange={(e) => patch('descuento_pronto_pago_pct', e.target.value)}
              />
            </Field>
            <Field label="Mínimo compra">
              <Input
                type="number"
                min={0}
                value={draft.minimo_compra}
                onChange={(e) => patch('minimo_compra', e.target.value)}
              />
            </Field>
            <Field label="Visita cada (d)">
              <Input
                type="number"
                min={0}
                value={draft.frecuencia_visita_dias}
                onChange={(e) => patch('frecuencia_visita_dias', e.target.value)}
              />
            </Field>
            <Field label="Calificación (1-5)">
              <Input
                type="number"
                min={1}
                max={5}
                value={draft.calificacion_interna}
                onChange={(e) => patch('calificacion_interna', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notas internas">
            <Textarea
              value={draft.notas}
              onChange={(e) => patch('notas', e.target.value)}
              rows={3}
            />
          </Field>

          {!readOnly && (
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setDraft(fromProveedor(initial))}
                disabled={busy || !dirty}
              >
                Descartar
              </Button>
              <Button onClick={save} disabled={busy || !dirty}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </div>
          )}
        </fieldset>
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
