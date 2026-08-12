'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Loader2, SkipForward } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Item = {
  id: string
  sku: string | null
  descripcion: string
  unidad: string | null
  orden: number
  cantidad: number | null
  nota: string | null
  salteado: boolean
  motivoSalteo: string | null
}

/**
 * CONTAR UNA ZONA, DESDE EL TELÉFONO.
 *
 * Quien cuenta está parado frente a una góndola con el teléfono en una mano y
 * la otra en el estante. Un item por pantalla, el número grande, y el teclado
 * numérico que abre solo.
 *
 * ── ACÁ NO HAY NINGÚN INDICIO DE LO QUE EL SISTEMA ESPERA ──────────────────
 *
 * Ni el número, ni un color, ni un "ojo, revisá este". Si ve que el sistema
 * dice 40, escribe 40 — es el mismo motivo por el que el arqueo de caja es
 * ciego. Y no depende de que esta pantalla se porte bien: la API no lo manda.
 *
 * ── SE GUARDA A MEDIDA ─────────────────────────────────────────────────────
 *
 * Cada renglón se guarda al pasar al siguiente. Si se corta la señal en el
 * pasillo del fondo o entra una llamada, lo contado hasta ahí está.
 */
export default function ContarClient({
  conteoId,
  zona,
  items: itemsIniciales,
}: {
  conteoId: string
  zona: string
  items: Item[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(itemsIniciales)
  const [i, setI] = useState(() => {
    const pendiente = itemsIniciales.findIndex((x) => x.cantidad === null && !x.salteado)
    return pendiente === -1 ? 0 : pendiente
  })
  const [valor, setValor] = useState('')
  const [nota, setNota] = useState('')
  const [motivoSalteo, setMotivoSalteo] = useState('')
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  const item = items[i]
  const listos = useMemo(() => items.filter((x) => x.cantidad !== null || x.salteado).length, [items])
  const faltan = items.length - listos

  useEffect(() => {
    if (!item) return
    setValor(item.cantidad === null ? '' : String(item.cantidad))
    setNota(item.nota ?? '')
    setMotivoSalteo(item.motivoSalteo ?? '')
    setPidiendoMotivo(false)
  }, [i, item])

  async function guardar(payload: {
    cantidad?: number | null
    salteado?: boolean
    motivoSalteo?: string | null
  }) {
    setGuardando(true)
    try {
      const res = await fetch(`/api/conteo/conteos/${conteoId}/renglon`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listaItemId: item.id, nota: nota.trim() || null, ...payload }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error ?? 'No se pudo guardar')
        return false
      }
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                cantidad: payload.salteado ? null : (payload.cantidad ?? null),
                salteado: payload.salteado ?? false,
                motivoSalteo: payload.motivoSalteo ?? null,
                nota: nota.trim() || null,
              }
            : x,
        ),
      )
      return true
    } catch {
      toast.error('No se pudo guardar. Fijate la señal.')
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function confirmar() {
    const n = Number(valor.replace(',', '.'))
    if (valor.trim() === '' || Number.isNaN(n) || n < 0) {
      toast.error('Poné cuántas hay. Si no podés contarlo, saltealo con el motivo.')
      return
    }
    if (await guardar({ cantidad: n })) avanzar()
  }

  async function saltear() {
    if (!pidiendoMotivo) {
      setPidiendoMotivo(true)
      return
    }
    if (!motivoSalteo.trim()) {
      toast.error('Decí por qué lo salteás: un salteo en silencio no se distingue de un cero.')
      return
    }
    if (await guardar({ salteado: true, motivoSalteo: motivoSalteo.trim() })) avanzar()
  }

  function avanzar() {
    const siguiente = items.findIndex((x, idx) => idx > i && x.cantidad === null && !x.salteado)
    setI(siguiente === -1 ? Math.min(i + 1, items.length - 1) : siguiente)
  }

  async function cerrar() {
    setCerrando(true)
    try {
      const res = await fetch(`/api/conteo/conteos/${conteoId}/cerrar`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error ?? 'No se pudo cerrar')
        return
      }
      router.push(`/admin/operaciones/conteos/${conteoId}`)
      router.refresh()
    } catch {
      toast.error('No se pudo cerrar el conteo.')
    } finally {
      setCerrando(false)
    }
  }

  if (!item) return null

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-3 p-4">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">{zona}</p>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {listos} de {items.length} contados
          </p>
          <p className="text-xs text-muted-foreground">item {item.orden}</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.round((listos / Math.max(items.length, 1)) * 100)}%` }}
          />
        </div>
      </header>

      <Card className="flex-1 space-y-4 p-4">
        <div>
          <p className="text-lg font-semibold leading-tight">{item.descripcion}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {item.sku ?? 'sin SKU'}
            {item.unidad ? ` · ${item.unidad}` : ''}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cant">¿Cuántas hay?</Label>
          <Input
            id="cant"
            type="number"
            inputMode="decimal"
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmar()
            }}
            className="h-16 text-center text-3xl font-semibold"
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nota" className="text-xs">
            ¿Algo para anotar? (opcional)
          </Label>
          <Textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="estaba en el otro estante · hay 3 rotos"
          />
        </div>

        {pidiendoMotivo ? (
          <div className="space-y-1.5">
            <Label htmlFor="motivo" className="text-xs">
              ¿Por qué lo salteás?
            </Label>
            <Input
              id="motivo"
              value={motivoSalteo}
              onChange={(e) => setMotivoSalteo(e.target.value)}
              placeholder="no lo encontré · está en el depósito"
            />
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button className="flex-1" size="lg" onClick={confirmar} disabled={guardando}>
            {guardando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
            Listo
          </Button>
          <Button variant="outline" size="lg" onClick={saltear} disabled={guardando}>
            <SkipForward className="mr-2 size-4" />
            {pidiendoMotivo ? 'Saltear' : 'Saltear'}
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          <ChevronLeft className="mr-1 size-4" />
          Anterior
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setI(Math.min(items.length - 1, i + 1))}
          disabled={i === items.length - 1}
        >
          Siguiente
          <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>

      <Card className="space-y-2 p-4">
        {faltan > 0 ? (
          <p className="text-sm text-muted-foreground">
            Faltan {faltan}. La zona se cierra cuando estén todos contados o salteados
            con motivo.
          </p>
        ) : (
          <p className="text-sm">
            Están los {items.length}. Al cerrar vas a ver las diferencias — antes no,
            para que lo que contaste sea lo que viste.
          </p>
        )}
        <Button className="w-full" size="lg" onClick={cerrar} disabled={faltan > 0 || cerrando}>
          {cerrando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Cerrar la zona y ver las diferencias
        </Button>
      </Card>
    </div>
  )
}
