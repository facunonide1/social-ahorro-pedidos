'use client'

import * as React from 'react'
import {
  UploadCloud,
  FileText,
  ImageIcon,
  File as FileIcon,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/* ---------- types ---------- */

export type UploadedFile = {
  url: string
  path: string
  name: string
  size: number
  type: string
}

export type ExistingFile = {
  url: string
  path?: string
  name: string
  size?: number
  type?: string
}

export interface AttachmentUploaderProps {
  /**
   * Bucket de Supabase Storage. Tiene que existir y tener policies
   * configuradas. Este componente NO crea buckets ni policies.
   */
  bucket: string
  /** Path dentro del bucket (con `/` final). Ej `proveedor-id/`. */
  folder?: string
  accept?: string
  /** Tamaño máximo por archivo en bytes. Default 10MB. */
  maxSize?: number
  maxFiles?: number
  multiple?: boolean
  onUpload?: (files: UploadedFile[]) => void
  onError?: (err: Error) => void
  existingFiles?: ExistingFile[]
  onRemove?: (file: ExistingFile) => void
  className?: string
}

type UploadingFile = {
  id: string
  name: string
  size: number
  type: string
  progress: number
  error?: string
}

/* ---------- helpers ---------- */

function fmtSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileTypeIcon(type?: string): React.ReactNode {
  if (!type) return <FileIcon className="size-4 text-muted-foreground" />
  if (type.startsWith('image/')) return <ImageIcon className="size-4 text-muted-foreground" />
  if (type === 'application/pdf' || type.includes('pdf')) return <FileText className="size-4 text-muted-foreground" />
  return <FileIcon className="size-4 text-muted-foreground" />
}

function isImage(type?: string) {
  return !!type && type.startsWith('image/')
}

function matchesAccept(type: string, accept: string | undefined): boolean {
  if (!accept) return true
  return accept.split(',').map((s) => s.trim()).some((rule) => {
    if (rule.endsWith('/*')) {
      const family = rule.slice(0, -2)
      return type.startsWith(family + '/')
    }
    return type === rule
  })
}

/* ---------- component ---------- */

/**
 * Drag & drop uploader contra Supabase Storage.
 *
 * Pre-requisitos en Supabase (no se gestionan acá):
 *   1. El bucket `bucket` debe existir.
 *   2. Policies de Storage: el usuario actual debe poder INSERT y
 *      SELECT en `bucket`. Para previews públicos vía `getPublicUrl`,
 *      el bucket tiene que ser `public=true`. Si es privado, usar
 *      signed URLs en el server (no soportado en este componente).
 *
 * @example
 *   <AttachmentUploader
 *     bucket="proveedor-documentos"
 *     folder={`${proveedorId}/`}
 *     accept="image/*,application/pdf"
 *     maxSize={10 * 1024 * 1024}
 *     onUpload={(files) => addAttachments(files)}
 *     existingFiles={attachments}
 *     onRemove={removeAttachment}
 *   />
 */
export function AttachmentUploader({
  bucket,
  folder = '',
  accept,
  maxSize = 10 * 1024 * 1024,
  maxFiles = 10,
  multiple = true,
  onUpload,
  onError,
  existingFiles = [],
  onRemove,
  className,
}: AttachmentUploaderProps) {
  const [dragOver, setDragOver] = React.useState(false)
  const [queue, setQueue] = React.useState<UploadingFile[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)

  const totalCount = existingFiles.length + queue.length
  const limitReached = totalCount >= maxFiles

  function reportError(message: string) {
    const err = new Error(message)
    onError ? onError(err) : console.error('[AttachmentUploader]', message)
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    if (limitReached) {
      reportError(`Ya alcanzaste el máximo de ${maxFiles} archivos.`)
      return
    }
    if (!multiple && files.length > 1) {
      reportError('Solo se permite un archivo.')
      return
    }
    const valid: File[] = []
    for (const f of files) {
      if (totalCount + valid.length >= maxFiles) break
      if (!matchesAccept(f.type, accept)) {
        reportError(`Tipo no permitido: ${f.name} (${f.type || 'desconocido'}).`)
        continue
      }
      if (f.size > maxSize) {
        reportError(`${f.name} supera el límite de ${fmtSize(maxSize)}.`)
        continue
      }
      valid.push(f)
    }
    if (valid.length === 0) return

    const uploads: UploadingFile[] = valid.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      progress: 0,
    }))
    setQueue((q) => [...q, ...uploads])

    const sb = createClient()
    const results: UploadedFile[] = []

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]!
      const meta = uploads[i]!
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const path = `${folder}${Date.now()}-${safeName}`

      // Supabase JS no expone progreso real de upload; marcamos 50%
      // mientras dura y 100% al terminar.
      setQueue((q) => q.map((u) => (u.id === meta.id ? { ...u, progress: 50 } : u)))

      const { data, error } = await sb.storage
        .from(bucket)
        .upload(path, file, { upsert: false, cacheControl: '3600' })

      if (error || !data) {
        setQueue((q) =>
          q.map((u) => (u.id === meta.id ? { ...u, error: error?.message ?? 'Error', progress: 100 } : u)),
        )
        reportError(`No pude subir ${file.name}: ${error?.message ?? 'desconocido'}`)
        continue
      }

      const { data: pub } = sb.storage.from(bucket).getPublicUrl(data.path)
      results.push({
        url: pub.publicUrl,
        path: data.path,
        name: file.name,
        size: file.size,
        type: file.type,
      })

      setQueue((q) => q.filter((u) => u.id !== meta.id))
    }

    if (results.length > 0) onUpload?.(results)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files)
    e.target.value = '' // permite re-upload del mismo archivo
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (limitReached) return
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Subir archivos"
        aria-disabled={limitReached}
        onClick={() => !limitReached && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !limitReached) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!limitReached) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/30 px-4 py-8 text-center transition-colors',
          dragOver && 'border-primary bg-primary/5',
          limitReached && 'cursor-not-allowed opacity-60',
        )}
      >
        <UploadCloud className="size-7 text-muted-foreground" aria-hidden />
        <div className="text-sm font-medium">
          {limitReached
            ? `Alcanzaste el máximo de ${maxFiles} archivos`
            : dragOver
              ? 'Soltá los archivos para subir'
              : 'Arrastrá archivos o hacé click para subir'}
        </div>
        <div className="text-xs text-muted-foreground">
          {accept ? `Aceptados: ${accept}. ` : ''}
          Máx {fmtSize(maxSize)} por archivo · {totalCount}/{maxFiles}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          disabled={limitReached}
        />
      </div>

      {(existingFiles.length > 0 || queue.length > 0) && (
        <ul className="flex flex-col gap-2">
          {existingFiles.map((f, idx) => (
            <li
              key={`exist-${f.path ?? f.url ?? idx}`}
              className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
            >
              {isImage(f.type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.url}
                  alt={f.name}
                  className="size-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                  {fileTypeIcon(f.type)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {f.name}
                </a>
                {f.size != null && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {fmtSize(f.size)}
                  </div>
                )}
              </div>
              {onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${f.name}`}
                  onClick={() => onRemove(f)}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}

          {queue.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                {fileTypeIcon(u.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.name}</div>
                {u.error ? (
                  <div className="text-xs text-destructive">⚠ {u.error}</div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={u.progress} className="h-1.5 flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {u.progress}%
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
