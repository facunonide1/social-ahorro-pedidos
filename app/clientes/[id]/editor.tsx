'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { formatAddress } from '@/lib/address'
import type { Customer } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Draft = {
  name: string
  phone: string
  email: string
  dni: string
  tagsRaw: string
  notes: string
}

function draftFrom(c: Customer): Draft {
  return {
    name: c.name ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    dni: c.dni ?? '',
    tagsRaw: (c.tags ?? []).join(', '),
    notes: c.notes ?? '',
  }
}

export default function CustomerEditor({ customer }: { customer: Customer }) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(draftFrom(customer))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const original = draftFrom(customer)
  const dirty =
    draft.name !== original.name ||
    draft.phone !== original.phone ||
    draft.email !== original.email ||
    draft.dni !== original.dni ||
    draft.tagsRaw !== original.tagsRaw ||
    draft.notes !== original.notes

  async function save() {
    setBusy(true)
    setErr(null)
    setMsg(null)
    const tags = draft.tagsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const { error } = await sb
      .from('customers')
      .update({
        name: draft.name.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim().toLowerCase() || null,
        dni: draft.dni.trim() || null,
        tags,
        notes: draft.notes.trim() || null,
      })
      .eq('id', customer.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setMsg('Guardado.')
    router.refresh()
    setTimeout(() => setMsg(null), 3500)
  }

  const addrText = formatAddress(customer.address as Parameters<typeof formatAddress>[0])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Datos del cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Nombre
            </Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              DNI
            </Label>
            <Input
              value={draft.dni}
              onChange={(e) => setDraft({ ...draft, dni: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Teléfono
            </Label>
            <Input
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tags (separados por coma)
          </Label>
          <Input
            value={draft.tagsRaw}
            onChange={(e) => setDraft({ ...draft, tagsRaw: e.target.value })}
            placeholder="vip, pami, tercera edad"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Notas internas
          </Label>
          <Textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            rows={3}
            placeholder="Observaciones visibles solo para el equipo del CRM"
          />
        </div>

        {addrText && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Última dirección registrada
            </Label>
            <div className="mt-1 text-sm">{addrText}</div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
