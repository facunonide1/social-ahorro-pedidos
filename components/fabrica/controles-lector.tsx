'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ESTADOS_LECTOR, ETIQUETA_LECTOR, type EstadoLector } from '@/lib/fabrica/lector-estados'
import { accionCambiarEstado, accionPanico } from '@/app/fabrica/[slug]/lector/acciones'

const CLASE: Record<EstadoLector, string> = {
  apagado: 'data-[activo=true]:bg-muted data-[activo=true]:text-foreground',
  sombra: 'data-[activo=true]:bg-info/15 data-[activo=true]:text-info',
  prendido: 'data-[activo=true]:bg-success/15 data-[activo=true]:text-success',
}

/**
 * El selector de estado de un pool.
 *
 * Tres botones y no un menú: cuando hay que apagar algo apurado, un menú es un
 * clic de más.
 */
export function SelectorEstado({
  slug,
  clave,
  actual,
}: {
  slug: string
  clave: string
  actual: EstadoLector
}) {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={`Estado del lector de ${clave}`}
        className="inline-flex overflow-hidden rounded-md border border-border"
      >
        {ESTADOS_LECTOR.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={actual === e}
            data-activo={actual === e}
            disabled={pendiente || actual === e}
            onClick={() =>
              empezar(async () => {
                setError(null)
                const r = await accionCambiarEstado(slug, clave, e)
                if (!r.ok) setError(r.error ?? 'No se pudo cambiar.')
              })
            }
            className={cn(
              'px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default',
              'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              'border-r border-border last:border-r-0',
              CLASE[e],
            )}
          >
            {ETIQUETA_LECTOR[e]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * El interruptor de pánico.
 *
 * Pide confirmación escribiendo, no un simple "¿estás seguro?": apagar todo es
 * la decisión correcta cuando hace falta y una molestia cuando se toca sin
 * querer, y la diferencia entre las dos es un segundo de atención.
 */
export function BotonPanico({ slug, activos }: { slug: string; activos: number }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [pendiente, empezar] = useTransition()
  const [resultado, setResultado] = useState<string | null>(null)

  const habilitado = texto.trim().toUpperCase() === 'APAGAR TODO'

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Apagar todo</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Devuelve los {activos === 1 ? 'pool activo' : `${activos} pools activos`} a{' '}
            <span className="font-medium">apagado</span> de una vez. Cada sector
            vuelve a leer su definición del código, que es lo que hacía antes de
            que existiera la fábrica. No hace falta un deploy y no se pierde nada:
            las declaraciones quedan donde están.
          </p>

          {!abierto ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setAbierto(true)}
              disabled={activos === 0}
            >
              {activos === 0 ? 'Ya está todo apagado' : 'Apagar todo'}
            </Button>
          ) : (
            <div className="mt-3">
              <label htmlFor="confirmar-panico" className="text-xs text-muted-foreground">
                Escribí <span className="font-mono font-medium">APAGAR TODO</span> para confirmar
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <input
                  id="confirmar-panico"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  autoComplete="off"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!habilitado || pendiente}
                  onClick={() =>
                    empezar(async () => {
                      const r = await accionPanico(slug)
                      setResultado(
                        r.ok
                          ? `Listo: ${r.apagados} pool(s) volvieron a apagado.`
                          : (r.error ?? 'No se pudo.'),
                      )
                      setAbierto(false)
                      setTexto('')
                    })
                  }
                >
                  Confirmar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAbierto(false); setTexto('') }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {resultado && <p className="mt-2 text-sm">{resultado}</p>}
        </div>
      </div>
    </div>
  )
}
