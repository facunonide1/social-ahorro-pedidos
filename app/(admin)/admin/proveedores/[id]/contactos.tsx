'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, MessageCircle, Phone, Plus, Star, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { ContactoRol, ProveedorContacto } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

const ROLES: { value: ContactoRol; label: string }[] = [
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'cobranzas', label: 'Cobranzas' },
  { value: 'logistica', label: 'Logística' },
  { value: 'gerencia', label: 'Gerencia' },
  { value: 'otro', label: 'Otro' },
]

type Draft = {
  nombre: string
  rol: ContactoRol | ''
  telefono: string
  email: string
  whatsapp: string
  es_principal: boolean
}

function empty(): Draft {
  return { nombre: '', rol: '', telefono: '', email: '', whatsapp: '', es_principal: false }
}

export default function ContactosSection({
  proveedorId,
  initial,
  readOnly,
}: {
  proveedorId: string
  initial: ProveedorContacto[]
  readOnly: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [rows, setRows] = useState(initial)
  const [adding, setAdding] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    if (!adding) return
    setBusy(true)
    setErr(null)
    const payload = {
      proveedor_id: proveedorId,
      nombre: adding.nombre.trim() || null,
      rol: adding.rol || null,
      telefono: adding.telefono.trim() || null,
      email: adding.email.trim().toLowerCase() || null,
      whatsapp: adding.whatsapp.trim() || null,
      es_principal: adding.es_principal,
    }
    const { data, error } = await sb
      .from('proveedor_contactos')
      .insert(payload)
      .select('*')
      .maybeSingle<ProveedorContacto>()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setRows((arr) => [data, ...arr])
    setAdding(null)
    router.refresh()
  }

  async function remove(c: ProveedorContacto) {
    if (!confirm('¿Borrar este contacto?')) return
    const { error } = await sb.from('proveedor_contactos').delete().eq('id', c.id)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((arr) => arr.filter((x) => x.id !== c.id))
    router.refresh()
  }

  async function togglePrincipal(c: ProveedorContacto) {
    const next = !c.es_principal
    const { error } = await sb
      .from('proveedor_contactos')
      .update({ es_principal: next })
      .eq('id', c.id)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((arr) =>
      arr.map((x) => (x.id === c.id ? { ...x, es_principal: next } : x)),
    )
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Contactos ({rows.length})
        </CardTitle>
        {!readOnly && (
          <Button
            size="sm"
            variant={adding ? 'outline' : 'default'}
            onClick={() => setAdding(adding ? null : empty())}
          >
            {adding ? (
              'Cancelar'
            ) : (
              <>
                <Plus className="size-4" />
                Agregar
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        {adding && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
              <Input
                placeholder="Nombre"
                value={adding.nombre}
                onChange={(e) => setAdding({ ...adding, nombre: e.target.value })}
              />
              <Select
                value={adding.rol || NONE}
                onValueChange={(v) =>
                  setAdding({ ...adding, rol: v === NONE ? '' : (v as ContactoRol) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rol…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Rol…</SelectItem>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                placeholder="Teléfono"
                value={adding.telefono}
                onChange={(e) => setAdding({ ...adding, telefono: e.target.value })}
              />
              <Input
                placeholder="WhatsApp"
                value={adding.whatsapp}
                onChange={(e) => setAdding({ ...adding, whatsapp: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={adding.email}
                onChange={(e) => setAdding({ ...adding, email: e.target.value })}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={adding.es_principal}
                  onCheckedChange={(v) => setAdding({ ...adding, es_principal: Boolean(v) })}
                />
                Contacto principal
              </label>
              <Button onClick={add} disabled={busy} size="sm">
                {busy ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding && (
          <div className="text-sm text-muted-foreground">Sin contactos cargados.</div>
        )}

        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {c.nombre || '(sin nombre)'}
                  {c.es_principal && (
                    <Badge variant="success" className="gap-1">
                      <Star className="size-3" />
                      Principal
                    </Badge>
                  )}
                  {c.rol && (
                    <Badge variant="info" className="capitalize">
                      {c.rol}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {c.telefono && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" />
                      {c.telefono}
                    </span>
                  )}
                  {c.whatsapp && (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3" />
                      {c.whatsapp}
                    </span>
                  )}
                  {c.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3" />
                      {c.email}
                    </span>
                  )}
                  {!c.telefono && !c.whatsapp && !c.email && '—'}
                </div>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => togglePrincipal(c)}
                  >
                    {c.es_principal ? 'Quitar principal' : 'Marcar principal'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => remove(c)}
                    aria-label="Borrar"
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
