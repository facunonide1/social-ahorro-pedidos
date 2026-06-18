'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { METODO_PAGO_LABELS } from '@/lib/types/admin'
import type { MetodoPago } from '@/lib/types/admin'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const NONE = '__none__'

const ESTADOS_PENDIENTES = ['aprobada', 'programada_pago', 'pagada_parcial', 'vencida']

type Prov = { id: string; razon_social: string; cuit: string }

type FacturaPend = {
  id: string
  tipo_factura: string
  punto_venta: string
  numero_factura: string
  fecha_emision: string
  fecha_vencimiento: string
  total: number
  estado: string
  pago_facturas: { monto_aplicado: number }[] | null
}

type FacturaConSaldo = FacturaPend & {
  _aplicado: number
  _saldo: number
}

export default function NuevoPagoForm({ proveedores }: { proveedores: Prov[] }) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    proveedor_id: '',
    fecha_pago: today,
    metodo_pago: 'transferencia' as MetodoPago,
    cuenta_bancaria_origen: '',
    monto_total: '',
    retenciones_aplicadas: '0',
    observaciones: '',
  })

  const [facturas, setFacturas] = useState<FacturaPend[]>([])
  const [loadingFacs, setLoadingFacs] = useState(false)
  const [aplicaciones, setAplicaciones] = useState<Record<string, string>>({})

  function patchForm<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  useEffect(() => {
    if (!form.proveedor_id) {
      setFacturas([])
      setAplicaciones({})
      return
    }
    let cancelled = false
    setLoadingFacs(true)
    ;(async () => {
      const { data } = await sb
        .from('facturas_proveedor')
        .select(
          'id, tipo_factura, punto_venta, numero_factura, fecha_emision, fecha_vencimiento, total, estado, pago_facturas(monto_aplicado)',
        )
        .eq('proveedor_id', form.proveedor_id)
        .in('estado', ESTADOS_PENDIENTES)
        .order('fecha_vencimiento', { ascending: true })
      if (cancelled) return
      setFacturas((data ?? []) as FacturaPend[])
      setAplicaciones({})
      setLoadingFacs(false)
    })()
    return () => {
      cancelled = true
    }
  }, [form.proveedor_id, sb])

  const facturasConSaldo: FacturaConSaldo[] = useMemo(
    () =>
      facturas.map((f) => {
        const aplicado = (f.pago_facturas ?? []).reduce(
          (a, x) => a + Number(x.monto_aplicado),
          0,
        )
        const saldo = Math.max(0, Number(f.total) - aplicado)
        return { ...f, _aplicado: aplicado, _saldo: saldo }
      }),
    [facturas],
  )

  const sumaAplicaciones = useMemo(
    () => Object.values(aplicaciones).reduce((a, v) => a + (Number(v) || 0), 0),
    [aplicaciones],
  )

  function setAplicacion(facId: string, valor: string) {
    setAplicaciones((prev) => {
      const next = { ...prev }
      if (!valor || Number(valor) <= 0) delete next[facId]
      else next[facId] = valor
      return next
    })
  }

  function autoLlenar() {
    if (sumaAplicaciones > 0) patchForm('monto_total', sumaAplicaciones.toFixed(2))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.proveedor_id) {
      setErr('Elegí un proveedor.')
      return
    }
    if (!form.fecha_pago) {
      setErr('Falta la fecha de pago.')
      return
    }
    const monto = Number(form.monto_total) || 0
    if (monto <= 0) {
      setErr('Ingresá el monto total del pago.')
      return
    }

    const aplicacionesPayload = Object.entries(aplicaciones)
      .map(([factura_id, m]) => ({ factura_id, monto_aplicado: Number(m) }))
      .filter((a) => a.monto_aplicado > 0)

    const sumaApl = aplicacionesPayload.reduce((a, x) => a + x.monto_aplicado, 0)
    if (sumaApl > 0 && Math.abs(sumaApl - monto) > 0.01) {
      setErr(
        `La suma de las aplicaciones ($${sumaApl.toFixed(2)}) tiene que coincidir con el monto del pago ($${monto.toFixed(2)}).`,
      )
      return
    }

    setBusy(true)
    const res = await fetch('/api/hub/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor_id: form.proveedor_id,
        fecha_pago: form.fecha_pago,
        metodo_pago: form.metodo_pago,
        cuenta_bancaria_origen: form.cuenta_bancaria_origen.trim() || null,
        monto_total: monto,
        retenciones_aplicadas: Number(form.retenciones_aplicadas) || 0,
        observaciones: form.observaciones.trim() || null,
        aplicaciones: aplicacionesPayload,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(json.hint || json.error || 'No se pudo crear la orden de pago.')
      return
    }
    router.push(`/admin/pagos/${json.pagoId}`)
    router.refresh()
  }

  const desfase =
    sumaAplicaciones > 0 &&
    Math.abs(sumaAplicaciones - (Number(form.monto_total) || 0)) > 0.01

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
            Proveedor y fecha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Proveedor *">
              <Select
                value={form.proveedor_id || NONE}
                onValueChange={(v) =>
                  patchForm('proveedor_id', v === NONE ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Elegí proveedor —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Elegí proveedor —</SelectItem>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razon_social} — {p.cuit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fecha de pago *">
              <Input
                type="date"
                value={form.fecha_pago}
                onChange={(e) => patchForm('fecha_pago', e.target.value)}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Facturas pendientes del proveedor
          </CardTitle>
          {sumaAplicaciones > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={autoLlenar}>
              Usar suma como monto ($
              {sumaAplicaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!form.proveedor_id && (
            <div className="text-sm text-muted-foreground">
              Elegí un proveedor para ver sus facturas pendientes.
            </div>
          )}
          {form.proveedor_id && loadingFacs && (
            <div className="text-sm text-muted-foreground">Cargando facturas…</div>
          )}
          {form.proveedor_id && !loadingFacs && facturasConSaldo.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Este proveedor no tiene facturas pendientes en estado
              aprobada/programada/parcial/vencida.
            </div>
          )}
          {form.proveedor_id && !loadingFacs && facturasConSaldo.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="w-[220px]">Aplicar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturasConSaldo.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">
                      {f.tipo_factura} {f.punto_venta}-{f.numero_factura}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(f.fecha_vencimiento).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${Number(f.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        f._saldo > 0 ? 'text-destructive' : 'text-success',
                      )}
                    >
                      ${f._saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          max={f._saldo}
                          value={aplicaciones[f.id] ?? ''}
                          onChange={(e) => setAplicacion(f.id, e.target.value)}
                          placeholder="0.00"
                          className="h-8 w-28"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAplicacion(f.id, f._saldo.toFixed(2))}
                          title="Aplicar saldo total de esta factura"
                        >
                          Saldo
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Método y montos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
            <Field label="Método de pago *">
              <Select
                value={form.metodo_pago}
                onValueChange={(v) => patchForm('metodo_pago', v as MetodoPago)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METODO_PAGO_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cuenta bancaria origen / referencia">
              <Input
                value={form.cuenta_bancaria_origen}
                onChange={(e) =>
                  patchForm('cuenta_bancaria_origen', e.target.value)
                }
                placeholder="Ej: Galicia 123/456 — CBU 0070..."
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Monto total a pagar *">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.monto_total}
                onChange={(e) => patchForm('monto_total', e.target.value)}
                required
              />
            </Field>
            <Field label="Retenciones aplicadas">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.retenciones_aplicadas}
                onChange={(e) =>
                  patchForm('retenciones_aplicadas', e.target.value)
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 p-4 text-sm">
            <span className="text-muted-foreground">Suma aplicada a facturas</span>
            <span className="text-right font-semibold tabular-nums">
              ${sumaAplicaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-muted-foreground">Monto total del pago</span>
            <span className="text-right font-semibold tabular-nums">
              ${(Number(form.monto_total) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            {desfase && (
              <span className="col-span-2 text-xs text-warning">
                La suma aplicada no coincide con el monto. Si dejás aplicaciones,
                deben sumar igual al monto total.
              </span>
            )}
          </div>

          <Field label="Observaciones">
            <Textarea
              value={form.observaciones}
              onChange={(e) => patchForm('observaciones', e.target.value)}
              rows={2}
            />
          </Field>
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
              Crear orden de pago
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
