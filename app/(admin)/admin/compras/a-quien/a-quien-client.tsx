'use client'

import { useState } from 'react'
import { Download, Search, HelpCircle } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MAX = 250

export function AQuienClient({
  poder, provee, lineasDeCosto, productosMultiProveedor,
}: { poder: any[]; provee: any[]; lineasDeCosto: number; productosMultiProveedor: number }) {
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const filtrados = t
    ? provee.filter((p) => p.nombre?.toLowerCase().includes(t) || p.sku?.includes(t) || p.proveedor?.toLowerCase().includes(t))
    : provee

  // Agrupado por producto para que se lea «este producto se compra a tres».
  const porProducto = new Map<string, any[]>()
  for (const f of filtrados) {
    const a = porProducto.get(f.producto_id) ?? []
    a.push(f); porProducto.set(f.producto_id, a)
  }
  const grupos = [...porProducto.entries()].slice(0, MAX)

  return (
    <div className="space-y-6">
      {/* ── B.2 · LO QUE NO SE PUEDE SABER, DICHO ─────────────────────── */}
      <Alert>
        <HelpCircle className="size-4" />
        <AlertDescription className="space-y-1.5 text-xs leading-snug">
          <p>
            <b>Sé a quién le comprás, no a qué precio.</b> El archivo que dice qué droguería provee
            cada producto trae unidades, no importes. No hay precio por proveedor en ningún lado, así
            que <b>esta pantalla no puede decir a quién conviene comprarle</b> — y estimarlo sería
            inventarlo.
          </p>
          <p>
            {lineasDeCosto === 0 ? (
              <>Se arma solo: desde v0.93 cada factura fotografiada carga el costo por SKU y por
              proveedor. Con dos o tres meses de facturas, la comparación aparece sin tocar código.
              Hoy el histórico tiene <b>0 líneas</b>.</>
            ) : (
              <>El histórico ya tiene <b>{lineasDeCosto.toLocaleString('es-AR')}</b> líneas de costo.
              La comparación por precio está disponible en <a className="underline" href="/admin/compras/costos">Comparador de costos</a>.</>
            )}
          </p>
        </AlertDescription>
      </Alert>

      {/* ── B.5 · CUÁNTO LE COMPRÁS: EL PODER PARA NEGOCIAR ───────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Cuánto le comprás a cada uno · últimos 12 meses
          </h2>
          <Button variant="outline" size="sm" className="gap-1"
            onClick={() => exportExcel('poder-de-negociacion', poder.map((p) => ({
              Proveedor: p.proveedor,
              Comprobantes: Number(p.comprobantes),
              'Comprado 12m': Number(p.comprado ?? 0),
              'Productos que provee': Number(p.productos_que_provee),
              'Saldo abierto': Number(p.saldo_abierto ?? 0),
              'Día de cobro': p.dia_cobro != null ? DIAS[p.dia_cobro] : '',
              'Plazo (días)': p.plazo_pago_dias ?? '',
              'Forma habitual': p.forma_pago_default ?? '',
              'Por resumen': p.trabaja_por_resumen ? 'Sí' : '',
            })))}>
            <Download className="size-3.5" /> Exportar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Es lo que hay que tener en la mano cuando se pelea el precio. Sale de los comprobantes de
          2026 que se importaron, no de una estimación.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2 text-right">Comprado 12m</th>
                <th className="px-3 py-2 text-right">Comprobantes</th>
                <th className="px-3 py-2 text-right">Productos</th>
                <th className="px-3 py-2 text-right">Se le debe</th>
                <th className="px-3 py-2">Acuerdo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {poder.sort((a, b) => Number(b.comprado ?? 0) - Number(a.comprado ?? 0)).map((p) => (
                <tr key={p.proveedor_id}>
                  <td className="px-3 py-2 font-medium">{p.proveedor}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {Number(p.comprobantes) === 0
                      ? <span className="text-xs font-normal text-muted-foreground">sin comprobantes</span>
                      : formatARS(Number(p.comprado ?? 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(p.comprobantes).toLocaleString('es-AR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(p.productos_que_provee).toLocaleString('es-AR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(p.saldo_abierto ?? 0) > 0 ? formatARS(Number(p.saldo_abierto)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {[p.dia_cobro != null ? `cobra ${DIAS[p.dia_cobro]}` : null,
                      p.plazo_pago_dias ? `${p.plazo_pago_dias} días` : null,
                      p.forma_pago_default,
                      p.trabaja_por_resumen ? 'por resumen' : null].filter(Boolean).join(' · ') || 'sin definir'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── B.1 · A QUIÉN SE LE COMPRA CADA PRODUCTO ──────────────────── */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Quién provee cada producto
        </h2>
        <p className="text-xs text-muted-foreground">
          {productosMultiProveedor.toLocaleString('es-AR')} productos se le compran a más de una
          droguería. Ahí puede haber diferencia de precio — y hoy no se puede saber cuál conviene.
        </p>
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Producto, SKU o droguería…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          {porProducto.size.toLocaleString('es-AR')} productos
          {porProducto.size > MAX && <> · se muestran los primeros {MAX}</>}
        </p>
        <div className="space-y-2">
          {grupos.map(([id, filas]) => (
            <div key={id} className="rounded-lg border border-border p-3">
              <div className="text-sm font-medium">{filas[0].nombre}</div>
              <div className="text-xs text-muted-foreground">SKU {filas[0].sku}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {filas.map((f) => (
                  <Badge key={f.proveedor_id} variant="outline" className="text-[11px] font-normal">
                    {f.proveedor} · {Number(f.unidades).toLocaleString('es-AR')} u
                    {filas.length > 1 && ` (${f.pct}%)`}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
