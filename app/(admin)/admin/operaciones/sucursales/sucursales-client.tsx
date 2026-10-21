'use client'

import { useState } from 'react'
import { ArrowLeftRight, Download, AlertTriangle } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import type { EdadDelDato } from '@/lib/sifaco/edad-del-dato'
import { FechaDelDatoLinea } from '@/components/sifaco/fecha-del-dato'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const MAX = 150

export function SucursalesClient({ comparar, malRepartido, deBaja, edad }: {
  comparar: any[]
  malRepartido: any[]
  deBaja: any[]
  edad: EdadDelDato | null
}) {
  const [lista, setLista] = useState<'repartido' | 'baja'>('repartido')

  const plataQuieta = malRepartido.reduce((a, r) => a + Number(r.plata_quieta ?? 0), 0)
  const deBajaConStock = deBaja.filter((d) => d.hay_que_decidir)
  const plataDeBaja = deBajaConStock.reduce((a, d) => a + Number(d.plata ?? 0), 0)

  // La que más stock de menos tiene: es la que primero hay que mirar.
  const corta = comparar.filter((c) => Number(c.stock_de_mas ?? 0) < 0)
    .sort((a, b) => Number(a.stock_de_mas) - Number(b.stock_de_mas))[0]

  const visible = lista === 'repartido' ? malRepartido : deBaja

  return (
    <div className="space-y-6">
      {/* ── C.1 y C.3 · LA COMPARACIÓN, Y LA CONCENTRACIÓN ──────────────── */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Qué tiene y qué vende cada una
        </h2>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3">Sucursal</th>
                <th className="py-2 pr-3 text-right">Stock</th>
                <th className="py-2 pr-3 text-right">% del stock</th>
                <th className="py-2 pr-3 text-right">Consumo/mes</th>
                <th className="py-2 pr-3 text-right">% del consumo</th>
                <th className="py-2 pr-3 text-right">Cobertura</th>
                <th className="py-2 text-right">Stock de más</th>
              </tr>
            </thead>
            <tbody>
              {comparar.map((c) => {
                const demas = Number(c.stock_de_mas ?? 0)
                return (
                  <tr key={c.sucursal_id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{c.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.codigo} · {c.codigo_sifaco} ·{' '}
                        {Number(c.productos_con_stock).toLocaleString('es-AR')} productos
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatARS(Number(c.valor_costo))}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.pct_del_stock}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatARS(Number(c.consumo_mensual_al_costo))}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.pct_del_consumo}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {c.cobertura_meses ?? '—'} {c.cobertura_meses ? 'meses' : ''}
                    </td>
                    <td className={`py-2 text-right font-medium tabular-nums ${
                      demas < 0 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                      {demas > 0 ? '+' : ''}{formatARS(demas)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {corta && (
          <p className="mt-3 text-sm leading-snug">
            <b>{corta.nombre} vende el {corta.pct_del_consumo}% de la cadena y tiene el{' '}
            {corta.pct_del_stock}% del stock.</b> A su propio ritmo le alcanza para{' '}
            {corta.cobertura_meses} meses, contra {
              comparar.filter((c) => c.sucursal_id !== corta.sucursal_id)
                .map((c) => c.cobertura_meses).filter(Boolean).sort((a: any, b: any) => b - a)[0]
            } meses de la que más tiene. Le faltan {formatARS(Math.abs(Number(corta.stock_de_mas)))} para
            estar en proporción — y esa plata está en las otras, no hay que comprarla.
          </p>
        )}

        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          «Stock de más» es cuánto stock tiene este local por encima (o por debajo) de lo que le
          tocaría por su ritmo de venta. No es un error contable: es dónde está parada la plata.
        </p>

        <FechaDelDatoLinea e={edad} queSeCalcula="Todo esto" className="mt-2" />
      </section>

      {/* ── LO QUE SE PUEDE RESOLVER SIN COMPRAR ────────────────────────── */}
      <Alert>
        <ArrowLeftRight className="size-4" />
        <AlertDescription className="text-xs leading-snug">
          <b>{malRepartido.length.toLocaleString('es-AR')} productos están quietos en una sucursal
          y los pide otra</b>, por {formatARS(plataQuieta)}. Transferir es gratis y comprar cuesta
          plata. La transferencia se crea desde Operaciones → Transferencias, con las tres fotos
          que pide la regla de oro 2: al crear, al despachar y al recibir. NORA no mueve nada sola.
        </AlertDescription>
      </Alert>

      {/* ── C.2 y C.4 · LAS DOS LISTAS ──────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Boton activo={lista === 'repartido'} onClick={() => setLista('repartido')}
            t="Mal repartido" n={malRepartido.length} plata={plataQuieta} />
          <Boton activo={lista === 'baja'} onClick={() => setLista('baja')}
            t="Marcados de baja" n={deBaja.length} plata={plataDeBaja} />

          <Button variant="outline" size="sm" className="ml-auto gap-1"
            onClick={() => lista === 'repartido'
              ? exportExcel('stock-mal-repartido', malRepartido.map((r) => ({
                  SKU: r.sku, Producto: r.nombre,
                  'Está en': r.donde_esta_nombre, Unidades: r.unidades_quietas,
                  Plata: r.plata_quieta,
                  'Lo pide': r.donde_se_pide_nombre,
                  'Se pide por mes': r.se_pide_por_mes,
                  'Qué hacer': 'Transferir desde ' + r.donde_esta_nombre + ' a ' + r.donde_se_pide_nombre,
                })))
              : exportExcel('marcados-de-baja', deBaja.map((d) => ({
                  SKU: d.sku, Producto: d.nombre, STATUS: d.status,
                  Unidades: d.unidades, Plata: d.plata,
                  GUZ: d.guz, FIG: d.fig, ARA: d.ara, TES: d.tes,
                  'Vendió 3 meses': d.vendio_3m,
                  'No pedir': d.nopedir ? 'sí' : '',
                  'Qué hacer': d.hay_que_decidir
                    ? 'Tiene mercadería: hay que decidir'
                    : 'Sin stock: se puede sacar de los cálculos',
                })))}>
            <Download className="size-3.5" /> Exportar los {visible.length}
          </Button>
        </div>

        {lista === 'baja' && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-xs leading-snug">
              El archivo marca <b>{deBaja.length}</b> productos con <code>STATUS</code> en b o B.
              SIFACO no documenta qué significa, así que <b>NORA no asume que sea «baja»</b> ni los
              saca de ningún cálculo. <b>{deBajaConStock.length} tienen mercadería encima</b> por{' '}
              {formatARS(plataDeBaja)}: ésos son los que hay que decidir. Los otros{' '}
              {deBaja.length - deBajaConStock.length} no tienen stock y no molestan a nadie.
            </AlertDescription>
          </Alert>
        )}

        <div className="divide-y rounded-lg border">
          {visible.slice(0, MAX).map((r, i) => (
            <div key={`${r.producto_id ?? r.sku}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  {lista === 'repartido' ? (
                    <>
                      {r.unidades_quietas} un. quietas en <b>{r.donde_esta_nombre}</b> ·{' '}
                      {r.donde_se_pide_nombre} lo vende {Number(r.se_pide_por_mes).toFixed(1)} por mes
                      y no tiene
                    </>
                  ) : (
                    <>
                      {r.status} · {r.unidades} un. (G {r.guz} · F {r.fig} · A {r.ara} · T {r.tes})
                      {Number(r.vendio_3m) > 0
                        ? ` · vendió ${r.vendio_3m} en tres meses`
                        : ' · no vendió en tres meses'}
                      {r.nopedir ? ' · marcado NO PEDIR' : ''}
                    </>
                  )}
                </div>
              </div>
              <code className="text-xs text-muted-foreground">{r.sku}</code>
              {(r.sin_costo || (lista === 'baja' && !r.plata)) ? (
                <Badge variant="outline" className="text-[10px]">sin costo cargado</Badge>
              ) : (
                <span className="font-medium tabular-nums">
                  {formatARS(Number(lista === 'repartido' ? r.plata_quieta : r.plata))}
                </span>
              )}
            </div>
          ))}
          {!visible.length && (
            <p className="p-4 text-sm text-muted-foreground">
              No hay ninguno. Y acá cero quiere decir cero: la lista se calculó y salió vacía.
            </p>
          )}
        </div>

        {visible.length > MAX && (
          <p className="text-xs text-muted-foreground">
            Se muestran {MAX} de {visible.length.toLocaleString('es-AR')}. El resto está en el
            Excel, completo — no es una muestra.
          </p>
        )}
      </section>

      {/* ── LO QUE ESTA PANTALLA NO PUEDE CONTESTAR ─────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lo que esta pantalla no puede afirmar
        </h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>· <b>El punto de pedido por sucursal.</b> El archivo no lo trae: los mínimos quedaron
            en cero, que acá quiere decir sin declarar. Por eso un quiebre es «vende acá y no tiene
            acá» y no «está por debajo del mínimo».</li>
          <li>· <b>Si una transferencia conviene en plata.</b> Mover entre locales tiene un costo
            —flete, tiempo, el riesgo del traslado— y ese número no está en ninguna parte.</li>
          <li>· <b>El consumo de más de tres meses por sucursal.</b> El archivo trae cuatro meses y
            uno viene cortado. La serie larga sigue siendo sólo de la cadena.</li>
          <li>· <b>Qué pasó entre archivo y archivo.</b> Esto es una foto del 14 de octubre: el
            mostrador siguió vendiendo y NORA no se enteró.</li>
        </ul>
      </section>
    </div>
  )
}

function Boton({ activo, onClick, t, n, plata }: {
  activo: boolean; onClick: () => void; t: string; n: number; plata: number
}) {
  return (
    <button onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
        activo ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
      <div className="font-medium">{t}</div>
      <div className="text-xs text-muted-foreground">
        {n.toLocaleString('es-AR')} · {formatARS(plata)}
      </div>
    </button>
  )
}
