'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type {
  CuentaBancariaPropia,
  Moneda,
  TipoCuentaPropia,
} from '@/lib/types/admin'

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

type Draft = {
  nombre: string
  banco: string
  tipo_cuenta: TipoCuentaPropia
  cbu: string
  alias: string
  moneda: Moneda
  activa: boolean
  observaciones: string
}

function fromCuenta(c?: CuentaBancariaPropia): Draft {
  return {
    nombre: c?.nombre ?? '',
    banco: c?.banco ?? '',
    tipo_cuenta: c?.tipo_cuenta ?? 'cuenta_corriente',
    cbu: c?.cbu ?? '',
    alias: c?.alias ?? '',
    moneda: c?.moneda ?? 'ARS',
    activa: c?.activa ?? true,
    observaciones: c?.observaciones ?? '',
  }
}

export default function CuentaForm({
  mode,
  initial,
}: {
  mode: 'create' | 'edit'
  initial?: CuentaBancariaPropia
}) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(fromCuenta(initial))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }))
  }

  async function save() {
    setErr(null)
    setMsg(null)
    if (!draft.nombre.trim() || !draft.banco.trim()) {
      setErr('Nombre y banco son obligatorios.')
      return
    }
    setBusy(true)
    const payload = {
      nombre: draft.nombre.trim(),
      banco: draft.banco.trim(),
      tipo_cuenta: draft.tipo_cuenta,
      cbu: draft.cbu.trim() || null,
      alias: draft.alias.trim() || null,
      moneda: draft.moneda,
      activa: draft.activa,
      observaciones: draft.observaciones.trim() || null,
    }
    if (mode === 'create') {
      const { data, error } = await sb
        .from('cuentas_bancarias_propias')
        .insert(payload)
        .select('id')
        .maybeSingle<{ id: string }>()
      setBusy(false)
      if (error) {
        setErr(error.message)
        return
      }
      router.push(
        data?.id ? `/hub/finanzas/cuentas/${data.id}` : '/hub/finanzas/cuentas',
      )
      router.refresh()
    } else if (initial) {
      const { error } = await sb
        .from('cuentas_bancarias_propias')
        .update(payload)
        .eq('id', initial.id)
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
          Datos de la cuenta
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre interno *">
            <Input
              value={draft.nombre}
              onChange={(e) => patch('nombre', e.target.value)}
              placeholder="Operativa Galicia"
            />
          </Field>
          <Field label="Banco *">
            <Input
              value={draft.banco}
              onChange={(e) => patch('banco', e.target.value)}
              placeholder="Banco Galicia"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tipo de cuenta">
            <Select
              value={draft.tipo_cuenta}
              onValueChange={(v) => patch('tipo_cuenta', v as TipoCuentaPropia)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cuenta_corriente">Cuenta corriente</SelectItem>
                <SelectItem value="caja_ahorro">Caja de ahorro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Moneda">
            <Select
              value={draft.moneda}
              onValueChange={(v) => patch('moneda', v as Moneda)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                <SelectItem value="USD">Dólares (USD)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CBU">
            <Input
              value={draft.cbu}
              onChange={(e) => patch('cbu', e.target.value)}
              className="font-mono"
              placeholder="0070..."
            />
          </Field>
          <Field label="Alias">
            <Input
              value={draft.alias}
              onChange={(e) => patch('alias', e.target.value)}
              placeholder="social.ahorro.gal"
            />
          </Field>
        </div>

        <Field label="Observaciones">
          <Textarea
            value={draft.observaciones}
            onChange={(e) => patch('observaciones', e.target.value)}
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
              'Crear cuenta'
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
