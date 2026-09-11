'use client'

import { useState } from 'react'
import { Download, ArrowLeftRight, AlertTriangle, HelpCircle } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const URGENCIA = {
  ya: { t: 'YA', d: 'Agotado o menos de una semana', tono: 'text-destructive' },
  esta_semana: { t: 'Esta semana', d: 'Menos de dos semanas', tono: 'text-amber-600 dark:text-amber-400' },
  esta_quincena: { t: 'Esta quincena', d: 'Menos de un mes', tono: 'text-muted-foreground' },
} as const

const SALUD = {
  vende_y_tiene: 'Vende y tiene stock',
  vende_y_no_tiene: 'Vende y NO tiene',
  tiene_y_no_vende: 'Tiene y no vende',
  ni_vende_ni_tiene: 'Ni vende ni tiene',
} as const

const MAX = 200

export function PlanClient({
  global, urgencias, salud, parametros, transferir, sinCalcular, aComprar, noComprar,
}: {
  global: any; urgencias: any[]; salud: any[]; parametros: any[]
  transferir: { se_puede: boolean; por_que: string } | null
  sinCalcular: number; aComprar: any[]; noComprar: any[]
}) {
  const [lista, setLista] = useState<'comprar' | 'sobra' | 'dormido' | 'pedido'>('comprar')

  const objetivo = Number(parametros.find((p) => p.clave === 'cobertura_objetivo_meses')?.valor ?? 1)
  const sobra = noComprar.filter((r) => r.sobra)
  const dormido = noComprar.filter((r) => r.sin_venta_11m)
  const pedido = noComprar.filter((r) => r.a_pedido)

  const visible = lista === 'comprar' ? aComprar : lista === 'sobra' ? sobra : lista === 'dormido' ? dormido : pedido
  const totalComprar = aComprar.reduce((a, r) => a + Number(r.costo_sugerido ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* ── EL ENCABEZADO EN ESCALA, ANTES DE LA LISTA ────────────────── */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Escala t="Stock al costo" v={formatARS(Number(global?.stock_al_costo ?? 0))} />
          <Escala t="Consumo mensual" v={formatARS(Number(global?.consumo_mensual ?? 0))} />
          <Escala t="Cobertura" v={`${Number(global?.cobertura_meses ?? 0).toFixed(2)} meses`} />
        </div>
        <p className="mt-3 text-sm leading-snug">
          <b>El problema no es que falte mercadería: está mal repartida.</b> Hay{' '}
          {formatARS(Number(global?.plata_sobrestock ?? 0))} en {Number(global?.items_sobrestock ?? 0).toLocaleString('es-AR')} productos
          con más de tres meses de cobertura, y al mismo tiempo{' '}
          {aComprar.length.toLocaleString('es-AR')} productos entran en quiebre.
        </p>
      </section>

      {/* ── A.3 · PRIMERO MIRAR SI HAY QUE TRANSFERIR ─────────────────── */}
      <Alert variant={transferir?.se_puede ? 'default' : undefined}>
        <ArrowLeftRight className="size-4" />
        <AlertDescription className="text-xs leading-snug">
          {transferir?.se_puede ? (
            <>La comparación entre sucursales está activa: antes de comprar se mira si otra sucursal lo tiene parado.</>
          ) : (
            <>
              <b>Antes de comprar habría que mirar si otra sucursal lo tiene parado</b> —transferir es
              gratis, comprar cuesta plata—. El cálculo está escrito y <b>no puede correr</b>:{' '}
              {transferir?.por_que ?? 'falta el stock por sucursal'}. Se prende solo el día que
              llegue ese archivo, sin tocar código. Mientras tanto, todo lo de esta pantalla es
              sobre el <b>consolidado de las cuatro</b>.
            </>
          )}
        </AlertDescription>
      </Alert>

      {/* ── LAS TRES URGENCIAS ────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Qué comprar · {formatARS(totalComprar)} para llevar la cobertura a {objetivo} {objetivo === 1 ? 'mes' : 'meses'}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['ya', 'esta_semana', 'esta_quincena'] as const).map((k) => {
            const u = urgencias.find((x) => x.urgencia === k)
            return (
              <div key={k} className="rounded-lg border border-border p-3">
                <div className={`text-xs font-bold uppercase tracking-wide ${URGENCIA[k].tono}`}>{URGENCIA[k].t}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{Number(u?.items ?? 0).toLocaleString('es-AR')}</div>
                <div className="text-xs text-muted-foreground">{formatARS(Number(u?.monto ?? 0))}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{URGENCIA[k].d}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── D.6 · LA SALUD DEL STOCK ──────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          La salud del stock
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(['vende_y_tiene', 'vende_y_no_tiene', 'tiene_y_no_vende', 'ni_vende_ni_tiene'] as const).map((k) => {
            const s = salud.find((x) => x.estado === k)
            return (
              <div key={k} className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{SALUD[k]}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{Number(s?.productos ?? 0).toLocaleString('es-AR')}</div>
                <div className="text-xs text-muted-foreground">{formatARS(Number(s?.plata ?? 0))}</div>
                {Number(s?.con_stock_negativo ?? 0) > 0 && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {s.con_stock_negativo} con stock negativo en SIFACO
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          «Ni vende ni tiene» es el 76% del catálogo y no cuesta plata: son fichas, no stock.
        </p>
      </section>

      {/* ── A.5 · LOS QUE NO SE PUEDEN CALCULAR ───────────────────────── */}
      {sinCalcular > 0 && (
        <Alert>
          <HelpCircle className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>{sinCalcular.toLocaleString('es-AR')} productos no entran en esta cuenta</b> porque les
            falta el costo o la historia de ventas. No entran con cero: un cero acá diría que no hay
            que comprarlos, y lo que pasa es que no se puede saber.{' '}
            <a className="underline" href="/admin/compras/plan/sin-calcular">Verlos con el motivo</a>.
          </AlertDescription>
        </Alert>
      )}

      {/* ── LAS LISTAS ────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['comprar', `Comprar (${aComprar.length})`],
            ['sobra', `Sobra (${sobra.length})`],
            ['dormido', `Sin venta en 11 meses (${dormido.length})`],
            ['pedido', `De encargo (${pedido.length})`],
          ] as const).map(([k, t]) => (
            <Button key={k} size="sm" variant={lista === k ? 'default' : 'outline'} onClick={() => setLista(k)}>
              {t}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="ml-auto gap-1"
            onClick={() => exportExcel(`plan-${lista}`, visible.map((r) => ({
              SKU: r.sku, 'Código de barras': r.codigo_barras ?? '', Producto: r.nombre,
              Laboratorio: r.laboratorio ?? '', Stock: Number(r.stock),
              'Consumo mensual': Number(r.consumo_mes), 'Cobertura (meses)': r.cobertura_meses ?? '',
              Urgencia: r.urgencia ?? '', 'Sugerido a pedir': Number(r.sugerido),
              'Costo del pedido': Number(r.costo_sugerido), 'Plata parada': Number(r.plata_parada),
              'Meses con venta': Number(r.meses_con_venta),
            })))}>
            <Download className="size-3.5" /> Exportar los {visible.length}
          </Button>
        </div>

        {lista !== 'comprar' && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs leading-snug">
              {lista === 'sobra' && <><b>Más de tres meses de cobertura.</b> Salidas: ofertar, devolver al proveedor, transferir a otra sucursal o dejar de reponer.</>}
              {lista === 'dormido' && <><b>Tiene stock y no vendió en once meses.</b> Salidas: ofertar con descuento fuerte, devolver dentro de la ventana del proveedor, o darlo de baja.</>}
              {lista === 'pedido' && <><b>Vendió en menos de cinco de los once meses.</b> No va a góndola: se trae a pedido cuando alguien lo pide.</>}
              {' '}NORA propone; decide una persona.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-muted-foreground">
          {visible.length.toLocaleString('es-AR')} productos
          {visible.length > MAX && <> · se muestran los primeros {MAX}; el .xlsx trae todos</>}
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Vende/mes</th>
                <th className="px-3 py-2 text-right">Cobertura</th>
                {lista === 'comprar'
                  ? <><th className="px-3 py-2">Urgencia</th><th className="px-3 py-2 text-right">Pedir</th><th className="px-3 py-2 text-right">Costo</th></>
                  : <th className="px-3 py-2 text-right">Plata parada</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.slice(0, MAX).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      SKU {r.sku}{r.laboratorio && ` · ${r.laboratorio}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.stock).toLocaleString('es-AR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.consumo_mes).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.cobertura_meses == null
                      ? <span className="text-xs text-muted-foreground">sin venta</span>
                      : `${Number(r.cobertura_meses).toFixed(1)} m`}
                  </td>
                  {lista === 'comprar' ? (
                    <>
                      <td className="px-3 py-2">
                        <Badge variant={r.urgencia === 'ya' ? 'destructive' : 'outline'} className="text-[10px]">
                          {URGENCIA[r.urgencia as keyof typeof URGENCIA]?.t ?? r.urgencia}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{Number(r.sugerido).toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatARS(Number(r.costo_sugerido))}</td>
                    </>
                  ) : (
                    <td className="px-3 py-2 text-right tabular-nums">{formatARS(Number(r.plata_parada))}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Escala({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{v}</div>
    </div>
  )
}
