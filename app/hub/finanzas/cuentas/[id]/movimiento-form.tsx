'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { TIPO_MOVIMIENTO_LABELS } from '@/lib/types/admin'
import type { TipoMovimientoBancario } from '@/lib/types/admin'

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

const TIPOS: TipoMovimientoBancario[] = [
  'ingreso',
  'egreso',
  'transferencia',
  'ajuste',
]

export default function MovimientoForm({ cuentaId }: { cuentaId: string }) {
  const router = useRouter()
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    fecha: today,
    tipo: 'ingreso' as TipoMovimientoBancario,
    categoria: '',
    monto: '',
    descripcion: '',
    referencia: '',
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    setErr(null)
    const monto = Number(form.monto)
    if (!monto || monto <= 0) {
      setErr('Ingresá un monto mayor a cero.')
      return
    }
    setBusy(true)
    const { error } = await sb.from('movimientos_bancarios').insert({
      cuenta_bancaria_id: cuentaId,
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria.trim() || null,
      monto,
      descripcion: form.descripcion.trim() || null,
      referencia: form.referencia.trim() || null,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setForm({
      fecha: today,
      tipo: 'ingreso',
      categoria: '',
      monto: '',
      descripcion: '',
      referencia: '',
    })
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4" />
        Nuevo movimiento
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Nuevo movimiento
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fecha">
            <Input
              type="date"
              value={form.fecha}
              onChange={(e) => patch('fecha', e.target.value)}
            />
          </Field>
          <Field label="Tipo">
            <Select
              value={form.tipo}
              onValueChange={(v) => patch('tipo', v as TipoMovimientoBancario)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_MOVIMIENTO_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Monto">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={form.monto}
              onChange={(e) => patch('monto', e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Categoría">
            <Input
              value={form.categoria}
              onChange={(e) => patch('categoria', e.target.value)}
              placeholder="Pago proveedor, sueldos, ventas…"
            />
          </Field>
          <Field label="Referencia">
            <Input
              value={form.referencia}
              onChange={(e) => patch('referencia', e.target.value)}
              placeholder="N° comprobante / transferencia"
            />
          </Field>
        </div>
        <Field label="Descripción">
          <Input
            value={form.descripcion}
            onChange={(e) => patch('descripcion', e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy} size="sm">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar movimiento'
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
