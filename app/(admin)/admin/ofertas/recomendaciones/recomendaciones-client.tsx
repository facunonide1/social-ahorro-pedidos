'use client'

import { Download, AlertTriangle, PowerOff } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

const REGLA_LABEL: Record<string, string> = {
  oferta_bajo_costo_sacar: 'Sacar ya: dejan el precio bajo costo',
  oferta_sobra: 'Sobran: sobre productos que ya se venden solos',
  oferta_falta: 'Faltan: productos dormidos sin descuento',
}
const URGENCIA_LABEL: Record<string, string> = {
  ya: 'YA', esta_semana: 'Esta semana', esta_quincena: 'Esta quincena',
}
const MEDICION_LABEL: Record<string, string> = {
  funciono: 'Funcionó',
  no_movio_nada: 'No movió nada',
  perdio_margen: 'Perdió margen',
  no_se_puede_medir: 'No se puede medir',
}

export function RecomendacionesClient({
  reglas, resumenOfertas, urgencias, global, medicion, ofertas, compras, fechaDato,
}: {
  reglas: any[]; resumenOfertas: any[]; urgencias: any[]; global: any
  medicion: any[]; ofertas: any[]; compras: any[]; fechaDato: string | null
}) {
  const n = (v: any) => Number(v ?? 0)
  const apagadas = reglas.filter((r) => !r.activa)

  /**
   * Toda exportación dice de cuándo son los datos y con qué criterio.
   *
   * La fecha es la del archivo de SIFACO que la originó, no la de descarga: un
   * .xlsx bajado hoy sobre datos de hace una semana no es de hoy. Y un archivo
   * que dice «pedir 34 unidades» sin decir por qué es una orden que nadie puede
   * discutir.
   */
  const sello = () => ({
    'Datos del archivo SIFACO': fechaDato ?? 'sin fecha',
    'Generado': new Date().toLocaleDateString('es-AR'),
  })

  function exportar(nombre: string, filas: Record<string, unknown>[]) {
    if (!filas.length) return
    exportExcel(nombre, filas.map((f) => ({ ...f, ...sello() })))
  }

  const porRegla = (r: string) => ofertas.filter((o) => o.regla === r)

  return (
    <div className="space-y-6">
      {/* ── EL NUMERO QUE ORDENA TODO ───────────────────────────────────── */}
      {global && (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Dato t="Stock al costo" v={formatARS(n(global.stock_al_costo))} />
            <Dato t="Consumo mensual" v={formatARS(n(global.consumo_mensual))} />
            <Dato t="Cobertura global" v={`${n(global.cobertura_meses)} meses`} />
          </div>
          <p className="mt-3 text-sm">
            <b>No falta mercadería: está mal repartida.</b> Hay{' '}
            {n(global.cobertura_meses)} meses de stock en promedio, pero{' '}
            <b>{formatARS(n(global.plata_sobrestock))}</b> están en{' '}
            {n(global.items_sobrestock).toLocaleString('es-AR')} productos con más de tres meses de
            cobertura, y <b>{formatARS(n(global.plata_sin_venta))}</b> en{' '}
            {n(global.items_sin_venta).toLocaleString('es-AR')} que no vendieron una unidad en once
            meses. El pedido se financia dejando de comprar lo que sobra, no con plata nueva.
          </p>
        </div>
      )}

      {/* ── OFERTAS ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ofertas</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {['oferta_bajo_costo_sacar', 'oferta_sobra', 'oferta_falta'].map((r) => {
            const g = resumenOfertas.find((x) => x.regla === r)
            const casos = n(g?.casos)
            return (
              <div key={r} className="rounded-lg border p-3">
                <div className="text-sm font-medium">{REGLA_LABEL[r]}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{casos.toLocaleString('es-AR')}</div>
                {n(g?.plata_por_mes) > 0 && (
                  <div className="text-xs text-muted-foreground">{formatARS(n(g?.plata_por_mes))} por mes</div>
                )}
                {r === 'oferta_falta' && casos === 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Ninguna: los 325 productos dormidos con stock, costo y canal abierto{' '}
                    <b>ya tienen descuento</b>. No falta ofertar — sobra.
                  </div>
                )}
                {casos > 0 && (
                  <Button variant="outline" size="sm" className="mt-2 gap-1"
                    onClick={() => exportar(`ofertas-${r}`, porRegla(r).map(filaOferta))}>
                    <Download className="size-3.5" /> Exportar
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <div className="space-y-2">
          {ofertas.slice(0, 25).map((o, i) => (
            <div key={`${o.regla}-${o.codigo}-${i}`} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">{REGLA_LABEL[o.regla]}</Badge>
                <span className="font-mono text-xs text-muted-foreground">{o.codigo}</span>
                <span className="font-medium">{o.producto}</span>
                <span className="ml-auto text-sm font-semibold tabular-nums">{formatARS(n(o.plata_por_mes))}<span className="text-xs font-normal text-muted-foreground">/mes</span></span>
              </div>
              <p className="mt-1.5 text-sm">{o.por_que}</p>
              <p className="mt-1 text-xs text-muted-foreground"><b>Qué hacer:</b> {o.que_hacer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SI LAS OFERTAS SIRVIERON ────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Si las ofertas sirvieron
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {['funciono', 'no_movio_nada', 'perdio_margen', 'no_se_puede_medir'].map((r) => {
            const m = medicion.find((x) => x.resultado === r)
            return (
              <div key={r} className="rounded-lg border p-3">
                <div className="text-sm font-medium">{MEDICION_LABEL[r]}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{n(m?.casos).toLocaleString('es-AR')}</div>
                {r !== 'no_se_puede_medir' && m && (
                  <div className="text-xs text-muted-foreground">
                    margen {formatARS(n(m.margen_antes_mes))} → <b>{formatARS(n(m.margen_durante_mes))}</b>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Se mide en <b>margen, no en unidades</b>: una oferta que duplica las unidades y baja el
            margen a la mitad no ganó nada. Y <b>no separa la estacionalidad</b> — un antigripal en
            junio vende más con o sin descuento. Con once meses cerrados no alcanza para comparar
            contra el mismo mes del año anterior.
          </AlertDescription>
        </Alert>
      </section>

      {/* ── COMPRAS ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Qué reponer</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {['ya', 'esta_semana', 'esta_quincena'].map((u) => {
            const g = urgencias.find((x) => x.urgencia === u)
            return (
              <div key={u} className="rounded-lg border p-3">
                <div className="text-sm font-medium">{URGENCIA_LABEL[u]}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{n(g?.items).toLocaleString('es-AR')}</div>
                <div className="text-xs text-muted-foreground">{formatARS(n(g?.monto))}</div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1" disabled={!compras.length}
            onClick={() => exportar('orden-de-compra', compras.map(filaCompra))}>
            <Download className="size-3.5" /> Orden de compra
          </Button>
          <Button variant="outline" size="sm" className="gap-1"
            onClick={() => exportar('no-comprar', compras.filter((c) => c.sobra || c.sin_venta_11m).map(filaNoComprar))}>
            <Download className="size-3.5" /> Qué NO comprar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          La droguería que sugiere el sistema es <b>a la que más se le compra</b>, no a la que
          conviene: no hay precios por proveedor cargados y sin eso no se puede saber.
        </p>
      </section>

      {/* ── LO QUE NO SE PUEDE SABER ────────────────────────────────────── */}
      {apagadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Reglas escritas y apagadas
          </h2>
          <p className="text-xs text-muted-foreground">
            Están programadas y no corren porque falta el dato. El día que entre, se encienden
            solas. Que esta lista esté a la vista es parte del producto.
          </p>
          {apagadas.map((r) => (
            <div key={r.id} className="rounded-lg border border-dashed p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <PowerOff className="size-3.5 text-muted-foreground" /> {r.titulo}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.que_decide}</p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400"><b>Falta:</b> {r.dato_que_falta}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t}</div>
      <div className="text-xl font-semibold tabular-nums">{v}</div>
    </div>
  )
}

/** Regla de oro 6: SKU y código de barras. Y el motivo, siempre. */
function filaOferta(o: any) {
  return {
    SKU: o.codigo, 'Código de barras': o.barras ?? '', Producto: o.producto,
    Laboratorio: o.laboratorio ?? '',
    'Descuento actual': o.descuento_actual ?? '', Forma: o.forma ?? '',
    'Precio lista': o.precio_lista ?? '', 'Precio con descuento': o.precio_con_descuento ?? '',
    'Precio propuesto': o.precio_propuesto ?? '', Costo: o.costo ?? '',
    Stock: o.stock ?? 0, 'Vende por mes': o.vende_mes,
    'Plata por mes': o.plata_por_mes,
    Motivo: o.por_que, 'Qué hacer': o.que_hacer,
  }
}

function filaCompra(c: any) {
  return {
    SKU: c.sku, 'Código de barras': c.codigo_barras ?? '', Producto: c.nombre,
    Laboratorio: c.laboratorio ?? '',
    Urgencia: URGENCIA_LABEL[c.urgencia] ?? c.urgencia,
    Stock: c.stock, 'Consumo mensual': c.consumo_mes,
    'Cobertura (meses)': c.cobertura_meses ?? '',
    'Sugerido comprar': c.sugerido, 'Costo estimado': c.costo_sugerido,
    Motivo: `Cobertura de ${c.cobertura_meses ?? '—'} meses contra un objetivo de 1 mes, sobre un consumo de ${c.consumo_mes} por mes`,
  }
}

function filaNoComprar(c: any) {
  return {
    SKU: c.sku, 'Código de barras': c.codigo_barras ?? '', Producto: c.nombre,
    Stock: c.stock, 'Plata parada': c.plata_parada,
    'Cobertura (meses)': c.cobertura_meses ?? 'no vendió nada en 11 meses',
    Motivo: c.sin_venta_11m
      ? 'No vendió una unidad en los once meses cerrados'
      : `Tiene ${c.cobertura_meses} meses de cobertura: más de tres`,
    'Qué hacer': 'No reponer. El pedido se financia dejando de comprar esto.',
  }
}
