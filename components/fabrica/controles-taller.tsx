'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  accionAplicar,
  accionRechazar,
  accionRevertirPropuesta,
  accionVerificar,
} from '@/app/fabrica/[slug]/taller/acciones'

/**
 * Decidir sobre una propuesta.
 *
 * Rechazar exige escribir por qué. Aprobar no: el motivo ya viene en la
 * propuesta y pedirlo dos veces convierte la firma en un trámite. Rechazar sí,
 * porque el que propuso necesita saber qué corregir — sin eso hay que adivinar
 * en la siguiente.
 */
export function DecidirPropuesta({
  slug,
  propuestaId,
  estado,
  carril,
}: {
  slug: string
  propuestaId: string
  estado: string
  carril: string
}) {
  const [nota, setNota] = useState('')
  const [pidiendoNota, setPidiendoNota] = useState<'rechazar' | 'revertir' | null>(null)
  const [pendiente, empezar] = useTransition()
  const [mensaje, setMensaje] = useState<string | null>(null)

  if (mensaje) return <p className="text-xs text-muted-foreground">{mensaje}</p>

  if (estado === 'aplicada') {
    if (pidiendoNota === 'revertir') {
      return (
        <Formulario
          etiqueta="Por qué se revierte"
          valor={nota}
          onChange={setNota}
          onCancelar={() => setPidiendoNota(null)}
          onConfirmar={() =>
            empezar(async () => {
              const r = await accionRevertirPropuesta(slug, propuestaId, nota)
              setMensaje(r.ok ? 'Revertida.' : (r.error ?? 'No se pudo.'))
            })
          }
          pendiente={pendiente}
        />
      )
    }
    return (
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPidiendoNota('revertir')}>
        Revertir
      </Button>
    )
  }

  if (estado !== 'pendiente' || carril === 'rojo') return null

  if (pidiendoNota === 'rechazar') {
    return (
      <Formulario
        etiqueta="Por qué se rechaza"
        valor={nota}
        onChange={setNota}
        onCancelar={() => setPidiendoNota(null)}
        onConfirmar={() =>
          empezar(async () => {
            const r = await accionRechazar(slug, propuestaId, nota)
            setMensaje(r.ok ? 'Rechazada.' : (r.error ?? 'No se pudo.'))
          })
        }
        pendiente={pendiente}
      />
    )
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="h-8 text-xs"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            const r = await accionAplicar(slug, propuestaId)
            setMensaje(r.ok ? 'Aplicada.' : (r.error ?? 'No se pudo.'))
          })
        }
      >
        Aprobar
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        onClick={() => setPidiendoNota('rechazar')}
      >
        Rechazar
      </Button>
    </div>
  )
}

function Formulario({
  etiqueta,
  valor,
  onChange,
  onConfirmar,
  onCancelar,
  pendiente,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
  onConfirmar: () => void
  onCancelar: () => void
  pendiente: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={etiqueta}
        className="h-8 w-56 rounded-md border border-border bg-background px-2 text-xs"
      />
      <Button size="sm" className="h-8 text-xs" disabled={pendiente || !valor.trim()} onClick={onConfirmar}>
        Confirmar
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancelar}>
        Cancelar
      </Button>
    </div>
  )
}

/** "Verificar este pool ahora", sin esperar a que alguien navegue. */
export function BotonVerificar({ slug, clave }: { slug: string; clave: string }) {
  const [pendiente, empezar] = useTransition()
  const [resumen, setResumen] = useState<string | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            const r = await accionVerificar(slug, clave)
            setResumen(r.ok ? (r.resumen ?? 'Listo.') : (r.error ?? 'No se pudo.'))
          })
        }
      >
        {pendiente ? 'Verificando…' : 'Verificar ahora'}
      </Button>
      {resumen && <span className="text-xs text-muted-foreground">{resumen}</span>}
    </div>
  )
}
