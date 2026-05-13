'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Star, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { ProveedorCuentaBancaria, TipoCuentaBancaria } from '@/lib/types/admin'

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

type Draft = {
  banco: string
  tipo_cuenta: TipoCuentaBancaria | ''
  cbu: string
  alias: string
  titular: string
  cuit_titular: string
  es_principal: boolean
}

function empty(): Draft {
  return {
    banco: '',
    tipo_cuenta: '',
    cbu: '',
    alias: '',
    titular: '',
    cuit_titular: '',
    es_principal: false,
  }
}

export default function CuentasSection({
  proveedorId,
  initial,
  readOnly,
}: {
  proveedorId: string
  initial: ProveedorCuentaBancaria[]
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
      banco: adding.banco.trim() || null,
      tipo_cuenta: adding.tipo_cuenta || null,
      cbu: adding.cbu.trim() || null,
      alias: adding.alias.trim() || null,
      titular: adding.titular.trim() || null,
      cuit_titular: adding.cuit_titular.replace(/\D/g, '') || null,
      es_principal: adding.es_principal,
    }
    const { data, error } = await sb
      .from('proveedor_cuentas_bancarias')
      .insert(payload)
      .select('*')
      .maybeSingle<ProveedorCuentaBancaria>()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setRows((arr) => [data, ...arr])
    setAdding(null)
    router.refresh()
  }

  async function remove(c: ProveedorCuentaBancaria) {
    if (!confirm('¿Borrar esta cuenta bancaria?')) return
    const { error } = await sb.from('proveedor_cuentas_bancarias').delete().eq('id', c.id)
    if (error) {
      setErr(error.message)
      return
    }
    setRows((arr) => arr.filter((x) => x.id !== c.id))
    router.refresh()
  }

  async function togglePrincipal(c: ProveedorCuentaBancaria) {
    const next = !c.es_principal
    const { error } = await sb
      .from('proveedor_cuentas_bancarias')
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

  if (readOnly && rows.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Cuentas bancarias ({rows.length})
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
                Agregar cuenta
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
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
              <Input
                placeholder="Banco"
                value={adding.banco}
                onChange={(e) => setAdding({ ...adding, banco: e.target.value })}
              />
              <Select
                value={adding.tipo_cuenta || NONE}
                onValueChange={(v) =>
                  setAdding({
                    ...adding,
                    tipo_cuenta: v === NONE ? '' : (v as TipoCuentaBancaria),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de cuenta…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Tipo de cuenta…</SelectItem>
                  <SelectItem value="cuenta_corriente">Cuenta corriente</SelectItem>
                  <SelectItem value="caja_ahorro">Caja de ahorro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
              <Input
                placeholder="CBU (22 dígitos)"
                value={adding.cbu}
                onChange={(e) => setAdding({ ...adding, cbu: e.target.value })}
                className="font-mono"
              />
              <Input
                placeholder="Alias"
                value={adding.alias}
                onChange={(e) => setAdding({ ...adding, alias: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
              <Input
                placeholder="Titular"
                value={adding.titular}
                onChange={(e) => setAdding({ ...adding, titular: e.target.value })}
              />
              <Input
                placeholder="CUIT titular"
                value={adding.cuit_titular}
                onChange={(e) => setAdding({ ...adding, cuit_titular: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={adding.es_principal}
                  onCheckedChange={(v) =>
                    setAdding({ ...adding, es_principal: Boolean(v) })
                  }
                />
                Cuenta principal (la usada por defecto para pagos)
              </label>
              <Button onClick={add} disabled={busy} size="sm">
                {busy ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding && (
          <div className="text-sm text-muted-foreground">
            Sin cuentas bancarias cargadas.
          </div>
        )}

        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {c.banco || '(sin banco)'}
                  {c.es_principal && (
                    <Badge variant="success" className="gap-1">
                      <Star className="size-3" />
                      Principal
                    </Badge>
                  )}
                  {c.tipo_cuenta && (
                    <span className="text-xs font-normal text-muted-foreground">
                      · {c.tipo_cuenta === 'cuenta_corriente' ? 'CC' : 'CA'}
                    </span>
                  )}
                </div>
                {(c.cbu || c.alias) && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {c.cbu && <span className="font-mono">CBU {c.cbu}</span>}
                    {c.cbu && c.alias && <span>·</span>}
                    {c.alias && <span>{c.alias}</span>}
                  </div>
                )}
                {(c.titular || c.cuit_titular) && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.titular || '—'}
                    {c.cuit_titular ? ` · CUIT ${c.cuit_titular}` : ''}
                  </div>
                )}
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
