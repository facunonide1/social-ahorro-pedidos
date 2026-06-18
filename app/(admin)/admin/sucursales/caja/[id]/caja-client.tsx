'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownCircle, ArrowUpCircle, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  type CajaDiaria,
  type MovimientoCaja,
  type TipoMovimientoCaja,
} from '@/lib/types/admin'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KpiCard } from '@/components/cards/kpi-card'

const CATEGORIAS = [
  'venta',
  'cobro',
  'pago_proveedor',
  'gasto',
  'retiro',
  'ajuste',
  'otro',
]

function fmt(n: number): string {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export function CajaClient({
  caja: cajaInicial,
  movimientos: movInicial,
  canWrite,
}: {
  caja: CajaDiaria
  movimientos: MovimientoCaja[]
  canWrite: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [caja, setCaja] = useState(cajaInicial)
  const [movimientos, setMovimientos] = useState(movInicial)
  const [busy, setBusy] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [form, setForm] = useState({
    tipo: 'ingreso' as TipoMovimientoCaja,
    categoria: 'venta',
    monto: '',
    descripcion: '',
  })
  const [contado, setContado] = useState('')

  const cerrada = caja.estado === 'cerrada'
  const saldoSistema =
    Number(caja.saldo_inicial) +
    Number(caja.total_ingresos) -
    Number(caja.total_egresos)

  function recalcular(lista: MovimientoCaja[]) {
    const ing = lista
      .filter((m) => m.tipo === 'ingreso')
      .reduce((a, m) => a + Number(m.monto), 0)
    const egr = lista
      .filter((m) => m.tipo === 'egreso')
      .reduce((a, m) => a + Number(m.monto), 0)
    return { ing, egr }
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    const monto = Number(form.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('Ingresá un monto válido.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('movimientos_caja')
      .insert({
        caja_id: caja.id,
        tipo: form.tipo,
        categoria: form.categoria,
        monto,
        descripcion: form.descripcion.trim() || null,
      })
      .select('*')
      .maybeSingle<MovimientoCaja>()
    if (error || !data) {
      setBusy(false)
      toast.error(error?.message || 'No se pudo registrar el movimiento.')
      return
    }
    const nuevaLista = [data, ...movimientos]
    const { ing, egr } = recalcular(nuevaLista)
    const { error: updErr } = await sb
      .from('cajas_diarias')
      .update({ total_ingresos: ing, total_egresos: egr })
      .eq('id', caja.id)
    setBusy(false)
    if (updErr) {
      toast.error('Movimiento guardado, pero falló actualizar los totales.')
    }
    setMovimientos(nuevaLista)
    setCaja((c) => ({ ...c, total_ingresos: ing, total_egresos: egr }))
    setForm({ tipo: 'ingreso', categoria: 'venta', monto: '', descripcion: '' })
    toast.success('Movimiento registrado.')
  }

  async function cerrarCaja() {
    const contadoNum = Number(contado)
    if (!Number.isFinite(contadoNum) || contadoNum < 0) {
      toast.error('Ingresá el efectivo contado.')
      return
    }
    setCerrando(true)
    const diferencia = Math.round((contadoNum - saldoSistema) * 100) / 100
    const { error } = await sb
      .from('cajas_diarias')
      .update({
        estado: 'cerrada',
        saldo_final_contado: contadoNum,
        diferencia,
        closed_at: new Date().toISOString(),
      })
      .eq('id', caja.id)
    setCerrando(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setCaja((c) => ({
      ...c,
      estado: 'cerrada',
      saldo_final_contado: contadoNum,
      diferencia,
    }))
    toast.success('Caja cerrada.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Saldo inicial"
          value={caja.saldo_inicial}
          format="currency"
        />
        <KpiCard
          label="Ingresos"
          value={caja.total_ingresos}
          format="currency"
          variant="success"
        />
        <KpiCard
          label="Egresos"
          value={caja.total_egresos}
          format="currency"
          variant="warning"
        />
        <KpiCard
          label="Saldo sistema"
          value={saldoSistema}
          format="currency"
        />
      </section>

      {cerrada && (
        <section className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Efectivo contado"
            value={caja.saldo_final_contado ?? 0}
            format="currency"
          />
          <KpiCard
            label="Diferencia"
            value={caja.diferencia ?? 0}
            format="currency"
            variant={
              caja.diferencia && Number(caja.diferencia) !== 0
                ? 'danger'
                : 'success'
            }
          />
        </section>
      )}

      {/* Alta de movimiento */}
      {!cerrada && canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Registrar movimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={agregar} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tipo
                  </Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        tipo: v as TipoMovimientoCaja,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ingreso">Ingreso</SelectItem>
                      <SelectItem value="egreso">Egreso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Categoría
                  </Label>
                  <Select
                    value={form.categoria}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, categoria: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Monto
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.monto}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monto: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Descripción
                  </Label>
                  <Input
                    value={form.descripcion}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, descripcion: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="size-4" />
                  )}
                  Registrar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de movimientos */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Movimientos ({movimientos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {movimientos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sin movimientos registrados.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {movimientos.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    {m.tipo === 'ingreso' ? (
                      <ArrowUpCircle className="size-4 text-success" />
                    ) : (
                      <ArrowDownCircle className="size-4 text-warning" />
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {m.descripcion || m.categoria || m.tipo}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.categoria?.replace(/_/g, ' ')} ·{' '}
                        {new Date(m.created_at).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      m.tipo === 'ingreso' ? 'text-success' : 'text-warning',
                    )}
                  >
                    {m.tipo === 'ingreso' ? '+' : '−'} {fmt(m.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Cierre */}
      {!cerrada && canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cerrar caja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Efectivo contado al cierre
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={contado}
                  onChange={(e) => setContado(e.target.value)}
                  placeholder={`Saldo sistema: ${fmt(saldoSistema)}`}
                />
              </div>
              <Button
                onClick={cerrarCaja}
                disabled={cerrando}
                variant="outline"
              >
                {cerrando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                Cerrar caja
              </Button>
            </div>
            {contado && Number.isFinite(Number(contado)) && (
              <p className="text-xs text-muted-foreground">
                Diferencia contra el sistema:{' '}
                <span className="font-semibold tabular-nums">
                  {fmt(Number(contado) - saldoSistema)}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {cerrada && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">
            Caja cerrada
          </Badge>
          {caja.closed_at &&
            `el ${new Date(caja.closed_at).toLocaleString('es-AR')}`}
        </div>
      )}
    </div>
  )
}
