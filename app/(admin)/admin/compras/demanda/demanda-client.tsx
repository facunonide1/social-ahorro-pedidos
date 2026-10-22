'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ShoppingCart, PackagePlus, PackageX, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type ExisteRow = {
  producto_id: string; nombre: string; sku: string | null
  veces: number; unidades: number; stock: number; sucursales: string[]
  /** D.4 · la venta perdida MEDIDA: lo pedido por el precio de ese momento. */
  perdida_medida: number
  /** La que de verdad se perdió: si se llevaron otra cosa, cambió de producto. */
  perdida_de_los_que_se_fueron: number
  se_fueron: number; se_llevaron_otra: number; sin_desenlace: number
  /** Cuántos de esos pedidos no tenían precio: ahí la plata está subestimada. */
  sin_precio: number
}
export type LibreRow = {
  texto: string; veces: number; sucursales: string[]
  como_lo_escribieron: string[]; se_fueron: number
}
/** D.6 · el estimado y el medido, uno al lado del otro. Nunca sumados. */
export type DosNumeros = {
  producto_id: string; sku: string | null; nombre: string; sucursal: string
  estimada: number | null; medida: number; medida_de_los_que_se_fueron: number
  veces: number; que_dicen: string; estimacion_sin_costo: boolean
}

export function DemandaClient({ existe, libre, dias, dosNumeros, truncado }: {
  existe: ExisteRow[]; libre: LibreRow[]; dias: number
  dosNumeros: DosNumeros[]; truncado: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function post(body: any, key: string, ok: string) {
    setBusy(key)
    try {
      const r = await fetch('/api/compras/demanda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(ok, j.codigo ? { description: `Orden ${j.codigo} · ${j.proveedor ?? ''}` } : undefined)
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  function exportar() {
    const filas = [
      ...existe.map((r) => ({
        Lista: 'Existe pero faltó', Item: r.nombre, SKU: r.sku, Veces: r.veces,
        Unidades: r.unidades, 'Stock actual': r.stock, Sucursales: r.sucursales.join(', '),
        'Venta perdida medida': r.perdida_medida,
        'De los que se fueron': r.perdida_de_los_que_se_fueron,
        'Se fueron': r.se_fueron, 'Se llevaron otra': r.se_llevaron_otra,
        'Sin precio cargado': r.sin_precio,
      })),
      ...libre.map((r) => ({
        Lista: 'No lo trabajamos', Item: r.texto, SKU: '', Veces: r.veces,
        Unidades: '', 'Stock actual': '', Sucursales: r.sucursales.join(', '),
        'Venta perdida medida': '', 'De los que se fueron': '',
        'Se fueron': r.se_fueron, 'Se llevaron otra': '', 'Sin precio cargado': '',
        'Como lo escribieron': r.como_lo_escribieron.join(' / '),
      })),
    ]
    exportExcel('radar-demanda', filas)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => router.push(`/admin/compras/demanda?dias=${d}`)} className={cn('rounded px-3 py-1 text-xs font-medium', dias === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{d}d</button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportar} disabled={!existe.length && !libre.length}><Download className="size-4" /> Excel</Button>
      </div>

      {truncado && (
        <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs leading-snug">
          La lista está cortada por el tope de seguridad del paginado: estos totales son de lo que
          se trajo, no de todo lo que hay.
        </p>
      )}

      {/* ── D.6 · EL NUMERO ESTIMADO Y EL MEDIDO, AL LADO ──────────────── */}
      {dosNumeros.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Lo que se estima y lo que se midió
            </h2>
            <p className="text-xs leading-snug text-muted-foreground">
              NORA calculaba la venta perdida con una fórmula que supone que la venta se pierde
              entera. Ahora hay un número medido al lado: lo que alguien registró que pidieron y no
              había, por el precio de ese momento. <b>Los dos no se suman</b> — son dos cosas
              distintas medidas de dos formas.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Estimado por mes</th>
                  <th className="px-3 py-2 text-right">Medido</th>
                  <th className="px-3 py-2 text-right">Se fueron</th>
                  <th className="px-3 py-2">Qué dicen los dos</th>
                </tr>
              </thead>
              <tbody>
                {dosNumeros.map((d, i) => (
                  <tr key={`${d.producto_id}-${i}`} className="border-t border-border align-top">
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{d.nombre}</span>{' '}
                      <span className="text-[11px] text-muted-foreground">{d.sucursal}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {d.estimada != null ? formatARS(d.estimada) : (
                        <span className="text-xs text-muted-foreground">
                          {d.estimacion_sin_costo ? 'sin costo: no se puede estimar' : 'no está en quiebre'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {formatARS(d.medida)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatARS(d.medida_de_los_que_se_fueron)}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] leading-snug text-muted-foreground">
                      {d.que_dicen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {existe.length === 0 && libre.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <PackageX className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Nada en el Radar todavía. Cada "Me pidieron y no había" cae acá.</div>
        </div>
      )}

      {existe.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><PackageCheck className="size-4 text-amber-500" /> Existe pero faltó <Badge variant="outline" className="font-normal">{existe.length}</Badge></h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Veces</th><th className="px-3 py-2 text-right">Se fue</th><th className="px-3 py-2 text-right">Stock hoy</th><th className="px-3 py-2">Sucursales</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {existe.map((r) => (
                  <tr key={r.producto_id} className="border-t border-border">
                    <td className="px-3 py-1.5"><span className="font-medium">{r.nombre}</span> <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span></td>
                    <td className="px-3 py-1.5 text-right"><Badge variant={r.veces >= 3 ? 'destructive' : 'secondary'} className="font-normal tabular-nums">{r.veces}</Badge></td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="font-medium tabular-nums">{formatARS(r.perdida_de_los_que_se_fueron)}</div>
                      {r.se_llevaron_otra > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.se_llevaron_otra} se llevaron otra cosa
                        </div>
                      )}
                      {r.sin_precio > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.sin_precio} sin precio: está subestimado
                        </div>
                      )}
                      {r.sin_desenlace > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.sin_desenlace} sin anotar qué pasó
                        </div>
                      )}
                    </td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', r.stock === 0 && 'text-rose-600 dark:text-rose-400')}>{r.stock}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sucursales.join(', ') || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.producto_id} onClick={() => post({ accion: 'agregar_orden', producto_id: r.producto_id, nombre: r.nombre }, r.producto_id, 'Agregado a la orden borrador.')}><ShoppingCart className="size-3.5" /> A orden</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {libre.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><PackageX className="size-4 text-rose-500" /> No lo trabajamos <Badge variant="outline" className="font-normal">{libre.length}</Badge></h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Lo que piden</th><th className="px-3 py-2 text-right">Veces</th><th className="px-3 py-2">Sucursales</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {libre.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{r.texto}</td>
                    <td className="px-3 py-1.5 text-right"><Badge variant={r.veces >= 3 ? 'destructive' : 'secondary'} className="font-normal tabular-nums">{r.veces}</Badge></td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sucursales.join(', ') || '—'}</td>
                    <td className="px-3 py-1.5 text-right"><Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.texto} onClick={() => post({ accion: 'alta_producto', nombre: r.texto }, r.texto, `"${r.texto}" dado de alta al catálogo.`)}><PackagePlus className="size-3.5" /> Dar de alta</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
