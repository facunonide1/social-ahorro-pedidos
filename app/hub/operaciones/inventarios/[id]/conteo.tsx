'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Search } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type ConteoRow = {
  producto_id: string
  nombre: string
  codigo: string | null
  stock_sistema: number
  stock_contado: number | null
}

export default function Conteo({
  inventarioId,
  rows,
}: {
  inventarioId: string
  rows: ConteoRow[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [contados, setContados] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.producto_id,
        r.stock_contado != null ? String(r.stock_contado) : '',
      ]),
    ),
  )
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<'save' | 'close' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(term) ||
        (r.codigo ?? '').toLowerCase().includes(term),
    )
  }, [q, rows])

  const stats = useMemo(() => {
    let contadosN = 0
    let difs = 0
    for (const r of rows) {
      const raw = contados[r.producto_id]
      if (raw === undefined || raw === '') continue
      const val = Number(raw)
      if (Number.isNaN(val)) continue
      contadosN++
      if (val - r.stock_sistema !== 0) difs++
    }
    return { contadosN, difs }
  }, [contados, rows])

  function buildPayload() {
    const payload: {
      inventario_id: string
      producto_id: string
      stock_sistema: number
      stock_contado: number
    }[] = []
    for (const r of rows) {
      const raw = contados[r.producto_id]
      if (raw === undefined || raw === '') continue
      const val = Number(raw)
      if (Number.isNaN(val)) continue
      payload.push({
        inventario_id: inventarioId,
        producto_id: r.producto_id,
        stock_sistema: r.stock_sistema,
        stock_contado: val,
      })
    }
    return payload
  }

  async function guardar() {
    setErr(null)
    setBusy('save')
    const payload = buildPayload()
    const { error } = await sb
      .from('inventario_items')
      .upsert(payload, { onConflict: 'inventario_id,producto_id' })
    setBusy(null)
    if (error) {
      setErr(error.message)
      return
    }
    router.refresh()
  }

  async function cerrar() {
    setErr(null)
    if (
      !confirm(
        'Cerrar el inventario ajusta el stock de la sucursal a las cantidades contadas y no se puede deshacer. ¿Confirmás?',
      )
    ) {
      return
    }
    setBusy('close')
    // primero persistimos el conteo, después cerramos atómicamente
    const payload = buildPayload()
    const { error: upErr } = await sb
      .from('inventario_items')
      .upsert(payload, { onConflict: 'inventario_id,producto_id' })
    if (upErr) {
      setBusy(null)
      setErr(upErr.message)
      return
    }
    const res = await fetch('/api/inventario/cerrar-inventario', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inventario_id: inventarioId }),
    })
    const j = await res.json()
    setBusy(null)
    if (!res.ok) {
      setErr(j?.error || 'No se pudo cerrar')
      return
    }
    router.refresh()
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Conteo · {stats.contadosN}/{rows.length} contados ·{' '}
            {stats.difs} diferencia{stats.difs === 1 ? '' : 's'}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={guardar}
            >
              {busy === 'save' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar conteo
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy !== null || stats.contadosN === 0}
              onClick={cerrar}
            >
              {busy === 'close' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              Cerrar y ajustar stock
            </Button>
          </div>
        </div>
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Sistema</TableHead>
              <TableHead className="w-[120px] text-right">Contado</TableHead>
              <TableHead className="text-right">Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  La sucursal no tiene productos con stock cargado. Cargá stock
                  primero desde Operaciones → Stock.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Sin resultados para “{q}”.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const raw = contados[r.producto_id] ?? ''
                const val = raw === '' ? null : Number(raw)
                const dif =
                  val == null || Number.isNaN(val) ? null : val - r.stock_sistema
                return (
                  <TableRow key={r.producto_id}>
                    <TableCell className="font-medium">
                      {r.nombre}
                      {r.codigo && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.codigo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.stock_sistema.toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) =>
                          setContados((prev) => ({
                            ...prev,
                            [r.producto_id]: e.target.value,
                          }))
                        }
                        className="h-8 text-right tabular-nums"
                        placeholder="—"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dif == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : dif === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <span
                          className={
                            dif > 0
                              ? 'font-semibold text-emerald-600'
                              : 'font-semibold text-destructive'
                          }
                        >
                          {dif > 0 ? '+' : ''}
                          {dif.toLocaleString('es-AR')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
