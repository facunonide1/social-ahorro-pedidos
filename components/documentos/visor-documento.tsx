'use client'

import { useState } from 'react'
import { RotateCw, ZoomIn, ZoomOut, ExternalLink, ImageOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Visor del documento original, con zoom y rotación.
 *
 * La foto tiene que estar al lado de los campos: quien revisa compara contra el
 * papel, no contra su memoria. Las fotos de mostrador vienen torcidas, de ahí
 * la rotación.
 */
export function VisorDocumento({ url, esPdf }: { url: string | null; esPdf: boolean }) {
  const [zoom, setZoom] = useState(1)
  const [giro, setGiro] = useState(0)

  if (!url) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
        <ImageOff className="size-7" />
        <span className="text-sm">No pude cargar el archivo original.</span>
      </div>
    )
  }

  if (esPdf) {
    return (
      <div className="flex flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">PDF original</span>
          <Button asChild size="sm" variant="ghost" className="ml-auto h-7">
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Abrir</a>
          </Button>
        </div>
        <object data={url} type="application/pdf" className="h-[60vh] w-full lg:h-[calc(100vh-16rem)]">
          <div className="p-6 text-sm text-muted-foreground">
            Tu navegador no muestra PDF acá. <a href={url} target="_blank" rel="noreferrer" className="underline">Abrilo en otra pestaña</a>.
          </div>
        </object>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} title="Alejar"><ZoomOut className="size-3.5" /></Button>
        <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} title="Acercar"><ZoomIn className="size-3.5" /></Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setGiro((g) => (g + 90) % 360)} title="Rotar"><RotateCw className="size-3.5" /></Button>
        <Button asChild size="sm" variant="ghost" className="ml-auto h-7">
          <a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Original</a>
        </Button>
      </div>
      <div className="h-[50vh] overflow-auto bg-muted/30 lg:h-[calc(100vh-16rem)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Documento original"
          className="mx-auto origin-center transition-transform duration-150"
          style={{ transform: `scale(${zoom}) rotate(${giro}deg)` }}
        />
      </div>
    </div>
  )
}
