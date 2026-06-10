'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const NONE = '__none__'

type CampoDef = { key: string; label: string; required?: boolean }
const CAMPOS: CampoDef[] = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'codigo_barras', label: 'Código de barras' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'categoria', label: 'Categoría' },
  { key: 'subcategoria', label: 'Subcategoría' },
  { key: 'laboratorio', label: 'Laboratorio' },
  { key: 'presentacion', label: 'Presentación' },
  { key: 'droga_principal', label: 'Droga principal' },
  { key: 'requiere_receta', label: 'Requiere receta' },
  { key: 'es_psicotropico', label: 'Psicotrópico' },
  { key: 'es_refrigerado', label: 'Refrigerado' },
  { key: 'precio_sugerido', label: 'Precio sugerido' },
  { key: 'precio_costo_promedio', label: 'Costo promedio' },
  { key: 'comision_empleado_pct', label: 'Comisión empleado %' },
  { key: 'stock_minimo_global', label: 'Stock mínimo global' },
]

type ImportResult = {
  insertados: number
  actualizados: number
  omitidos: number
  invalidas: number
  total_archivo: number
}

/** Parser CSV simple con soporte de comillas, comas y CRLF. */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',' || c === ';') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      out.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    out.push(row)
  }
  const filtered = out.filter((r) => r.some((c) => c.trim() !== ''))
  const headers = (filtered.shift() ?? []).map((h) => h.trim())
  return { headers, rows: filtered }
}

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const campo of CAMPOS) {
    const target = norm(campo.key)
    const targetLabel = norm(campo.label)
    const found = headers.find((h) => {
      const nh = norm(h)
      return nh === target || nh === targetLabel || nh.includes(target)
    })
    map[campo.key] = found ?? NONE
  }
  return map
}

export function ImportarClient() {
  const router = useRouter()
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<'skip' | 'actualizar' | 'abortar'>('skip')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function onFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const { headers: h, rows: r } = parseCSV(String(reader.result ?? ''))
      if (h.length === 0) {
        toast.error('El CSV no tiene encabezados.')
        return
      }
      setFileName(file.name)
      setHeaders(h)
      setRows(r)
      setMapping(autoMap(h))
      setResult(null)
    }
    reader.readAsText(file)
  }

  function buildRows(): Record<string, string>[] {
    const idx = (col: string) => headers.indexOf(col)
    return rows.map((r) => {
      const obj: Record<string, string> = {}
      for (const campo of CAMPOS) {
        const col = mapping[campo.key]
        if (col && col !== NONE) {
          const i = idx(col)
          obj[campo.key] = i >= 0 ? (r[i] ?? '').trim() : ''
        }
      }
      return obj
    })
  }

  async function importar() {
    if (mapping.sku === NONE || mapping.nombre === NONE) {
      toast.error('Mapeá al menos SKU y Nombre.')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/catalogo/importar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, rows: buildRows() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Error al importar.')
      setResult(j as ImportResult)
      toast.success('Importación completada.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error al importar.')
    } finally {
      setBusy(false)
    }
  }

  const preview = rows.slice(0, 6)

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50',
          fileName && 'border-primary/40 bg-nora-bg',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
      >
        {fileName ? (
          <>
            <FileSpreadsheet className="size-7 text-primary" />
            <div className="text-sm font-medium">{fileName}</div>
            <div className="text-xs text-muted-foreground">
              {rows.length} filas · {headers.length} columnas · click para cambiar
            </div>
          </>
        ) : (
          <>
            <Upload className="size-7 text-muted-foreground" />
            <div className="text-sm font-medium">Arrastrá un CSV o hacé click</div>
            <div className="text-xs text-muted-foreground">
              La primera fila debe ser el encabezado de columnas
            </div>
          </>
        )}
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
      </label>

      {headers.length > 0 && (
        <>
          {/* Mapeo */}
          <section>
            <h2 className="mb-2 text-sm font-semibold">Mapeo de columnas</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((campo) => (
                <div key={campo.key} className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {campo.label}
                    {campo.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[campo.key] ?? NONE}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [campo.key]: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— sin mapear —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </section>

          {/* Preview */}
          <section>
            <h2 className="mb-2 text-sm font-semibold">Vista previa ({preview.length} de {rows.length})</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    {CAMPOS.filter((c) => mapping[c.key] && mapping[c.key] !== NONE).map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-2 py-1.5 font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildRows().slice(0, 6).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      {CAMPOS.filter((c) => mapping[c.key] && mapping[c.key] !== NONE).map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-2 py-1.5">
                          {r[c.key] || <span className="text-muted-foreground/50">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Conflictos + acción */}
          <section className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Si el SKU ya existe
              </Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger className="h-9 w-[220px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Saltear (no tocar existentes)</SelectItem>
                  <SelectItem value="actualizar">Actualizar existentes</SelectItem>
                  <SelectItem value="abortar">Abortar si hay conflictos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={importar} disabled={busy} size="lg">
              {busy ? 'Importando…' : `Importar ${rows.length} productos`}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </section>
        </>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> Importación completada
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-4">
            <li>Insertados: <b className="text-foreground">{result.insertados}</b></li>
            <li>Actualizados: <b className="text-foreground">{result.actualizados}</b></li>
            <li>Omitidos: <b className="text-foreground">{result.omitidos}</b></li>
            <li>Inválidas: <b className="text-foreground">{result.invalidas}</b></li>
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/admin/configuracion/catalogo">Ver catálogo</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
