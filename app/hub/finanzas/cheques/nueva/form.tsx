'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { ESTADO_CHEQUE_LABELS } from '@/lib/types/admin'
import type { EstadoCheque, TipoCheque } from '@/lib/types/admin'

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
const ESTADOS: EstadoCheque[] = [
  'emitido',
  'en_cartera',
  'depositado',
  'cobrado',
  'rechazado',
  'anulado',
]

export default function ChequeForm({
  proveedores,
  cuentas,
}: {
  proveedores: { id: string; razon_social: string }[]
  cuentas: { id: string; nombre: string; banco: string }[]
}) {
  const router = useRouter()
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    tipo: 'emitido' as TipoCheque,
    numero: '',
    banco: '',
    cuenta: '',
    monto: '',
    fecha_emision: today,
    fecha_cobro_estimada: '',
    estado: 'emitido' as EstadoCheque,
    beneficiario_o_emisor: '',
    proveedor_id: '',
    cuenta_bancaria_id: '',
    observaciones: '',
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.numero.trim() || !form.banco.trim()) {
      setErr('Número y banco son obligatorios.')
      return
    }
    const monto = Number(form.monto)
    if (!monto || monto <= 0) {
      setErr('Ingresá un monto válido.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('cheques')
      .insert({
        tipo: form.tipo,
        numero: form.numero.trim(),
        banco: form.banco.trim(),
        cuenta: form.cuenta.trim() || null,
        monto,
        fecha_emision: form.fecha_emision,
        fecha_cobro_estimada: form.fecha_cobro_estimada || null,
        estado: form.estado,
        beneficiario_o_emisor: form.beneficiario_o_emisor.trim() || null,
        proveedor_id: form.tipo === 'emitido' ? form.proveedor_id || null : null,
        cuenta_bancaria_id: form.cuenta_bancaria_id || null,
        observaciones: form.observaciones.trim() || null,
      })
      .select('id')
      .maybeSingle<{ id: string }>()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    router.push('/hub/finanzas/cheques')
    router.refresh()
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Datos del cheque
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {err && (
            <Alert variant="destructive">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Tipo">
              <Select
                value={form.tipo}
                onValueChange={(v) => patch('tipo', v as TipoCheque)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="emitido">Emitido (pagamos)</SelectItem>
                  <SelectItem value="recibido">Recibido (cobramos)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Número *">
              <Input
                value={form.numero}
                onChange={(e) => patch('numero', e.target.value)}
                className="font-mono"
              />
            </Field>
            <Field label="Monto *">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.monto}
                onChange={(e) => patch('monto', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Banco *">
              <Input
                value={form.banco}
                onChange={(e) => patch('banco', e.target.value)}
              />
            </Field>
            <Field label="Cuenta">
              <Input
                value={form.cuenta}
                onChange={(e) => patch('cuenta', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Fecha emisión">
              <Input
                type="date"
                value={form.fecha_emision}
                onChange={(e) => patch('fecha_emision', e.target.value)}
              />
            </Field>
            <Field label="Cobro estimado">
              <Input
                type="date"
                value={form.fecha_cobro_estimada}
                onChange={(e) => patch('fecha_cobro_estimada', e.target.value)}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={form.estado}
                onValueChange={(v) => patch('estado', v as EstadoCheque)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ESTADO_CHEQUE_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.tipo === 'emitido' ? (
            <Field label="Proveedor beneficiario">
              <Select
                value={form.proveedor_id || NONE}
                onValueChange={(v) =>
                  patch('proveedor_id', v === NONE ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Opcional —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Sin proveedor —</SelectItem>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Emisor (quien nos paga)">
              <Input
                value={form.beneficiario_o_emisor}
                onChange={(e) =>
                  patch('beneficiario_o_emisor', e.target.value)
                }
              />
            </Field>
          )}

          <Field label="Cuenta bancaria asociada">
            <Select
              value={form.cuenta_bancaria_id || NONE}
              onValueChange={(v) =>
                patch('cuenta_bancaria_id', v === NONE ? '' : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="— Opcional —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Ninguna —</SelectItem>
                {cuentas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} · {c.banco}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Observaciones">
            <Textarea
              value={form.observaciones}
              onChange={(e) => patch('observaciones', e.target.value)}
              rows={2}
            />
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Crear cheque'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
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
