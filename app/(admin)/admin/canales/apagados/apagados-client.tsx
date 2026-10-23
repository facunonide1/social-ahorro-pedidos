'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, HelpCircle, Loader2, PackageCheck, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { ApagadoConStock } from '@/lib/canales/lectura'

/**
 * B · LA LISTA DE LOS 1.790, CON SU BOTÓN.
 *
 * ── LAS TRES LISTAS, Y POR QUÉ NO SON UNA ───────────────────────────────────
 *
 * **Conviene publicar** — deja al menos lo mismo que el mostrador. Son los que
 * van al lote.
 * **Pierde plata igual** — el costo es mayor que el precio. Publicarlos no es
 * una oportunidad: es vender más rápido algo que pierde en cada unidad. Es un
 * problema de precio, no de canal.
 * **No se puede juzgar** — no tienen costo cargado. Ni oportunidad ni
 * descarte: una pregunta abierta, y la plata de estos es null, no cero.
 *
 * Juntas en una sola lista, los dos últimos grupos entrarían al lote con los
 * primeros y alguien publicaría productos que pierden plata.
 */
export function ApagadosClient({ filas, canalPorDefecto }: {
  filas: ApagadoConStock[] | null
  canalPorDefecto: string
}) {
  const router = useRouter()
  const [cual, setCual] = useState<'conviene' | 'pierde' | 'no_se_sabe'>('conviene')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [armando, setArmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [dialogo, setDialogo] = useState(false)
  const [verHipotesis, setVerHipotesis] = useState<ApagadoConStock | null>(null)

  const grupos = useMemo(() => {
    const f = filas ?? []
    return {
      conviene: f.filter((x) => x.conviene === true && x.pierde_plata !== true),
      pierde: f.filter((x) => x.pierde_plata === true || x.conviene === false),
      no_se_sabe: f.filter((x) => x.conviene === null),
    }
  }, [filas])

  const lista = grupos[cual]

  async function armar() {
    if (!marcados.size) return
    setArmando(true)
    try {
      const r = await fetch('/api/canales/lote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'armar', canal: canalPorDefecto, que: 'publicar',
          productos: [...marcados], motivo,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo armar el lote.')
      toast.success('Lote armado en borrador', {
        description: `${marcados.size} productos. Falta firmarlo: sin firma no se exporta ni se carga en la plataforma.`,
        duration: 12_000,
      })
      setMarcados(new Set()); setDialogo(false); setMotivo('')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setArmando(false) }
  }

  function exportar() {
    if (!lista.length) return
    exportExcel(`apagados-con-stock-${cual}`, lista.map((f) => ({
      SKU: f.sku ?? '',
      Producto: f.nombre,
      Canal: f.canal,
      Stock: f.stock ?? '',
      Costo: f.costo ?? '',
      'Plata quieta': f.plata_quieta ?? '',
      'Precio mostrador': f.precio_mostrador ?? '',
      'Precio en el canal': f.precio_en_el_canal ?? '',
      'Queda para el negocio': f.queda_para_el_negocio ?? '',
      'Conviene publicar': f.conviene === null ? 'no se sabe' : f.conviene ? 'si' : 'no',
      'Por qué podría estar apagado': f.hipotesis.map((h) => h.que).join(' · '),
      'Es hipótesis, no hecho': 'si',
    })))
  }

  if (filas === null) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm leading-snug text-muted-foreground">
        <b>No se pudo leer la lista.</b> No significa que no haya apagados con stock: significa
        que la consulta falló y no se sabe.
      </p>
    )
  }

  const plataMarcada = lista
    .filter((f) => marcados.has(f.producto_id))
    .reduce((a, f) => a + Number(f.plata_quieta ?? 0), 0)

  return (
    <>
      {/* ── LAS TRES LISTAS ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ['conviene', <PackageCheck key="i" className="mr-1 size-3" />, `Conviene publicar (${grupos.conviene.length})`],
          ['pierde', <TrendingDown key="i" className="mr-1 size-3" />, `Pierde plata igual (${grupos.pierde.length})`],
          ['no_se_sabe', <HelpCircle key="i" className="mr-1 size-3" />, `No se puede juzgar (${grupos.no_se_sabe.length})`],
        ] as const).map(([k, icono, label]) => (
          <Button
            key={k} size="sm"
            variant={cual === k ? 'default' : 'outline'}
            onClick={() => { setCual(k); setMarcados(new Set()) }}
            className="h-7 text-xs"
          >
            {icono}
            {label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={exportar} className="h-7 text-xs">
          <Download className="mr-1 size-3" />
          Exportar .xlsx con SKU
        </Button>
      </div>

      {/* El aviso de la lista en la que NO hay que publicar. */}
      {cual === 'pierde' && (
        <p className="rounded-lg border border-destructive bg-destructive/5 p-3 text-xs leading-snug">
          <b>Estos no van al lote de publicar.</b> El costo es mayor o igual que lo que quedaría de
          la venta: publicarlos haría que se vendan más rápido perdiendo plata en cada unidad. Es un
          problema de precio y se arregla en SIFACO, no acá.
        </p>
      )}
      {cual === 'no_se_sabe' && (
        <p className="rounded-lg border border-dashed p-3 text-xs leading-snug">
          <b>Estos no tienen costo cargado</b>, así que no se puede decir si conviene publicarlos.
          Su plata es <b>null, no cero</b>: no entran en los $57,7 M. Lo enciende que el costo
          llegue con el maestro de SIFACO o con las facturas de compra.
        </p>
      )}

      {/* ── LA BARRA DE ACCIÓN ───────────────────────────────────────── */}
      {cual === 'conviene' && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-3 backdrop-blur">
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() =>
              setMarcados(
                marcados.size === lista.length
                  ? new Set()
                  : new Set(lista.map((f) => f.producto_id)),
              )
            }
          >
            {marcados.size === lista.length ? 'Desmarcar todos' : `Marcar los ${lista.length}`}
          </Button>
          <span className="text-xs tabular-nums">
            {marcados.size.toLocaleString('es-AR')} marcados
            {!!marcados.size && <> · {formatARS(plataMarcada, 0)}</>}
          </span>
          <Button
            size="sm" className="h-7 text-xs"
            disabled={!marcados.size}
            onClick={() => setDialogo(true)}
          >
            Preparar para publicar
          </Button>
          <span className="text-[11px] text-muted-foreground">
            arma un lote en borrador — <b>no publica</b>
          </span>
        </div>
      )}

      {/* ── LA LISTA ─────────────────────────────────────────────────── */}
      {!lista.length ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay productos en esta lista. <b>Este cero es de verdad:</b> se miró y no hay.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/40">
              <tr className="text-left [&>th]:px-2.5 [&>th]:py-2 [&>th]:font-medium">
                {cual === 'conviene' && <th className="w-8" />}
                <th>Producto</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Costo</th>
                <th className="text-right">Plata quieta</th>
                <th className="text-right">Mostrador</th>
                <th className="text-right">En el canal</th>
                <th className="text-right">Queda</th>
                <th>Por qué podría estar apagado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lista.map((f) => (
                <tr key={f.anomalia_id} className="[&>td]:px-2.5 [&>td]:py-2">
                  {cual === 'conviene' && (
                    <td>
                      <input
                        type="checkbox"
                        checked={marcados.has(f.producto_id)}
                        onChange={() =>
                          setMarcados((s) => {
                            const n = new Set(s)
                            n.has(f.producto_id) ? n.delete(f.producto_id) : n.add(f.producto_id)
                            return n
                          })
                        }
                        className="size-3.5 accent-foreground"
                      />
                    </td>
                  )}
                  <td className="max-w-[18rem]">
                    <p className="truncate">{f.nombre}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {f.sku ?? 'sin SKU'} · {f.canal}
                    </p>
                  </td>
                  <td className="text-right tabular-nums">
                    {f.stock?.toLocaleString('es-AR') ?? '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {f.costo === null ? '—' : formatARS(f.costo, 0)}
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {f.plata_quieta === null ? (
                      <span className="font-normal text-muted-foreground">no se sabe</span>
                    ) : (
                      formatARS(f.plata_quieta, 0)
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {f.precio_mostrador === null ? '—' : formatARS(f.precio_mostrador, 0)}
                  </td>
                  <td className="text-right tabular-nums">
                    {f.precio_en_el_canal === null ? '—' : formatARS(f.precio_en_el_canal, 0)}
                  </td>
                  <td
                    className={`text-right tabular-nums ${
                      f.pierde_plata ? 'font-semibold text-destructive' : ''
                    }`}
                  >
                    {f.queda_para_el_negocio === null
                      ? '—'
                      : formatARS(f.queda_para_el_negocio, 0)}
                  </td>
                  <td className="max-w-[16rem]">
                    <button
                      type="button"
                      onClick={() => setVerHipotesis(f)}
                      className="text-left leading-snug underline decoration-dotted underline-offset-2"
                    >
                      {f.se_sabe_por_que ? (
                        f.hipotesis[0]?.que
                      ) : (
                        <span className="text-muted-foreground">no se sabe</span>
                      )}
                      {f.hipotesis.length > 1 && (
                        <span className="text-muted-foreground"> +{f.hipotesis.length - 1}</span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!!lista.length && lista[0].de_cuantos_es_este > lista.length && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          Se muestran {lista.length.toLocaleString('es-AR')} de{' '}
          {lista[0].de_cuantos_es_este.toLocaleString('es-AR')}, ordenados por plata.{' '}
          <b>No es que los demás no existan:</b> es que el corte está declarado del lado de la base
          y no lo pone PostgREST en silencio.
        </p>
      )}

      {/* ── EL DIÁLOGO DE LAS HIPÓTESIS ──────────────────────────────── */}
      <Dialog open={!!verHipotesis} onOpenChange={(o) => !o && setVerHipotesis(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Por qué podría estar apagado</DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              <b>El sistema no sabe por qué está apagado.</b> WooCommerce no informa quién lo pasó
              a borrador, ni cuándo, ni por qué. Lo que sigue son hechos del entorno que{' '}
              <b>podrían</b> explicarlo — hipótesis, no causas.
            </DialogDescription>
          </DialogHeader>
          {verHipotesis && (
            <>
              <p className="text-sm font-medium">{verHipotesis.nombre}</p>
              <div className="space-y-2">
                {verHipotesis.hipotesis.map((h, i) => (
                  <div key={i} className="rounded border p-2.5 text-xs">
                    <p className="font-medium">{h.que}</p>
                    <p className="mt-0.5 leading-snug text-muted-foreground">
                      El hecho: {h.el_hecho}
                    </p>
                    <p className="mt-0.5 leading-snug">Si es esto: {h.si_es_esto}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                <b>«Sin foto» no aparece como hipótesis</b> aunque ninguno tenga foto: es el 100% de
                las publicaciones del canal, así que no distingue a este producto de los demás. Un
                detector que marca todo no marca nada.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── EL LOTE ──────────────────────────────────────────────────── */}
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preparar {marcados.size} productos para publicar</DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              Esto arma un lote <b>en borrador</b>. No publica nada: después hay que firmarlo, y
              el lote firmado sale en .xlsx para que una persona lo cargue en la plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="rounded border bg-muted/40 p-2.5 text-xs">
              {marcados.size.toLocaleString('es-AR')} productos ·{' '}
              <b>{formatARS(plataMarcada, 0)}</b> de stock quieto
            </p>
            <Textarea
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
              rows={2} className="text-sm"
              placeholder="Tienen stock y el canal los deja igual que el mostrador"
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              El motivo es obligatorio. Un lote sin motivo es un lote que en tres meses nadie puede
              explicar.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogo(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={armar} disabled={armando || !motivo.trim()}>
              {armando && <Loader2 className="mr-1 size-3 animate-spin" />}
              Armar el lote en borrador
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
