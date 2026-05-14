'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import {
  ESTADO_IMPUESTO_LABELS,
  TIPO_IMPUESTO_LABELS,
} from '@/lib/types/admin'
import type {
  EstadoImpuesto,
  ImpuestoObligacion,
  TipoImpuesto,
} from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'

const TIPOS: TipoImpuesto[] = [
  'iva',
  'iibb',
  'ganancias',
  'cargas_sociales',
  'monotributo',
  'otros',
]

const ESTADO_VARIANT: Record<
  EstadoImpuesto,
  React.ComponentProps<typeof Badge>['variant']
> = {
  pendiente: 'warning',
  presentado: 'info',
  pagado: 'success',
  vencido: 'destructive',
}

function estadoEfectivo(r: ImpuestoObligacion): EstadoImpuesto {
  if (r.estado === 'pagado' || r.estado === 'presentado') return r.estado
  const venc = new Date(r.fecha_vencimiento)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return venc < hoy ? 'vencido' : 'pendiente'
}

export default function ImpuestosEditor({
  initial,
  canWrite,
}: {
  initial: ImpuestoObligacion[]
  canWrite: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [rows, setRows] = useState(initial)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    tipo: 'iva' as TipoImpuesto,
    periodo: '',
    descripcion: '',
    fecha_vencimiento: '',
    monto_estimado: '',
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function add() {
    setErr(null)
    if (!form.periodo.trim() || !form.fecha_vencimiento) {
      setErr('Período y fecha de vencimiento son obligatorios.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('impuestos_obligaciones')
      .insert({
        tipo: form.tipo,
        periodo: form.periodo.trim(),
        descripcion: form.descripcion.trim() || null,
        fecha_vencimiento: form.fecha_vencimiento,
        monto_estimado: form.monto_estimado ? Number(form.monto_estimado) : null,
        estado: 'pendiente',
      })
      .select('*')
      .maybeSingle<ImpuestoObligacion>()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setRows((arr) => [...arr, data].sort((a, b) =>
      a.fecha_vencimiento.localeCompare(b.fecha_vencimiento),
    ))
    setForm({
      tipo: 'iva',
      periodo: '',
      descripcion: '',
      fecha_vencimiento: '',
      monto_estimado: '',
    })
    setAdding(false)
    router.refresh()
  }

  async function marcarPagado(r: ImpuestoObligacion) {
    const montoRealStr = window.prompt(
      `Monto real pagado de ${TIPO_IMPUESTO_LABELS[r.tipo]} ${r.periodo}:`,
      String(r.monto_estimado ?? ''),
    )
    if (montoRealStr === null) return
    const montoReal = Number(montoRealStr)
    const { error } = await sb
      .from('impuestos_obligaciones')
      .update({
        estado: 'pagado',
        monto_real: Number.isFinite(montoReal) ? montoReal : r.monto_estimado,
      })
      .eq('id', r.id)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((arr) =>
      arr.map((x) =>
        x.id === r.id
          ? {
              ...x,
              estado: 'pagado' as EstadoImpuesto,
              monto_real: Number.isFinite(montoReal) ? montoReal : x.monto_estimado,
            }
          : x,
      ),
    )
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {canWrite && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant={adding ? 'outline' : 'default'}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? (
              'Cancelar'
            ) : (
              <>
                <Plus className="size-4" />
                Cargar obligación
              </>
            )}
          </Button>
        </div>
      )}

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Nueva obligación fiscal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Tipo">
                <Select
                  value={form.tipo}
                  onValueChange={(v) => patch('tipo', v as TipoImpuesto)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_IMPUESTO_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Período">
                <Input
                  value={form.periodo}
                  onChange={(e) => patch('periodo', e.target.value)}
                  placeholder="2026-05"
                />
              </Field>
              <Field label="Vencimiento">
                <Input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => patch('fecha_vencimiento', e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
              <Field label="Descripción">
                <Input
                  value={form.descripcion}
                  onChange={(e) => patch('descripcion', e.target.value)}
                />
              </Field>
              <Field label="Monto estimado">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.monto_estimado}
                  onChange={(e) => patch('monto_estimado', e.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={add} disabled={busy} size="sm">
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Guardar'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Impuesto</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              {canWrite && <TableHead className="w-[100px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canWrite ? 6 : 5}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Sin obligaciones cargadas.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const est = estadoEfectivo(r)
                const monto = r.monto_real ?? r.monto_estimado
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {TIPO_IMPUESTO_LABELS[r.tipo]}
                      {r.descripcion && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {r.descripcion}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.periodo}
                    </TableCell>
                    <TableCell
                      className={cn(
                        est === 'vencido' && 'font-semibold text-destructive',
                      )}
                    >
                      {new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {monto != null
                        ? `$${Number(monto).toLocaleString('es-AR')}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_VARIANT[est]}>
                        {ESTADO_IMPUESTO_LABELS[est]}
                      </Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        {r.estado !== 'pagado' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => marcarPagado(r)}
                          >
                            <Check className="size-3.5" />
                            Pagar
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
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
