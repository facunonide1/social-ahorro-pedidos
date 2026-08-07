'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Camera, Download, FileText, TrendingDown, TrendingUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { FichaCostos } from '@/lib/documentos/costos'

/** La lista es lo que dijeron que costaba; la factura es lo que costó. */
const ORIGEN_LABEL: Record<string, string> = {
  factura: 'factura',
  remito: 'remito',
  lista_precios: 'lista',
  orden_compra: 'orden',
  manual: 'manual',
}

export function FichaCostosClient({ ficha, soloFacturas }: { ficha: FichaCostos; soloFacturas: boolean }) {
  const router = useRouter()
  const search = useSearchParams()

  function toggleFuente() {
    const p = new URLSearchParams(search.toString())
    if (soloFacturas) p.delete('solo')
    else p.set('solo', 'facturas')
    router.replace(`?${p.toString()}`)
  }

  const netoUltimo = ficha.ultimo ? (ficha.ultimo.precioNeto ?? ficha.ultimo.precioUnitario) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={soloFacturas ? 'default' : 'outline'} onClick={toggleFuente}>
          <FileText className="size-4" /> {soloFacturas ? 'Solo facturas' : 'Todo el histórico'}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {soloFacturas
            ? 'Mostrando lo que realmente se pagó.'
            : 'Incluye listas de precios: es lo que dijeron que costaba, no lo que costó.'}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={!ficha.eventos.length}
          onClick={() => exportExcel(`costos-${ficha.item.sku}`, ficha.eventos.map((e) => ({
            SKU: ficha.item.sku,
            Producto: ficha.item.nombre,
            Fecha: e.fecha,
            Proveedor: e.proveedor,
            'Costo neto': e.precioNeto ?? e.precioUnitario,
            Cantidad: e.cantidad ?? '',
            Origen: ORIGEN_LABEL[e.origen] ?? e.origen,
          })))}
        >
          <Download className="size-4" /> Excel
        </Button>
      </div>

      {!ficha.eventos.length ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">
          Todavía no hay compras registradas de este producto.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo="Último costo neto">
              <div className="text-2xl font-semibold tabular-nums">{netoUltimo != null ? formatARS(netoUltimo) : '—'}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {ficha.ultimo?.fecha} · {ficha.ultimo?.proveedor}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {ORIGEN_LABEL[ficha.ultimo?.origen ?? ''] ?? ficha.ultimo?.origen}
              </div>
            </Tarjeta>

            <Tarjeta titulo="Contra la compra anterior">
              {ficha.variacion ? (
                <>
                  <div className={cn('flex items-center gap-1 text-2xl font-semibold tabular-nums',
                    ficha.variacion.pct > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {ficha.variacion.pct > 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                    {ficha.variacion.pct > 0 ? '+' : ''}{ficha.variacion.pct}%
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {ficha.variacion.pesos > 0 ? '+' : ''}{formatARS(ficha.variacion.pesos)} por unidad
                  </div>
                </>
              ) : <div className="text-sm text-muted-foreground">Es la primera compra registrada.</div>}
            </Tarjeta>

            <Tarjeta titulo="Variación acumulada">
              <dl className="space-y-1 text-sm">
                {ficha.acumuladas.map((a) => (
                  <div key={a.dias} className="flex justify-between">
                    <dt className="text-muted-foreground">{a.dias} días</dt>
                    <dd className={cn('tabular-nums', a.pct != null && a.pct > 0 && 'text-rose-600 dark:text-rose-400')}>
                      {a.pct != null ? `${a.pct > 0 ? '+' : ''}${a.pct}%` : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </Tarjeta>

            <Tarjeta titulo={`Comprado en ${ficha.volumen.dias} días`}>
              <div className="text-2xl font-semibold tabular-nums">{ficha.volumen.unidades.toLocaleString('es-AR')}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">unidades</div>
            </Tarjeta>
          </div>

          <Grafico eventos={ficha.eventos} />

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Quién lo vendió
            </div>
            <table className="w-full text-sm">
              <tbody>
                {ficha.porProveedor.map((p, i) => (
                  <tr key={p.proveedorId ?? i} className={cn('border-b border-border/60 last:border-0', i === 0 && 'bg-emerald-500/5')}>
                    <td className="px-4 py-2 font-medium">{p.proveedor}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{p.ultimoNeto != null ? formatARS(p.ultimoNeto) : '—'}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-muted-foreground">
                      {p.fecha}
                      {!p.fresco && <span className="ml-1 text-amber-600 dark:text-amber-400">· hace {p.diasDesde} días</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-[11px] text-muted-foreground">{p.compras} compra{p.compras === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Serie histórica ({ficha.eventos.length})
            </div>
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-1.5 font-normal">Fecha</th>
                    <th className="px-3 py-1.5 font-normal">Proveedor</th>
                    <th className="px-3 py-1.5 text-right font-normal">Neto</th>
                    <th className="px-3 py-1.5 text-right font-normal">Cant.</th>
                    <th className="px-3 py-1.5 font-normal">Origen</th>
                    <th className="px-4 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {ficha.eventos.map((e) => (
                    <tr key={e.id} className="border-t border-border/60">
                      <td className="px-4 py-1.5 tabular-nums">{e.fecha}</td>
                      <td className="px-3 py-1.5">{e.proveedor}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(e.precioNeto ?? e.precioUnitario)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{e.cantidad ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px]',
                          e.origen === 'lista_precios' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                        )}>
                          {ORIGEN_LABEL[e.origen] ?? e.origen}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {e.documentoId && (
                          <Link href={`/admin/finanzas/documentos/${e.documentoId}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            <Camera className="size-3" /> ver
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Serie en SVG, sin librería de gráficos.
 *
 * Lo único que hace falta ver es la forma de la curva y dónde saltó. Un
 * dependency de 200 KB para eso no se justifica.
 */
function Grafico({ eventos }: { eventos: FichaCostos['eventos'] }) {
  const pts = [...eventos].reverse().map((e) => ({ x: e.fecha, y: e.precioNeto ?? e.precioUnitario }))
  if (pts.length < 2) return null

  const W = 720, H = 160, P = 28
  const ys = pts.map((p) => p.y)
  const min = Math.min(...ys), max = Math.max(...ys)
  const span = max - min || max || 1
  const px = (i: number) => P + (i * (W - P * 2)) / (pts.length - 1)
  const py = (v: number) => H - P - ((v - min) / span) * (H - P * 2)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')

  return (
    <div className="overflow-x-auto rounded-lg border border-border p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="Evolución del costo neto">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} className="stroke-border" strokeWidth="1" />
        <path d={d} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={px(i)} cy={py(p.y)} r="3" className="fill-primary">
            <title>{`${p.x}: ${formatARS(p.y)}`}</title>
          </circle>
        ))}
        <text x={P} y={14} className="fill-muted-foreground text-[10px]">{formatARS(max)}</text>
        <text x={P} y={H - 8} className="fill-muted-foreground text-[10px]">{formatARS(min)}</text>
      </svg>
    </div>
  )
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{titulo}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}
