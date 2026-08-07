'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Copy, FileText, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatARS } from '@/lib/utils/format'
import {
  DOC_ACCEPT_ATTR,
  DOC_CONCURRENCIA_LOTE,
  DOC_MAX_ARCHIVOS_LOTE,
} from '@/lib/documentos/config'
import { subirDocumentoCliente } from '@/lib/documentos/subir-cliente'

type EstadoItem = 'en_cola' | 'subiendo' | 'leyendo' | 'listo' | 'duplicado' | 'error'

type Item = {
  key: string
  nombre: string
  estado: EstadoItem
  extraccionId: string | null
  mensaje: string | null
  proveedor: string | null
  renglones: number | null
  total: number | null
}

const ETIQUETA: Record<EstadoItem, string> = {
  en_cola: 'En cola',
  subiendo: 'Subiendo',
  leyendo: 'Leyendo',
  listo: 'Listo para revisar',
  duplicado: 'Ya estaba cargada',
  error: 'No se pudo leer',
}

/**
 * Carga en lote.
 *
 * La cola vive en el navegador y procesa de a `DOC_CONCURRENCIA_LOTE`: leer una
 * factura larga es una llamada de decenas de segundos, y disparar veinte juntas
 * agota los límites de la API y deja media tanda en error.
 *
 * Un archivo que falla no frena a los demás: queda marcado y la cola sigue.
 */
export function LoteClient() {
  const [loteId] = useState(() => crypto.randomUUID())
  const [items, setItems] = useState<Item[]>([])
  const [corriendo, setCorriendo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const actualizar = useCallback((key: string, patch: Partial<Item>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }, [])

  const procesarUno = useCallback(
    async (item: Item, file: File) => {
      actualizar(item.key, { estado: 'subiendo' })
      const sub = await subirDocumentoCliente(file, loteId)

      if (sub.estado === 'error') {
        actualizar(item.key, { estado: 'error', mensaje: sub.mensaje })
        return
      }
      if (sub.estado === 'duplicado') {
        actualizar(item.key, { estado: 'duplicado', extraccionId: sub.extraccionId, mensaje: sub.mensaje })
        return
      }

      actualizar(item.key, { estado: 'leyendo', extraccionId: sub.extraccionId })

      try {
        const r = await fetch(`/api/documentos/${sub.extraccionId}/extraer`, { method: 'POST' })
        const j = await r.json().catch(() => null)
        if (!r.ok) {
          actualizar(item.key, { estado: 'error', mensaje: j?.error ?? 'No pude leerla.' })
          return
        }
        actualizar(item.key, {
          estado: 'listo',
          proveedor:
            j.tercero?.estado === 'encontrado'
              ? j.tercero.razonSocial
              : j.datos?.emisor?.nombre ?? null,
          renglones: j.lineas?.length ?? 0,
          total: j.datos?.totales?.total ?? null,
          mensaje: null,
        })
      } catch {
        actualizar(item.key, { estado: 'error', mensaje: 'Se cortó la conexión mientras la leía.' })
      }
    },
    [actualizar, loteId],
  )

  /** Cola con concurrencia fija: N trabajadores tomando del mismo índice. */
  const arrancar = useCallback(
    async (nuevos: { item: Item; file: File }[]) => {
      setCorriendo(true)
      let i = 0
      const trabajador = async () => {
        while (i < nuevos.length) {
          const idx = i++
          await procesarUno(nuevos[idx].item, nuevos[idx].file)
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(DOC_CONCURRENCIA_LOTE, nuevos.length) }, trabajador),
      )
      setCorriendo(false)
    },
    [procesarUno],
  )

  function agregar(files: FileList | File[]) {
    const arr = Array.from(files)
    if (!arr.length) return

    const libres = DOC_MAX_ARCHIVOS_LOTE - items.length
    if (libres <= 0) {
      toast.error(`Ya tenés ${DOC_MAX_ARCHIVOS_LOTE} archivos en esta tanda. Terminá esta y arrancá otra.`)
      return
    }
    const tomar = arr.slice(0, libres)
    if (tomar.length < arr.length) {
      toast.info(`Tomé ${tomar.length} de ${arr.length}: el máximo por tanda es ${DOC_MAX_ARCHIVOS_LOTE}.`)
    }

    const nuevos = tomar.map((f) => ({
      file: f,
      item: {
        key: `${f.name}-${f.size}-${crypto.randomUUID()}`,
        nombre: f.name,
        estado: 'en_cola' as EstadoItem,
        extraccionId: null,
        mensaje: null,
        proveedor: null,
        renglones: null,
        total: null,
      },
    }))

    setItems((xs) => [...xs, ...nuevos.map((n) => n.item)])
    void arrancar(nuevos)
  }

  const listas = items.filter((i) => i.estado === 'listo')
  const conError = items.filter((i) => i.estado === 'error')
  const duplicadas = items.filter((i) => i.estado === 'duplicado')
  const pendientes = items.filter((i) => i.estado === 'en_cola' || i.estado === 'subiendo' || i.estado === 'leyendo')

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files) }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 text-center transition-colors',
          arrastrando ? 'border-primary bg-accent' : 'border-border',
        )}
      >
        <Upload className={cn('size-7', arrastrando ? 'text-primary' : 'text-muted-foreground')} />
        <div className="text-sm font-medium">Arrastrá las facturas acá</div>
        <p className="max-w-md text-xs text-muted-foreground">
          Fotos o PDF, hasta {DOC_MAX_ARCHIVOS_LOTE} por tanda. Se leen de a {DOC_CONCURRENCIA_LOTE} para
          no saturar; podés seguir agregando mientras trabajan.
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={DOC_ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => { const f = e.target.files; e.currentTarget.value = ''; if (f) agregar(f) }}
        />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Elegir archivos</Button>
      </div>

      {!!items.length && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-2.5 text-sm">
            <span className="font-medium">{items.length} archivo{items.length === 1 ? '' : 's'}</span>
            {!!pendientes.length && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {pendientes.length} en proceso
              </span>
            )}
            {!!listas.length && <span className="text-emerald-600 dark:text-emerald-400">{listas.length} listas para revisar</span>}
            {!!duplicadas.length && <span className="text-muted-foreground">{duplicadas.length} ya estaban</span>}
            {!!conError.length && <span className="text-amber-600 dark:text-amber-400">{conError.length} con problema</span>}

            {!!listas.length && !corriendo && (
              <Button asChild size="sm" className="ml-auto">
                <Link href={`/admin/finanzas/documentos/revision/${listas[0].extraccionId}?lote=${loteId}`}>
                  Revisar las {listas.length}
                </Link>
              </Button>
            )}
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((it) => <Fila key={it.key} item={it} loteId={loteId} />)}
          </div>
        </>
      )}
    </div>
  )
}

function Fila({ item, loteId }: { item: Item; loteId: string }) {
  const enProceso = item.estado === 'subiendo' || item.estado === 'leyendo'
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className="shrink-0">
        {enProceso && <Loader2 className="size-4 animate-spin text-primary" />}
        {item.estado === 'en_cola' && <FileText className="size-4 text-muted-foreground" />}
        {item.estado === 'listo' && <Check className="size-4 text-emerald-600" />}
        {item.estado === 'duplicado' && <Copy className="size-4 text-muted-foreground" />}
        {item.estado === 'error' && <AlertTriangle className="size-4 text-amber-500" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.nombre}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {item.estado === 'listo' && item.proveedor
            ? `${item.proveedor} · ${item.renglones} renglones${item.total != null ? ` · ${formatARS(item.total)}` : ''}`
            : item.mensaje ?? ETIQUETA[item.estado]}
        </div>
      </div>

      {item.estado === 'listo' && (
        <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-[11px]">
          <Link href={`/admin/finanzas/documentos/revision/${item.extraccionId}?lote=${loteId}`}>Revisar</Link>
        </Button>
      )}
      {item.estado === 'duplicado' && item.extraccionId && (
        <Button asChild size="sm" variant="ghost" className="h-7 shrink-0 text-[11px]">
          <Link href={`/admin/finanzas/documentos/revision/${item.extraccionId}`}>Ver</Link>
        </Button>
      )}
    </div>
  )
}
