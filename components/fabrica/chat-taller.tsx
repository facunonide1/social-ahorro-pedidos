'use client'

import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { accionConversar } from '@/app/fabrica/[slug]/taller/acciones'

interface Turno {
  rol: 'usuario' | 'nora'
  texto: string
}

/**
 * El chat, DENTRO del Taller.
 *
 * No abre en una pantalla propia a propósito: lo que sale de acá cae en la
 * misma cola que está tres bloques más abajo, y la persona tiene que poder ver
 * las dos cosas sin cambiar de lugar. Un chat en su propia pantalla se siente
 * como un canal aparte, y este no lo es.
 *
 * No hay botón de "aplicar" en ningún lado de este componente. Es a propósito.
 */
export function ChatTaller({ slug, puedeProponer }: { slug: string; puedeProponer: boolean }) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [pendiente, empezar] = useTransition()
  const fin = useRef<HTMLDivElement>(null)

  const enviar = () => {
    const mensaje = texto.trim()
    if (!mensaje || pendiente) return
    const historia = turnos
    setTurnos([...historia, { rol: 'usuario', texto: mensaje }])
    setTexto('')
    empezar(async () => {
      const r = await accionConversar(slug, historia, mensaje)
      setTurnos((t) => [
        ...t,
        { rol: 'nora', texto: r.ok ? (r.texto ?? '') : (r.error ?? 'No se pudo.') },
      ])
      setTimeout(() => fin.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Hablar con NORA sobre esta declaración</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {puedeProponer
            ? 'Contesta desde lo que está declarado y nada más. Propone; nunca aplica: lo que salga de acá cae en la cola de abajo y lo firmás vos.'
            : 'Tu rol alcanza para preguntar, no para proponer. Podés consultar la declaración todo lo que quieras.'}
        </p>
      </header>

      <div className="max-h-[26rem] space-y-3 overflow-y-auto px-4 py-4">
        {turnos.length === 0 && (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Por ejemplo:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>¿Qué gobierna hoy la declaración de este proyecto?</li>
              <li>El equipo llama &quot;carga masiva&quot; a la pantalla de lote. ¿Se puede cambiar?</li>
              <li>¿Por qué este pool está en sombra y no prendido?</li>
            </ul>
          </div>
        )}
        {turnos.map((t, i) => (
          <div
            key={i}
            className={
              t.rol === 'usuario'
                ? 'ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                : 'max-w-[92%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm'
            }
          >
            {t.texto}
          </div>
        ))}
        {pendiente && <p className="text-xs text-muted-foreground">Mirando la declaración…</p>}
        <div ref={fin} />
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              enviar()
            }
          }}
          placeholder="Preguntá o contá qué querés cambiar…"
          className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm"
        />
        <Button size="sm" className="h-9" disabled={pendiente || !texto.trim()} onClick={enviar}>
          Enviar
        </Button>
      </div>
    </section>
  )
}
