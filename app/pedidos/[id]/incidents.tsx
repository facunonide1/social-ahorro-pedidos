'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Plus, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { INCIDENT_LABELS } from '@/lib/types'
import type { IncidentType, OrderIncident, UserPedidos } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const INCIDENT_TYPES: IncidentType[] = [
  'cliente_ausente',
  'direccion_incorrecta',
  'sin_stock',
  'dano_entrega',
  'otro',
]

export default function IncidentsSection({
  orderId,
  initialIncidents,
  users,
}: {
  orderId: string
  initialIncidents: OrderIncident[]
  users: Pick<UserPedidos, 'id' | 'name' | 'email'>[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [rows, setRows] = useState(initialIncidents)
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<IncidentType>('cliente_ausente')
  const [descripcion, setDescripcion] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const userMap = new Map(users.map((u) => [u.id, u.name || u.email]))

  async function save() {
    setBusy(true)
    setErr(null)
    const { data, error } = await sb
      .from('order_incidents')
      .insert({
        order_id: orderId,
        tipo,
        descripcion: descripcion.trim() || null,
      })
      .select('*')
      .maybeSingle<OrderIncident>()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setRows((arr) => [data, ...arr])
    setTipo('cliente_ausente')
    setDescripcion('')
    setOpen(false)
    router.refresh()
  }

  async function remove(inc: OrderIncident) {
    if (!confirm('¿Borrar esta incidencia?')) return
    const { error } = await sb.from('order_incidents').delete().eq('id', inc.id)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((arr) => arr.filter((x) => x.id !== inc.id))
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Incidencias
          {rows.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {rows.length}
            </Badge>
          )}
        </CardTitle>
        <Button
          onClick={() => setOpen((v) => !v)}
          variant={open ? 'outline' : 'destructive'}
          size="sm"
        >
          {open ? (
            <>
              <X className="size-4" />
              Cancelar
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Registrar
            </>
          )}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {err && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        {open && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Tipo
              </Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as IncidentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {INCIDENT_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Descripción (opcional)
              </Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={3}
                placeholder="Contexto adicional: qué pasó, qué producto faltaba, etc."
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={save}
                disabled={busy}
                variant="destructive"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Registrar incidencia'
                )}
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin incidencias registradas.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((inc) => (
              <div
                key={inc.id}
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                    {INCIDENT_LABELS[inc.tipo]}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(inc.created_at).toLocaleString('es-AR')}
                    {inc.registrado_by &&
                      userMap.has(inc.registrado_by) &&
                      ` · ${userMap.get(inc.registrado_by)}`}
                  </span>
                </div>
                {inc.descripcion && (
                  <div className="mt-2 whitespace-pre-wrap text-sm">{inc.descripcion}</div>
                )}
                <div className="mt-2 flex justify-end">
                  <Button
                    onClick={() => remove(inc)}
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1 text-xs text-destructive hover:text-destructive"
                  >
                    Borrar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
