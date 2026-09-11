'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, Wallet } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { formatARS } from '@/lib/utils/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Opcion = { nombre: string; descuento_pct: number; dias: number }
type Fila = {
  nombre: string; descuento_pct: number; dias: number
  paga: number; ahorro_descuento: number; valor_del_plazo: number
  beneficio: number; valor_hoy: number; es_la_mejor: boolean
}

const INICIALES: Opcion[] = [
  { nombre: 'Contado con 8%', descuento_pct: 8, dias: 0 },
  { nombre: 'Contado con 5%', descuento_pct: 5, dias: 0 },
  { nombre: '30 días', descuento_pct: 0, dias: 30 },
  { nombre: '60 días', descuento_pct: 0, dias: 60 },
]

export function ComoPagarClient({
  tasaDefault, queDecide, cajas, proveedores, deuda,
}: {
  tasaDefault: number; queDecide: string | null
  cajas: any[]; proveedores: any[]; deuda: any[]
}) {
  const [monto, setMonto] = useState(5_000_000)
  const [tasa, setTasa] = useState(tasaDefault)
  const [opciones, setOpciones] = useState<Opcion[]>(INICIALES)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [provId, setProvId] = useState('')

  const caja = cajas.reduce((a, c) => a + Number(c.saldo_actual ?? 0), 0)
  const prov = proveedores.find((p) => p.id === provId)
  const deudaProv = prov ? deuda.find((d) => d.proveedor === prov.razon_social) : null

  async function calcular() {
    setCalculando(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.rpc('compras_comparar_pago', {
        p_monto: monto, p_opciones: opciones, p_tasa_mensual_pct: tasa,
      })
      setFilas(error ? null : (data as Fila[]))
    } finally { setCalculando(false) }
  }

  const mejor = filas?.find((f) => f.es_la_mejor)
  const contadoGana = mejor && mejor.dias === 0
  const alcanzaLaCaja = mejor ? caja >= mejor.paga : true

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Monto de la compra</Label>
              <Input type="number" value={monto} onChange={(e) => setMonto(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasa mensual %</Label>
              <Input type="number" step="0.1" value={tasa} onChange={(e) => setTasa(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Proveedor (opcional)</Label>
              <select value={provId} onChange={(e) => setProvId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">—</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
              </select>
            </div>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            <b>La tasa es una decisión, no un dato del sistema.</b> {queDecide ?? 'Cuánto rinde la plata en un mes.'}
            {tasa !== tasaDefault && <> · el valor guardado es {tasaDefault}%</>}
          </p>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Lo que ofrece el proveedor
            </Label>
            {opciones.map((o, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Input className="min-w-[140px] flex-1" value={o.nombre}
                  onChange={(e) => setOpciones((os) => os.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Descuento %</Label>
                  <Input type="number" className="w-24" value={o.descuento_pct}
                    onChange={(e) => setOpciones((os) => os.map((x, j) => j === i ? { ...x, descuento_pct: Number(e.target.value) || 0 } : x))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Días</Label>
                  <Input type="number" className="w-20" value={o.dias}
                    onChange={(e) => setOpciones((os) => os.map((x, j) => j === i ? { ...x, dias: Number(e.target.value) || 0 } : x))} />
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpciones((os) => os.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1"
              onClick={() => setOpciones((os) => [...os, { nombre: 'Otra', descuento_pct: 0, dias: 0 }])}>
              <Plus className="size-3.5" /> Agregar opción
            </Button>
          </div>

          <Button onClick={calcular} disabled={calculando || opciones.length === 0} className="w-full">
            {calculando ? <Loader2 className="size-4 animate-spin" /> : 'Comparar'}
          </Button>
        </div>

        {filas && (
          <div className="space-y-3">
            {mejor && (
              <Alert variant={contadoGana && !alcanzaLaCaja ? 'destructive' : undefined}>
                <AlertDescription className="text-sm leading-snug">
                  <b>Conviene «{mejor.nombre}»</b>: vale {formatARS(mejor.beneficio)} más que pagar
                  el precio de lista al contado.
                  {contadoGana && !alcanzaLaCaja && (
                    <> Pero <b>la caja no alcanza</b>: hay {formatARS(caja)} disponibles y esta opción
                    requiere pagar {formatARS(mejor.paga)} hoy. Un descuento por contado sólo sirve
                    si hay plata.</>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Opción</th>
                    <th className="px-3 py-2 text-right">Se paga</th>
                    <th className="px-3 py-2 text-right">Ahorro del descuento</th>
                    <th className="px-3 py-2 text-right">Vale el plazo</th>
                    <th className="px-3 py-2 text-right">Beneficio total</th>
                    <th className="px-3 py-2 text-right">Costo en pesos de hoy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map((f, i) => (
                    <tr key={i} className={f.es_la_mejor ? 'bg-emerald-500/5' : ''}>
                      <td className="px-3 py-2">
                        <span className="font-medium">{f.nombre}</span>
                        {f.es_la_mejor && <Badge className="ml-2 text-[10px]">la mejor</Badge>}
                        <div className="text-xs text-muted-foreground">
                          {f.descuento_pct > 0 && `${f.descuento_pct}% de descuento`}
                          {f.descuento_pct > 0 && f.dias > 0 && ' · '}
                          {f.dias > 0 && `a ${f.dias} días`}
                          {f.descuento_pct === 0 && f.dias === 0 && 'contado sin descuento'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatARS(Number(f.paga))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(f.ahorro_descuento) > 0 ? formatARS(Number(f.ahorro_descuento)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(f.valor_del_plazo) > 0 ? formatARS(Number(f.valor_del_plazo)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatARS(Number(f.beneficio))}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatARS(Number(f.valor_hoy))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              «Vale el plazo» es lo que rinde la plata mientras no se paga, a {tasa}% mensual. Con una
              tasa más alta el plazo gana; con una más baja, el descuento por contado.
            </p>
          </div>
        )}
      </div>

      {/* ── C.3 · EL DATO QUE FALTA PARA DECIDIR: LA CAJA ─────────────── */}
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Wallet className="size-3.5" /> Caja disponible
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatARS(caja)}</div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {cajas.length === 0
              ? 'No hay ninguna caja general cargada, así que no se puede decir si alcanza para pagar contado.'
              : `Suma de ${cajas.length} cajas. Pagar contado con descuento sólo sirve si hay plata.`}
          </p>
        </div>

        {prov && (
          <div className="space-y-1.5 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="font-medium">{prov.razon_social}</div>
            <Dato t="Plazo habitual" v={prov.plazo_pago_dias ? `${prov.plazo_pago_dias} días` : 'sin definir'} />
            <Dato t="Forma habitual" v={prov.forma_pago_default ?? 'sin definir'} />
            <Dato t="Pronto pago" v={prov.descuento_pronto_pago_pct ? `${prov.descuento_pronto_pago_pct}%` : 'sin definir'} />
            <Dato t="Trabaja por resumen" v={prov.trabaja_por_resumen ? 'sí' : 'no'} />
            <Dato t="Se le debe hoy" v={deudaProv ? formatARS(Number(deudaProv.saldo)) : 'sin deuda abierta'} />
          </div>
        )}

        <div className="rounded-xl border border-border p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Comprometido con otros proveedores
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatARS(deuda.reduce((a, d) => a + Number(d.saldo ?? 0), 0))}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Saldo abierto con {deuda.length} proveedores. Es lo que ya está prometido antes de
            decidir esta compra.
          </p>
        </div>
      </div>
    </div>
  )
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{t}</span>
      <span>{v}</span>
    </div>
  )
}
