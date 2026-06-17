'use client'

import { useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, Camera, Trash2, FileText, Download, Loader2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const BUCKET = 'comprobantes'

type Adjunto = {
  id: string
  nombre: string
  url: string
  tipo_mime: string | null
  tamanio: number | null
  created_at: string
}

/**
 * Adjuntos/comprobantes polimórficos para cualquier entidad (F6-T · T13).
 * Drop-in: <Comprobantes entidadTipo="factura" entidadId={factura.id} />
 */
export function Comprobantes({
  entidadTipo,
  entidadId,
  titulo = 'Comprobantes',
  readOnly = false,
}: {
  entidadTipo: string
  entidadId: string
  titulo?: string
  readOnly?: boolean
}) {
  const sb = createClient()
  const [items, setItems] = useState<Adjunto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await sb
      .from('adjuntos')
      .select('id, nombre, url, tipo_mime, tamanio, created_at')
      .eq('entidad_tipo', entidadTipo)
      .eq('entidad_id', entidadId)
      .order('created_at', { ascending: false })
    setItems((data ?? []) as Adjunto[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadTipo, entidadId])

  async function subir(file: File) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${entidadTipo}/${entidadId}/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { error: insErr } = await sb.from('adjuntos').insert({
        entidad_tipo: entidadTipo,
        entidad_id: entidadId,
        nombre: file.name,
        url: path,
        tipo_mime: file.type || null,
        tamanio: file.size,
      })
      if (insErr) throw new Error(insErr.message)
      toast.success('Comprobante subido.')
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo subir.')
    } finally {
      setUploading(false)
    }
  }

  async function abrir(a: Adjunto) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(a.url, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else toast.error('No se pudo generar el enlace.')
  }

  async function eliminar(a: Adjunto) {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return
    await sb.storage.from(BUCKET).remove([a.url])
    const { error } = await sb.from('adjuntos').delete().eq('id', a.id)
    if (error) { toast.error(error.message); return }
    toast.success('Comprobante eliminado.')
    load()
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Paperclip className="size-3.5" /> {titulo}
          {items.length > 0 && <span className="text-foreground">({items.length})</span>}
        </div>
        {!readOnly && (
          <div className="flex gap-1">
            <input ref={camRef} type="file" accept="image/*" capture={'environment' as any} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f) }} />
            <Button variant="ghost" size="icon" className="size-8 sm:hidden" disabled={uploading} onClick={() => camRef.current?.click()} aria-label="Foto">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </Button>
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir
            </Button>
          </div>
        )}
      </div>

      <div className="p-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin comprobantes. {!readOnly && 'Subí foto o PDF del comprobante.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((a) => {
              const esImg = (a.tipo_mime ?? '').startsWith('image/')
              return (
                <li key={a.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
                  {esImg ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                  <button onClick={() => abrir(a)} className="min-w-0 flex-1 truncate text-left hover:underline">{a.nombre}</button>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtSize(a.tamanio)}</span>
                  <button onClick={() => abrir(a)} aria-label="Ver" className="text-muted-foreground hover:text-foreground"><Download className="size-3.5" /></button>
                  {!readOnly && (
                    <button onClick={() => eliminar(a)} aria-label="Eliminar" className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function fmtSize(b: number | null): string {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
