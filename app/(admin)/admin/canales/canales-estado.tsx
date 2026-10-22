import { AlertTriangle, Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { CanalEstado } from '@/lib/canales/lectura'

/**
 * A.5 y A.6 · LOS CINCO CANALES, Y QUÉ LE FALTA A CADA UNO.
 *
 * ── POR QUÉ UN CANAL SIN DATOS NO APARECE VACÍO ─────────────────────────────
 *
 * Porque una fila en blanco se lee como «no hay nada publicado ahí», y lo que
 * pasa es otra cosa: el catálogo no está cargado. Mercado Libre no está
 * conectado y PedidosYa no tiene una sola publicación en el sistema — los
 * 3.742 de Figueiras y los 3.527 de Guzmán son de un análisis que se hizo
 * afuera, y acá no hay con qué verificarlos.
 *
 * Así que el número no se muestra, y en su lugar va qué lo encendería.
 */
export function CanalesEstado({ estados }: { estados: CanalEstado[] | null }) {
  if (estados === null) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-sm leading-snug">
          <b>No se pudo leer el estado de los canales.</b> No significa que no haya ninguno:
          significa que la consulta falló y no se sabe.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Los canales
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {estados.map((c) => (
          <div key={c.canal_id}
            className={`rounded-lg border p-3 ${c.catalogo_cargado ? 'bg-card' : 'border-dashed bg-muted/30'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{c.nombre}</span>
              {!c.activo && <Badge variant="outline" className="text-[10px]">apagado</Badge>}
              {c.tipo === 'mostrador' && (
                <Badge variant="secondary" className="text-[10px]">el patrón de comparación</Badge>
              )}
            </div>

            {/* El número grande, y su punto de procedencia. */}
            {c.publicados === null ? (
              <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                No se sabe cuántos hay publicados.
              </p>
            ) : (
              <>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums">
                    {c.publicados.toLocaleString('es-AR')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.activos?.toLocaleString('es-AR')} activos
                    {(c.apagados ?? 0) > 0 && ` · ${c.apagados?.toLocaleString('es-AR')} apagados`}
                  </span>
                </div>
                {c.de_donde_sale_el_conteo && (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {c.de_donde_sale_el_conteo}.
                  </p>
                )}
              </>
            )}

            {/* A.3 · el recargo contra la comisión, que es la pregunta del bloque C. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">
                comisión {c.comision_pct}% · recargo {c.recargo_pct}%
              </span>
              {c.recargo_cubre_comision === false && (
                <Badge variant="destructive" className="text-[10px]">
                  el recargo no cubre la comisión
                </Badge>
              )}
              {c.recargo_cubre_comision === null && (
                <Badge variant="outline" className="text-[10px]">comisión sin confirmar</Badge>
              )}
            </div>

            {c.dias_sin_mover !== null && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Última sincronización hace <b>{c.dias_sin_mover}</b>{' '}
                {c.dias_sin_mover === 1 ? 'día' : 'días'}
                {c.sincroniza_como && ` · ${c.sincroniza_como}`}
              </p>
            )}

            {c.que_falta && (
              <p className="mt-2 flex gap-1.5 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" />
                <span>{c.que_falta}.</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
