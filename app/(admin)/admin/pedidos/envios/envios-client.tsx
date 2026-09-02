'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { crearZona, guardarConfigEnvios, guardarZona } from './actions'

type Sucursal = { id: string; nombre: string; codigo: string | null; es_ecommerce: boolean }
type Config = {
  sucursal_id: string; envio_gratis_desde: number | null; monto_minimo: number | null
  hora_corte: string | null; costo_por_km: number | null; costo_por_hora: number | null
}
type Zona = {
  zona_id: string; zona: string; sucursal_id: string | null; sucursal: string | null
  tarifa: number | null; km_estimados: number | null; minutos_estimados: number | null
  costo_estimado: number | null; por_que_no_se_sabe: string | null
  pedidos: number | null; cobrado: number | null
}

export function EnviosClient({
  zonas, sucursales, config, sinTarifa,
}: { zonas: Zona[]; sucursales: Sucursal[]; config: Config[]; sinTarifa: number }) {
  const [pendiente, empezar] = useTransition()
  const porSucursal = new Map(config.map((c) => [c.sucursal_id, c]))

  function enviar(fn: (fd: FormData) => Promise<{ ok?: boolean; error?: string }>, fd: FormData) {
    empezar(async () => {
      const r = await fn(fd)
      if (r?.error) toast.error(r.error)
      else toast.success('Guardado')
    })
  }

  return (
    <div className="space-y-6">
      {/* ── D.2 · LAS REGLAS DE CADA SUCURSAL ────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Reglas de envío por sucursal
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {sucursales.map((s) => {
            const c = porSucursal.get(s.id)
            const sinCosto = !c?.costo_por_km || !c?.costo_por_hora
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {s.nombre}{s.codigo ? ` · ${s.codigo}` : ''}
                    {s.es_ecommerce && <span className="ml-2 text-xs font-normal text-muted-foreground">ecommerce</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={(fd) => enviar(guardarConfigEnvios, fd)} className="space-y-2">
                    <input type="hidden" name="sucursal_id" value={s.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <Campo n="envio_gratis_desde" l="Envío gratis desde" v={c?.envio_gratis_desde} />
                      <Campo n="monto_minimo" l="Monto mínimo" v={c?.monto_minimo} />
                      <Campo n="hora_corte" l="Hora de corte" v={c?.hora_corte ?? ''} tipo="time" />
                      <div />
                      <Campo n="costo_por_km" l="Costo por km" v={c?.costo_por_km} />
                      <Campo n="costo_por_hora" l="Costo por hora" v={c?.costo_por_hora} />
                    </div>
                    {sinCosto && (
                      <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        Sin el costo de la moto no se puede saber si una zona pierde plata. Vacío no
                        es cero: es que nadie lo cargó.
                      </p>
                    )}
                    <Button type="submit" size="sm" variant="outline" disabled={pendiente}>Guardar</Button>
                  </form>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ── D.2 y D.3 · LAS ZONAS ────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Zonas · cobrado contra lo que cuesta
        </h2>
        {sinTarifa > 0 && (
          <p className="text-xs text-muted-foreground">
            {sinTarifa} zonas sin tarifa definida. Sin tarifa no se puede cobrar el envío ni comparar
            contra el costo.
          </p>
        )}
        {/* Sin zonas cargadas la pantalla no sirve para nada: lo primero es poder
            crear una, y con la sucursal desde el principio. */}
        <form action={(fd) => enviar(crearZona, fd)}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border p-3">
          <div className="min-w-[160px] flex-1 space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nueva zona</Label>
            <Input name="nombre" placeholder="Zona 1" required />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal *</Label>
            <select name="sucursal_id" required
              className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Elegir…</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Barrios (separados por coma)</Label>
            <Input name="barrios" placeholder="Ituzaingó centro, Villa Udaondo" />
          </div>
          <Campo n="tarifa" l="Tarifa" v={null} ancho="w-24" />
          <Campo n="km_estimados" l="Km est." v={null} ancho="w-20" />
          <Campo n="minutos_estimados" l="Min. est." v={null} ancho="w-20" />
          <Button type="submit" size="sm" disabled={pendiente}>Crear zona</Button>
        </form>

        {zonas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay ninguna zona de reparto cargada. Sin zonas no se puede cobrar un envío
            por distancia ni armar un viaje.
          </p>
        ) : (
          <div className="space-y-2">
            {zonas.map((z) => {
              const pierde = z.costo_estimado !== null && Number(z.tarifa ?? 0) < z.costo_estimado
              return (
                <form key={z.zona_id} action={(fd) => enviar(guardarZona, fd)}
                  className={`rounded-lg border p-3 ${pierde ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
                  <input type="hidden" name="id" value={z.zona_id} />
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[140px] flex-1">
                      <div className="text-sm font-medium">{z.zona}</div>
                      <div className="text-xs text-muted-foreground">
                        {z.pedidos ?? 0} entregados · cobrado {formatARS(Number(z.cobrado ?? 0))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
                      <select name="sucursal_id" defaultValue={z.sucursal_id ?? ''}
                        className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm">
                        <option value="">Sin asignar</option>
                        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>
                    <Campo n="tarifa" l="Tarifa" v={z.tarifa} ancho="w-24" />
                    <Campo n="km_estimados" l="Km est." v={z.km_estimados} ancho="w-20" />
                    <Campo n="minutos_estimados" l="Min. est." v={z.minutos_estimados} ancho="w-20" />
                    <div className="min-w-[150px]">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Costo estimado</div>
                      {z.costo_estimado === null ? (
                        <div className="text-xs leading-snug text-muted-foreground">
                          Sin datos todavía: {z.por_que_no_se_sabe}.
                        </div>
                      ) : (
                        <div className={`text-sm font-semibold tabular-nums ${pierde ? 'text-destructive' : ''}`}>
                          {formatARS(z.costo_estimado)}
                          {pierde && <span className="ml-1 text-xs font-normal">pierde por viaje</span>}
                        </div>
                      )}
                    </div>
                    <Button type="submit" size="sm" variant="outline" disabled={pendiente}>Guardar</Button>
                  </div>
                </form>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Campo({ n, l, v, tipo = 'number', ancho = '' }: {
  n: string; l: string; v: number | string | null | undefined; tipo?: string; ancho?: string
}) {
  const [valor, setValor] = useState(v == null ? '' : String(v))
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</Label>
      <Input name={n} type={tipo} value={valor} onChange={(e) => setValor(e.target.value)}
        placeholder="sin definir" className={ancho} />
    </div>
  )
}
