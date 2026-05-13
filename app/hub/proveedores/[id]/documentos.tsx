'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText, Plus, X } from 'lucide-react'

import type { ProveedorDocumento, ProveedorDocumentoTipo } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const TIPOS: { value: ProveedorDocumentoTipo; label: string }[] = [
  { value: 'constancia_cuit', label: 'Constancia CUIT' },
  { value: 'certificado_iibb', label: 'Certificado IIBB' },
  { value: 'convenio', label: 'Convenio' },
  { value: 'lista_precios', label: 'Lista de precios' },
  { value: 'otro', label: 'Otro' },
]

type AddingState = {
  tipo: ProveedorDocumentoTipo
  nombre: string
  fecha_vencimiento: string
  file: File | null
}

function emptyAdding(): AddingState {
  return { tipo: 'constancia_cuit', nombre: '', fecha_vencimiento: '', file: null }
}

type VencimientoBadge = {
  text: string
  variant: 'destructive' | 'warning' | 'success'
}

function vencimientoBadge(d: ProveedorDocumento): VencimientoBadge | null {
  if (!d.fecha_vencimiento) return null
  const days = Math.floor(
    (new Date(d.fecha_vencimiento).getTime() - Date.now()) / 86400000,
  )
  if (days < 0)
    return { text: `Vencido hace ${-days} días`, variant: 'destructive' }
  if (days <= 30) return { text: `Vence en ${days} días`, variant: 'warning' }
  return {
    text: `Vence ${new Date(d.fecha_vencimiento).toLocaleDateString('es-AR')}`,
    variant: 'success',
  }
}

export default function DocumentosSection({
  proveedorId,
  initial,
  readOnly,
}: {
  proveedorId: string
  initial: ProveedorDocumento[]
  readOnly: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState(initial)
  const [adding, setAdding] = useState<AddingState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function upload() {
    if (!adding?.file) return
    setBusy(true)
    setErr(null)
    const fd = new FormData()
    fd.append('file', adding.file)
    fd.append('tipo', adding.tipo)
    if (adding.nombre.trim()) fd.append('nombre', adding.nombre.trim())
    if (adding.fecha_vencimiento)
      fd.append('fecha_vencimiento', adding.fecha_vencimiento)
    try {
      const res = await fetch(`/api/hub/proveedores/${proveedorId}/documentos`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      if (json.doc) setRows((arr) => [json.doc, ...arr])
      setAdding(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(false)
    }
  }

  async function remove(d: ProveedorDocumento) {
    if (!confirm(`¿Borrar "${d.nombre || 'documento'}"?`)) return
    const res = await fetch(
      `/api/hub/proveedores/${proveedorId}/documentos/${d.id}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j?.error || 'error')
      return
    }
    setRows((arr) => arr.filter((x) => x.id !== d.id))
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Documentos ({rows.length})
        </CardTitle>
        {!readOnly && (
          <Button
            size="sm"
            variant={adding ? 'outline' : 'default'}
            onClick={() => setAdding(adding ? null : emptyAdding())}
          >
            {adding ? (
              'Cancelar'
            ) : (
              <>
                <Plus className="size-4" />
                Subir documento
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
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
              <Select
                value={adding.tipo}
                onValueChange={(v) =>
                  setAdding({ ...adding, tipo: v as ProveedorDocumentoTipo })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Nombre visible (opcional)"
                value={adding.nombre}
                onChange={(e) => setAdding({ ...adding, nombre: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Fecha de vencimiento (opcional)
                </Label>
                <Input
                  type="date"
                  value={adding.fecha_vencimiento}
                  onChange={(e) =>
                    setAdding({ ...adding, fecha_vencimiento: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Archivo (PDF, imagen, etc.)
                </Label>
                <Input
                  ref={fileRef}
                  type="file"
                  onChange={(e) =>
                    setAdding({
                      ...adding,
                      file: e.target.files?.[0] ?? null,
                    })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={upload} disabled={busy || !adding.file} size="sm">
                {busy ? 'Subiendo…' : 'Subir'}
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding && (
          <div className="text-sm text-muted-foreground">
            Sin documentos cargados.
          </div>
        )}

        <div className="space-y-2">
          {rows.map((d) => {
            const venc = vencimientoBadge(d)
            return (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <FileText className="size-3.5 text-muted-foreground" />
                    {d.nombre || 'documento'}
                    <Badge variant="info">
                      {TIPOS.find((t) => t.value === d.tipo)?.label || d.tipo}
                    </Badge>
                    {venc && <Badge variant={venc.variant}>{venc.text}</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Subido el {new Date(d.created_at).toLocaleString('es-AR')}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`/api/hub/proveedores/${proveedorId}/documentos/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir
                    </a>
                  </Button>
                  {!readOnly && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => remove(d)}
                      aria-label="Borrar"
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
