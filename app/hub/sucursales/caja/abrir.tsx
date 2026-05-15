'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function AbrirCajaButton({
  sucursales,
  userId,
}: {
  sucursales: { id: string; nombre: string }[]
  userId: string
}) {
  const router = useRouter()
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sucursalId, setSucursalId] = useState('')
  const [fecha, setFecha] = useState(today)
  const [saldoInicial, setSaldoInicial] = useState('0')

  async function abrir() {
    if (!sucursalId) {
      toast.error('Elegí una sucursal.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('cajas_diarias')
      .insert({
        sucursal_id: sucursalId,
        fecha,
        saldo_inicial: Number(saldoInicial) || 0,
        estado: 'abierta',
        responsable_id: userId,
      })
      .select('id')
      .maybeSingle<{ id: string }>()
    setBusy(false)
    if (error || !data) {
      toast.error(
        error?.code === '23505'
          ? 'Ya hay una caja para esa sucursal y fecha.'
          : error?.message || 'No se pudo abrir la caja.',
      )
      return
    }
    toast.success('Caja abierta.')
    setOpen(false)
    router.push(`/hub/sucursales/caja/${data.id}`)
    router.refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Abrir caja
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="text-sm font-semibold">Abrir caja diaria</div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Sucursal
          </Label>
          <Select value={sucursalId} onValueChange={setSucursalId}>
            <SelectTrigger>
              <SelectValue placeholder="— Elegí —" />
            </SelectTrigger>
            <SelectContent>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
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
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Saldo inicial
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={abrir} disabled={busy} className="w-full">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Abriendo…
            </>
          ) : (
            'Abrir caja'
          )}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
