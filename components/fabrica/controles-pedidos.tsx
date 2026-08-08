'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  accionCambiarEstadoPedido,
  accionVincularPedido,
} from '@/app/fabrica/construccion/acciones'
import { ETIQUETA_ESTADO, type EstadoPedido } from '@/lib/fabrica/pedidos-etiquetas'

const AVANZA: Partial<Record<EstadoPedido, EstadoPedido[]>> = {
  abierto: ['en_analisis', 'descartado'],
  en_analisis: ['en_construccion', 'descartado'],
  en_construccion: ['resuelto'],
}

/**
 * Mover un pedido y juntarlo con otro.
 *
 * Cerrar —resolver o descartar— exige escribir por qué. Avanzar no: mover algo
 * a "en análisis" no cierra ninguna puerta. Un pedido que desaparece sin motivo
 * se vuelve a pedir, y la próxima vez nadie sabe que ya se había decidido.
 */
export function ControlesPedido({
  id,
  estado,
  candidatos,
}: {
  id: string
  estado: EstadoPedido
  candidatos: { id: string; texto: string }[]
}) {
  const [pendiente, empezar] = useTransition()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pidiendo, setPidiendo] = useState<EstadoPedido | null>(null)
  const [motivo, setMotivo] = useState('')
  const [juntando, setJuntando] = useState(false)

  if (mensaje) return <p className="text-xs text-muted-foreground">{mensaje}</p>

  const mover = (a: EstadoPedido, conMotivo?: string) =>
    empezar(async () => {
      const r = await accionCambiarEstadoPedido(id, a, conMotivo)
      setMensaje(r.ok ? `Movido a ${ETIQUETA_ESTADO[a]}.` : (r.error ?? 'No se pudo.'))
    })

  if (pidiendo) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={pidiendo === 'descartado' ? 'Por qué se descarta' : 'Cómo se resolvió'}
          className="h-8 w-72 rounded-md border border-border bg-background px-2 text-xs"
        />
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={pendiente || !motivo.trim()}
          onClick={() => mover(pidiendo, motivo)}
        >
          Confirmar
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPidiendo(null)}>
          Cancelar
        </Button>
      </div>
    )
  }

  if (juntando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          defaultValue=""
          disabled={pendiente}
          onChange={(e) =>
            empezar(async () => {
              const r = await accionVincularPedido(id, e.target.value || null)
              setMensaje(r.ok ? 'Juntados.' : (r.error ?? 'No se pudo.'))
            })
          }
          className="h-8 max-w-md rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="">Elegí con cuál se junta…</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.texto.slice(0, 90)}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setJuntando(false)}>
          Cancelar
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(AVANZA[estado] ?? []).map((a) => (
        <Button
          key={a}
          variant={a === 'descartado' ? 'outline' : 'default'}
          size="sm"
          className="h-8 text-xs"
          disabled={pendiente}
          onClick={() =>
            a === 'descartado' || a === 'resuelto' ? setPidiendo(a) : mover(a)
          }
        >
          {ETIQUETA_ESTADO[a]}
        </Button>
      ))}
      {candidatos.length > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setJuntando(true)}>
          Es el mismo que otro
        </Button>
      )}
    </div>
  )
}
