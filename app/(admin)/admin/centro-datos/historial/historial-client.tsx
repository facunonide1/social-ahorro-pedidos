'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, Undo2, ChevronDown, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Anomalia, ResumenImport, EstadoImportJob, FormatoDatos } from '@/lib/types/centro-datos'

export type ImportRow = {
  id: string; perfil: string; archivo: string | null; sucursal: string | null
  filas_total: number; filas_ok: number; filas_sin_match: number
  anomalias: Anomalia[]; resumen: ResumenImport; estado: EstadoImportJob
  usuario: string | null; created_at: string; revertido_at: string | null
}
export type ExportRow = {
  id: string; nombre: string | null; filas: number; archivo: string | null
  formato: FormatoDatos | null; usuario: string | null; created_at: string
}

const ESTADO_BADGE: Record<EstadoImportJob, { label: string; cls: string }> = {
  preview: { label: 'Preview', cls: 'text-muted-foreground' },
  aplicado: { label: 'Aplicado', cls: 'text-emerald-600' },
  revertido: { label: 'Revertido', cls: 'text-amber-600' },
  error: { label: 'Error', cls: 'text-red-600' },
}

export function HistorialClient({ imports, exports }: { imports: ImportRow[]; exports: ExportRow[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null)

  async function rollback(id: string) {
    if (!confirm('¿Deshacer esta importación? Se restaura el estado anterior (snapshot).')) return
    setRevirtiendo(id)
    try {
      const r = await fetch('/api/centro-datos/rollback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job_id: id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Importación revertida'); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setRevirtiendo(null) }
  }

  return (
    <Tabs defaultValue="import">
      <TabsList>
        <TabsTrigger value="import"><Upload className="size-4" /> Importaciones ({imports.length})</TabsTrigger>
        <TabsTrigger value="export"><Download className="size-4" /> Exportaciones ({exports.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="import" className="mt-3">
        {imports.length === 0 ? <Vacio texto="Sin importaciones todavía." /> : (
          <div className="space-y-2">
            {imports.map((j) => {
              const est = ESTADO_BADGE[j.estado]
              const open = abierto === j.id
              return (
                <div key={j.id} className="rounded-lg border border-border bg-card">
                  <button onClick={() => setAbierto(open ? null : j.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <Upload className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{j.archivo ?? j.perfil}</span>
                        <Badge variant="secondary" className={cn('text-[10px]', est.cls)}>{est.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{j.perfil}{j.sucursal ? ` · ${j.sucursal}` : ''} · {new Date(j.created_at).toLocaleString('es-AR')}{j.usuario ? ` · ${j.usuario}` : ''}</div>
                    </div>
                    <div className="hidden shrink-0 gap-3 text-right text-xs sm:flex">
                      <span><span className="font-medium text-emerald-600">{j.filas_ok}</span> ok</span>
                      {j.filas_sin_match > 0 && <span><span className="font-medium text-amber-600">{j.filas_sin_match}</span> s/match</span>}
                    </div>
                    <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-border px-4 py-3">
                      {j.resumen?.texto && <div className="text-sm">{j.resumen.texto}</div>}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{j.filas_total} filas</span><span>{j.filas_ok} aplicadas</span>
                        {j.filas_sin_match > 0 && <span>{j.filas_sin_match} sin match</span>}
                        {!!j.resumen?.nuevos && <span>{j.resumen.nuevos} nuevos</span>}
                      </div>
                      {j.anomalias.length > 0 && (
                        <div className="space-y-1">
                          {j.anomalias.map((a, i) => {
                            const I = a.severidad === 'critica' ? XCircle : a.severidad === 'warning' ? AlertTriangle : CheckCircle2
                            const c = a.severidad === 'critica' ? 'text-red-600' : a.severidad === 'warning' ? 'text-amber-600' : 'text-emerald-600'
                            return <div key={i} className={cn('flex items-center gap-1.5 text-xs', c)}><I className="size-3.5" /> {a.mensaje}</div>
                          })}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        {j.estado === 'aplicado' && (
                          <Button variant="outline" size="sm" disabled={revirtiendo === j.id} onClick={() => rollback(j.id)}>
                            {revirtiendo === j.id ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />} Deshacer
                          </Button>
                        )}
                        {j.estado === 'revertido' && <span className="text-xs text-amber-600">Revertido el {j.revertido_at ? new Date(j.revertido_at).toLocaleString('es-AR') : ''}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="export" className="mt-3">
        {exports.length === 0 ? <Vacio texto="Sin exportaciones todavía." /> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Acción</th><th className="px-3 py-2">Archivo</th><th className="px-3 py-2">Formato</th><th className="px-3 py-2 text-right">Filas</th><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Fecha</th></tr>
              </thead>
              <tbody>
                {exports.map((j) => (
                  <tr key={j.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{j.nombre ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{j.archivo ?? '—'}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="uppercase text-[10px]">{j.formato ?? 'csv'}</Badge></td>
                    <td className="px-3 py-2 text-right">{j.filas}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{j.usuario ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString('es-AR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

function Vacio({ texto }: { texto: string }) {
  return <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{texto}</div>
}
