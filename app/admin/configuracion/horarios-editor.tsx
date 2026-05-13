'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { AppSettings } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function fmtHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

export default function HorariosEditor({ initial }: { initial: AppSettings }) {
  const router = useRouter()
  const sb = createClient()
  const [open, setOpen] = useState<number>(initial.hora_apertura)
  const [close, setClose] = useState<number>(initial.hora_cierre)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const dirty = open !== initial.hora_apertura || close !== initial.hora_cierre
  const invalid = open >= close

  async function save() {
    setErr(null)
    setMsg(null)
    if (invalid) {
      setErr('La apertura tiene que ser antes del cierre.')
      return
    }
    setBusy(true)
    const { error, data } = await sb
      .from('app_settings')
      .update({ hora_apertura: open, hora_cierre: close })
      .eq('id', 1)
      .select('*')
      .maybeSingle<AppSettings>()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data) {
      setMsg(
        `Guardado. Los pedidos fuera de ${fmtHour(data.hora_apertura)} a ${fmtHour(data.hora_cierre)} quedarán marcados como "fuera de horario".`,
      )
      router.refresh()
      setTimeout(() => setMsg(null), 5000)
    }
  }

  return (
    <div className="space-y-3">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {msg && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Hora de apertura
          </Label>
          <Select value={String(open)} onValueChange={(v) => setOpen(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {fmtHour(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Hora de cierre
          </Label>
          <Select value={String(close)} onValueChange={(v) => setClose(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h === 24 ? '24:00' : fmtHour(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={busy || !dirty || invalid}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando…
            </>
          ) : (
            'Guardar'
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hora local Argentina. Los pedidos que entran fuera de esta franja —sea
        por Woo o manualmente— se marcan con la etiqueta "Fuera de horario" en
        el dashboard.
      </p>
    </div>
  )
}
