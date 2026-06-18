'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Upload, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type {
  CuentaBancariaPropia,
  ExtractoLineaPendiente,
} from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type ParsedLine = {
  fecha: string
  monto: number
  descripcion: string
  referencia: string
}

/**
 * Parser de CSV genérico. Espera columnas fecha,monto,descripcion[,referencia]
 * con header en la primera fila. Soporta separador `,` o `;`.
 */
function parseCsv(text: string): { lines: ParsedLine[]; error: string | null } {
  const rows = text.trim().split(/\r?\n/)
  if (rows.length < 2) return { lines: [], error: 'El archivo está vacío o sin filas.' }
  const sep = rows[0].includes(';') ? ';' : ','
  const header = rows[0].toLowerCase().split(sep).map((h) => h.trim())
  const iFecha = header.findIndex((h) => h.includes('fecha'))
  const iMonto = header.findIndex((h) => h.includes('monto') || h.includes('importe'))
  const iDesc = header.findIndex(
    (h) => h.includes('desc') || h.includes('detalle') || h.includes('concepto'),
  )
  const iRef = header.findIndex((h) => h.includes('ref') || h.includes('comprobante'))
  if (iFecha < 0 || iMonto < 0) {
    return {
      lines: [],
      error: 'El CSV necesita al menos columnas "fecha" y "monto".',
    }
  }
  const lines: ParsedLine[] = []
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r].split(sep)
    if (cols.length < 2) continue
    const fechaRaw = (cols[iFecha] ?? '').trim()
    const montoRaw = (cols[iMonto] ?? '').trim().replace(/\./g, '').replace(',', '.')
    const monto = Number(montoRaw)
    if (!fechaRaw || !Number.isFinite(monto)) continue
    // Normaliza dd/mm/yyyy → yyyy-mm-dd
    let fecha = fechaRaw
    const m = fechaRaw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    if (m) {
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
      fecha = `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    lines.push({
      fecha,
      monto,
      descripcion: iDesc >= 0 ? (cols[iDesc] ?? '').trim() : '',
      referencia: iRef >= 0 ? (cols[iRef] ?? '').trim() : '',
    })
  }
  return { lines, error: lines.length === 0 ? 'No se pudo parsear ninguna fila.' : null }
}

export default function ConciliacionClient({
  cuentas,
  cuentaIdActiva,
  lineasIniciales,
}: {
  cuentas: CuentaBancariaPropia[]
  cuentaIdActiva: string
  lineasIniciales: ExtractoLineaPendiente[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [lineas, setLineas] = useState(lineasIniciales)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function cambiarCuenta(id: string) {
    router.push(`/hub/finanzas/conciliacion?cuenta=${id}`)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setMsg(null)
    const text = await file.text()
    const { lines, error } = parseCsv(text)
    if (error) {
      setErr(error)
      e.target.value = ''
      return
    }
    setBusy(true)
    const payload = lines.map((l) => ({
      cuenta_bancaria_id: cuentaIdActiva,
      fecha: l.fecha,
      monto: l.monto,
      descripcion: l.descripcion || null,
      referencia: l.referencia || null,
      estado: 'pendiente' as const,
    }))
    const { data, error: insErr } = await sb
      .from('extracto_lineas_pendientes')
      .insert(payload)
      .select('*')
    setBusy(false)
    e.target.value = ''
    if (insErr) {
      setErr(insErr.message)
      return
    }
    setLineas((arr) => [...((data ?? []) as ExtractoLineaPendiente[]), ...arr])
    setMsg(`${lines.length} líneas importadas del extracto.`)
    setTimeout(() => setMsg(null), 4000)
  }

  async function resolver(
    l: ExtractoLineaPendiente,
    estado: 'conciliado' | 'ignorado',
  ) {
    const { error } = await sb
      .from('extracto_lineas_pendientes')
      .update({ estado })
      .eq('id', l.id)
    if (error) {
      setErr(error.message)
      return
    }
    setLineas((arr) => arr.filter((x) => x.id !== l.id))
    if (estado === 'conciliado') router.refresh()
  }

  return (
    <div className="space-y-4">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {msg && (
        <Alert variant="success">
          <Check className="size-4" />
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Cuenta y extracto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Cuenta bancaria
              </Label>
              <Select value={cuentaIdActiva} onValueChange={cambiarCuenta}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre} · {c.banco}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Subir extracto (CSV)
              </Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                disabled={busy}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <Upload className="mr-1 inline size-3" />
            El CSV necesita header con columnas <code>fecha</code> y{' '}
            <code>monto</code> (opcionales: <code>descripcion</code>,{' '}
            <code>referencia</code>). Soporta separador <code>,</code> o{' '}
            <code>;</code> y fechas <code>dd/mm/yyyy</code>.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Líneas pendientes de conciliar ({lineas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="w-[160px] text-center">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Sin líneas pendientes. Subí un extracto para empezar.
                  </TableCell>
                </TableRow>
              ) : (
                lineas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(l.fecha).toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">
                      {l.descripcion || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.referencia || '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        l.monto < 0 ? 'text-destructive' : 'text-success',
                      )}
                    >
                      ${Number(l.monto).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resolver(l, 'conciliado')}
                          className="text-success hover:text-success"
                        >
                          <Check className="size-3.5" />
                          Conciliar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => resolver(l, 'ignorado')}
                          aria-label="Ignorar"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {busy && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Importando…
          </span>
        )}{' '}
        MVP de conciliación: marca manual. El matching automático contra
        movimientos del sistema queda como mejora futura (ver{' '}
        <code>docs/ERP-PROGRESO.md</code>).
      </p>
    </div>
  )
}
