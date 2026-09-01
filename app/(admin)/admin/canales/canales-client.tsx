'use client'

import { ShieldAlert, PowerOff, Download } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const PROBLEMA: Record<string, { titulo: string; que_es: string; grave?: boolean }> = {
  no_deberia_estar_publicado: {
    titulo: 'NO deberían estar publicados',
    que_es: 'SIFACO los declara con receta o controlados. Es la regla de oro 9 y no es una decisión comercial.',
    grave: true,
  },
  no_publicable_en_borrador: {
    titulo: 'No publicables, en borrador',
    que_es: 'No están a la vista del público, pero si alguien los publica salen mal.',
  },
  publicado_sin_stock: {
    titulo: 'Publicados sin stock',
    que_es: 'Según SIFACO no hay unidades. Cancelar por falta de stock es lo más caro que le pasa a un canal.',
  },
  precio_distinto: {
    titulo: 'Precio distinto del calculado',
    que_es: 'El precio de la tienda no coincide con el que sale de la fórmula del canal.',
  },
  no_cubre_costo: {
    titulo: 'El precio no cubre el costo',
    que_es: 'Después de comisión y envío, se pierde plata en cada venta.',
  },
  no_se_puede_calcular: {
    titulo: 'No se puede calcular el precio',
    que_es: 'SIFACO no declara precio o costo para estos productos. No es que estén mal: es que no hay con qué compararlos.',
  },
  no_en_catalogo: {
    titulo: 'El maestro no tiene ese código',
    que_es:
      'El SKU de la tienda es un código de SIFACO válido, pero no aparece en el archivo del ' +
      'maestro que se importó. Eso NO quiere decir que el producto no exista: quiere decir que ' +
      'el archivo salió incompleto. Hay que verificarlos en SIFACO uno por uno.',
  },
}

export function CanalesClient({
  canales, problemas, publicados, candidatos, ilegales, sinCruce,
}: {
  canales: any[]; problemas: any[]; publicados: number; candidatos: number
  ilegales: any[]; sinCruce: any[]
}) {
  const n = (p: string) => Number(problemas.find((x) => x.problema === p)?.casos ?? 0)
  const woo = canales.find((c) => c.id === 'woo')
  const meli = canales.find((c) => c.id === 'meli')

  return (
    <div className="space-y-6">
      {/* ── LO PRIMERO ES LO LEGAL ──────────────────────────────────────── */}
      {n('no_deberia_estar_publicado') > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertDescription>
            <b>
              {n('no_deberia_estar_publicado')} productos que SIFACO declara con receta o controlados
              están visibles en la tienda.
            </b>{' '}
            Es la regla de oro 9: no es una decisión comercial. Hay que despublicarlos, o corregir la
            condición de venta en SIFACO si está mal clasificada. NORA no los despublica sola porque
            no escribe en el canal sin que una persona lo confirme.
            <div className="mt-2">
              <Button variant="outline" size="sm" className="gap-1"
                onClick={() => exportExcel('despublicar-regla-9', ilegales.map((i) => ({
                  SKU: i.sku, Producto: i.producto,
                  'Condición en SIFACO': i.condicion_venta,
                  Controlado: i.lista_controlado ?? '',
                  'Estado en la tienda': i.estado,
                  Link: i.permalink ?? '',
                  'Qué hacer': 'Despublicar, o corregir la condición de venta en SIFACO si está mal.',
                })))}>
                <Download className="size-3.5" /> Exportar los {ilegales.length}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato t="Publicados en la tienda" v={publicados.toLocaleString('es-AR')} />
        <Dato t="Con algún problema" v={problemas.reduce((a, p) => a + Number(p.casos), 0).toLocaleString('es-AR')} />
        <Dato t="Candidatos sin publicar" v={candidatos.toLocaleString('es-AR')} />
        <Dato t="Canales conectados" v={String(canales.filter((c) => c.activo).length)} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Qué encontró el espejo
        </h2>
        {problemas
          .slice()
          .sort((a, b) => Number(b.casos) - Number(a.casos))
          .map((p) => {
            const info = PROBLEMA[p.problema]
            if (!info) return null
            return (
              <div key={p.problema}
                className={`rounded-lg border p-3 ${info.grave ? 'border-rose-500/40 bg-rose-500/5' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{info.titulo}</span>
                  <span className="ml-auto text-lg font-semibold tabular-nums">
                    {Number(p.casos).toLocaleString('es-AR')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{info.que_es}</p>
                {p.problema === 'no_en_catalogo' && sinCruce.length > 0 && (
                  <div className="mt-2">
                    <Button variant="outline" size="sm" className="gap-1"
                      onClick={() => exportExcel('codigos-que-el-maestro-no-tiene', sinCruce.map((x) => ({
                        'Código (SKU en la tienda)': x.sku,
                        'Nombre en la tienda': x.nombre_canal,
                        'Estado en la tienda': x.estado,
                        'Precio publicado': x.precio_publicado ?? '',
                        Link: x.permalink ?? '',
                        'Qué hacer': 'Buscar el código en SIFACO. Si existe, el export del maestro salió incompleto.',
                      })))}>
                      <Download className="size-3.5" /> Exportar los {sinCruce.length}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
      </section>

      {/* ── LO QUE FALTA CONFIGURAR ─────────────────────────────────────── */}
      {woo && !woo.configurado && (
        <Alert>
          <AlertDescription>
            <b>El precio de canal todavía no se puede aplicar.</b> La comisión, el costo de envío, el
            impuesto y el margen de este canal están en cero porque nadie los definió —y cero no es
            lo mismo que «no aplica»—. Sin eso, mandar precios sería mandar números armados con
            valores que nadie eligió.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Canales</h2>
        {canales.map((c) => (
          <div key={c.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.nombre}</span>
              {!c.activo && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <PowerOff className="size-3" /> no conectado
                </Badge>
              )}
              {!c.configurado && (
                <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                  sin configurar
                </Badge>
              )}
              {!c.sucursal_despacho_id && (
                <Badge variant="outline" className="text-[10px]">sucursal de despacho sin definir</Badge>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Comisión {c.comision_pct}% · envío {c.costo_envio} ({c.envio_lo_paga}) ·
              impuesto {c.impuesto_pct}% · margen extra {c.margen_extra_pct}%
            </div>
            {c.notas && <p className="mt-1 text-xs italic text-muted-foreground">{c.notas}</p>}
          </div>
        ))}
      </section>

      {/* ── LO QUE NO SE PUEDE SABER ────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lo que este panel no puede afirmar
        </h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>· <b>El stock no es en tiempo real.</b> El de NORA es una foto del archivo diario: entre archivo y archivo el mostrador vende y el canal no se entera.</li>
          <li>· <b>De qué sucursal sale un pedido.</b> Sin el archivo por sucursal, el despacho se configura a mano.</li>
          <li>· <b>Si el cliente del canal ya era cliente</b>, salvo que dé el DNI.</li>
          <li>· <b>Reclamos y calificaciones</b>, hasta conectar esa parte de la API.</li>
          <li>· <b>Si el canal suma venta o mueve la que ya tenías.</b> Se puede ver la correlación; la causa, no.</li>
        </ul>
      </section>
    </div>
  )
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
    </div>
  )
}
