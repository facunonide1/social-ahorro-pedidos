'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

export default function IniciarInventario({
  sucursales,
}: {
  sucursales: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(false)
  const [sucursalId, setSucursalId] = useState('')
  const [fecha, setFecha] = useState(today)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function iniciar() {
    setErr(null)
    if (!sucursalId) {
      setErr('Elegí una sucursal.')
      return
    }
    setBusy(true)
    const { error } = await sb.from('inventarios_fisicos').insert({
      sucursal_id: sucursalId,
      fecha_inventario: fecha,
      estado: 'en_curso',
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setOpen(false)
    setSucursalId('')
    router.refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Iniciar inventario
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="text-sm font-semibold">Nuevo inventario físico</div>
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Sucursal
          </Label>
          <Select
            value={sucursalId || NONE}
            onValueChange={(v) => setSucursalId(v === NONE ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="— Elegí —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Elegí —</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Fecha
          </Label>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <Button onClick={iniciar} disabled={busy} className="w-full" size="sm">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando…
            </>
          ) : (
            'Iniciar'
          )}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
