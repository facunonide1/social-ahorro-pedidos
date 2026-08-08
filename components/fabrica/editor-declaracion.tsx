'use client'

import { useState, useTransition } from 'react'
import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  accionGuardar,
  accionRevertir,
  accionVerDiff,
} from '@/app/fabrica/[slug]/pools/[clave]/acciones'

interface PantallaEditable {
  ruta: string
  titulo: string
  dinamico: boolean
}

interface LineaDiff {
  texto: string
  costo: string
  reversibleSinPerdida: boolean
}

/**
 * El editor de declaración.
 *
 * Sólo títulos, que es lo único que el lector gobierna. Los demás campos del
 * manifiesto se ven en la ficha y no se editan: guardar un cambio que hoy no
 * hace nada es guardarlo para que se aplique de golpe el día que el lector
 * empiece a leerlo, sin que nadie lo haya revisado con esa consecuencia en
 * mente.
 *
 * El diff se pide ANTES de guardar y en una llamada aparte. Que revisar sea un
 * paso propio y no un efecto de guardar es la diferencia entre revisar y
 * enterarse.
 */
export function EditorDeclaracion({
  slug,
  clave,
  pantallas,
  gobernando,
}: {
  slug: string
  clave: string
  pantallas: PantallaEditable[]
  gobernando: boolean
}) {
  const editables = pantallas.filter((p) => !p.dinamico)
  const [titulos, setTitulos] = useState<Record<string, string>>(
    Object.fromEntries(editables.map((p) => [p.ruta, p.titulo])),
  )
  const [motivo, setMotivo] = useState('')
  const [diff, setDiff] = useState<LineaDiff[] | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const cambiados = editables.filter((p) => titulos[p.ruta] !== p.titulo)

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border p-4">
        <h3 className="text-sm font-medium">Editar la declaración</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {gobernando
            ? 'Este pool está gobernado: lo que se guarde acá se ve en la pantalla en la request siguiente, sin deploy.'
            : 'Este pool no está gobernado todavía. El cambio queda declarado y no se ve en ningún lado hasta prender el lector.'}
        </p>
      </div>

      <div className="divide-y divide-border">
        {editables.map((p) => (
          <div key={p.ruta} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">{p.ruta}</span>
            <input
              value={titulos[p.ruta] ?? ''}
              onChange={(e) => {
                setTitulos({ ...titulos, [p.ruta]: e.target.value })
                setDiff(null)
              }}
              className="h-8 w-64 rounded-md border border-border bg-background px-2 text-sm"
              aria-label={`Título de ${p.ruta}`}
            />
            {titulos[p.ruta] !== p.titulo && (
              <Badge variant="warning" className="font-normal">cambiado</Badge>
            )}
          </div>
        ))}
      </div>

      {pantallas.some((p) => p.dinamico) && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Las pantallas con título dinámico no se editan: su cabecera sale de los
          datos de la fila, y una etiqueta fija le quitaría información.
        </p>
      )}

      <div className="border-t border-border p-4">
        {diff && (
          <div className="mb-3 space-y-2">
            {diff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay cambios que aplicar.</p>
            ) : (
              diff.map((d, i) => (
                <div key={i} className="rounded-md border border-border p-3 text-sm">
                  <p>{d.texto}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">Deshacerlo: </span>
                    {d.costo}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        <label htmlFor="motivo" className="text-xs text-muted-foreground">
          Por qué se hace este cambio (obligatorio)
        </label>
        <input
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej: el equipo del depósito llamaba a esta pantalla de otra manera"
          className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pendiente || cambiados.length === 0}
            onClick={() =>
              empezar(async () => {
                setMensaje(null)
                const r = await accionVerDiff(slug, clave, titulos)
                if (r.ok) setDiff(r.diff ?? [])
                else setMensaje(r.error ?? 'No se pudo calcular el diff.')
              })
            }
          >
            Ver qué cambia
          </Button>
          <Button
            size="sm"
            disabled={pendiente || cambiados.length === 0 || !motivo.trim() || !diff}
            onClick={() =>
              empezar(async () => {
                const r = await accionGuardar(slug, clave, titulos, motivo)
                if (r.ok) {
                  setMensaje(`Guardado como versión ${r.numero}.`)
                  setDiff(null)
                  setMotivo('')
                } else {
                  setMensaje(
                    r.error ?? r.rechazos?.map((x) => `paso ${x.paso}: ${x.motivo}`).join(' · ') ?? 'No se guardó.',
                  )
                }
              })
            }
          >
            Guardar versión nueva
          </Button>
          {cambiados.length > 0 && !diff && (
            <span className="self-center text-xs text-muted-foreground">
              Primero mirá qué cambia.
            </span>
          )}
        </div>

        {mensaje && <p className="mt-2 text-sm">{mensaje}</p>}
      </div>
    </div>
  )
}

/** Volver a una versión anterior. Crea una versión nueva; no borra nada. */
export function BotonRevertir({
  slug,
  clave,
  versionId,
  numero,
}: {
  slug: string
  clave: string
  versionId: string
  numero: number
}) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pendiente, empezar] = useTransition()
  const [mensaje, setMensaje] = useState<string | null>(null)

  if (mensaje) return <span className="text-xs text-muted-foreground">{mensaje}</span>

  if (!abierto) {
    return (
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAbierto(true)}>
        <RotateCcw className="size-3" /> volver a ésta
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder={`Por qué se vuelve a la ${numero}`}
        className="h-8 w-56 rounded-md border border-border bg-background px-2 text-xs"
      />
      <Button
        size="sm"
        variant="destructive"
        className="h-8 text-xs"
        disabled={pendiente || !motivo.trim()}
        onClick={() =>
          empezar(async () => {
            const r = await accionRevertir(slug, clave, versionId, motivo)
            setMensaje(r.ok ? `Se creó la versión ${r.numero} con el contenido de la ${numero}.` : (r.error ?? 'No se pudo.'))
          })
        }
      >
        Confirmar
      </Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  )
}
