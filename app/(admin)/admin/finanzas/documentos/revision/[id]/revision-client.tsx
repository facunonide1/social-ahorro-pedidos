'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { VisorDocumento } from '@/components/documentos/visor-documento'
import type { ExtraccionCruda } from '@/lib/documentos/prompt-extraccion'

type Estado = 'pendiente' | 'procesando' | 'ok' | 'error' | string

/**
 * Revisión de un documento capturado.
 *
 * Dispara la lectura al abrirse si todavía no se leyó, y muestra el original al
 * lado de lo extraído. La edición y confirmación llegan en el bloque siguiente.
 */
export function RevisionClient({
  extraccionId,
  estado: estadoInicial,
  error: errorInicial,
  datos: datosIniciales,
  imagenUrl,
  esPdf,
}: {
  extraccionId: string
  estado: Estado
  error: string | null
  datos: ExtraccionCruda | null
  imagenUrl: string | null
  esPdf: boolean
}) {
  const [estado, setEstado] = useState<Estado>(estadoInicial)
  const [error, setError] = useState<string | null>(errorInicial)
  const [datos, setDatos] = useState<ExtraccionCruda | null>(datosIniciales)

  const leer = useCallback(async () => {
    setEstado('procesando')
    setError(null)
    try {
      const r = await fetch(`/api/documentos/${extraccionId}/extraer`, { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setEstado('error')
        setError(j?.error ?? 'No pude leer el documento.')
        return
      }
      setDatos(j.datos)
      setEstado('ok')
    } catch {
      setEstado('error')
      setError('Se cortó la conexión mientras leía el documento.')
    }
  }, [extraccionId])

  useEffect(() => {
    if (estadoInicial === 'pendiente') void leer()
    // Solo al montar: no queremos redisparar la lectura en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VisorDocumento url={imagenUrl} esPdf={esPdf} />

      <div className="rounded-lg border border-border">
        {estado === 'procesando' && (
          <div className="flex items-start gap-3 p-6">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
            <div>
              <div className="font-medium">Leyendo el documento…</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Puede tardar hasta un minuto si la factura es larga.
              </p>
            </div>
          </div>
        )}

        {estado === 'error' && (
          <div className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
              <div>
                <div className="font-medium">No pude leer este documento</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error ?? 'Probá con una foto más nítida, derecha y con buena luz.'}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-4" onClick={leer}>
              <RefreshCw className="size-4" /> Intentar de nuevo
            </Button>
          </div>
        )}

        {estado === 'ok' && datos && <Extraido datos={datos} />}
      </div>
    </div>
  )
}

function Extraido({ datos }: { datos: ExtraccionCruda }) {
  const t = datos.totales ?? ({} as ExtraccionCruda['totales'])
  return (
    <div className="divide-y divide-border">
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lo que leí</div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Dato label="Tipo" valor={[datos.tipo, datos.letra].filter(Boolean).join(' ') || null} />
          <Dato label="CUIT del emisor" valor={datos.emisor?.identificacion_fiscal ?? null} />
          <Dato label="Emisor" valor={datos.emisor?.nombre ?? null} />
          <Dato label="Punto de venta" valor={datos.punto_venta} />
          <Dato label="Número" valor={datos.numero} />
          <Dato label="Emisión" valor={datos.fecha_emision} />
          <Dato label="Vencimiento" valor={datos.fecha_vencimiento} />
          <Dato label="Condición de venta" valor={datos.condicion_venta} />
          <Dato label="Total" valor={t?.total != null ? String(t.total) : null} />
        </dl>
      </div>

      <div className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Renglones ({datos.lineas?.length ?? 0})
        </div>
        <div className="mt-2 max-h-[40vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1 font-normal">Descripción</th><th className="py-1 text-right font-normal">Cant.</th><th className="py-1 text-right font-normal">P. unit.</th></tr>
            </thead>
            <tbody>
              {(datos.lineas ?? []).map((l, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1 pr-2">{l.descripcion}</td>
                  <td className="py-1 text-right tabular-nums">{l.cantidad ?? '—'}</td>
                  <td className="py-1 text-right tabular-nums">{l.precio_unitario ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!!datos.advertencias?.length && (
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Avisos de la lectura</div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {datos.advertencias.map((a, i) => <li key={i}>· {a}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={valor ? 'font-medium' : 'text-muted-foreground'}>{valor ?? 'no se leyó'}</dd>
    </div>
  )
}
