'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Estado = {
  habilitada: boolean
  cronSecretConfigurado: boolean
  conexion: null | { cuenta: string | null; estado: string; ultimoListado: string | null; listadoCompleto: boolean; ultimoError: string | null; listando: boolean }
  carpetas: { nombre: string; subcarpetas: boolean; listadaCompletaDesde: string | null }[]
  cuentas: Record<string, number>
  avisos: { nivel: 'error' | 'atencion' | 'info'; texto: string }[]
}

const COLOR = { error: 'text-destructive', atencion: 'text-amber-600 dark:text-amber-400', info: 'text-muted-foreground' }

/**
 * El estado de la ingesta y el botón para correrla a mano. Lee
 * GET /api/integraciones/google-drive/estado y corre
 * POST /api/integraciones/google-drive/procesar (el mismo lote que el cron).
 */
export function EstadoIngesta() {
  const router = useRouter()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const [ultima, setUltima] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/integraciones/google-drive/estado', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error ?? `error ${r.status}`)
      setEstado(j); setError(null)
    } catch (e: any) { setError(e?.message ?? 'no pude leer el estado') }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function procesar() {
    setCorriendo(true)
    try {
      const r = await fetch('/api/integraciones/google-drive/procesar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error ?? `error ${r.status}`)
      const txt = j.ocupado ? 'Había otra corrida en curso: esta no hizo nada.'
        : j.omitido ? 'La ingesta está deshabilitada.'
        : `Encolé ${j.encolados ?? 0}, procesé ${j.procesados ?? 0}${j.omitidos ? `, ${j.omitidos} demasiado grandes` : ''}${j.recuperados ? `, destrabé ${j.recuperados}` : ''}.${j.listado_completo === false ? ' Sigue listando en la próxima.' : ''}`
      setUltima(txt); toast.success(txt)
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'falló'); setUltima(`Falló: ${e?.message ?? 'error'}`) }
    finally { setCorriendo(false); void cargar() }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">Estado de la ingesta</h2>
        <Button className="ml-auto" size="sm" variant="outline" disabled={corriendo} onClick={() => void cargar()}>Actualizar</Button>
        <Button size="sm" disabled={corriendo} onClick={() => void procesar()}>{corriendo ? 'Procesando…' : 'Procesar ahora'}</Button>
      </div>
      {error && <p className="text-sm text-destructive">No pude leer el estado: {error}</p>}
      {ultima && <p className="text-sm">{ultima}</p>}
      {estado && (
        <>
          <div className="text-xs text-muted-foreground">
            {Object.entries(estado.cuentas).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ')}
            {estado.conexion?.ultimoListado ? ` · último listado completo ${estado.conexion.ultimoListado.slice(0, 16).replace('T', ' ')} UTC` : ''}
            {estado.conexion?.listando ? ' · listando' : ''}
          </div>
          <ul className="space-y-1 text-sm">
            {estado.carpetas.map((c) => (
              <li key={c.nombre}>
                📁 {c.nombre}{c.subcarpetas ? ' (con subcarpetas)' : ' (sin subcarpetas)'}
                <span className="text-xs text-muted-foreground"> · {c.listadaCompletaDesde ? `listada completa el ${c.listadaCompletaDesde.slice(0, 10)}` : 'todavía no se listó completa: se trae todo'}</span>
              </li>
            ))}
          </ul>
          {estado.avisos.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {estado.avisos.map((a, i) => <li key={i} className={cn(COLOR[a.nivel])}>{a.texto}</li>)}
            </ul>
          ) : <p className="text-sm text-emerald-600">Sin problemas a la vista.</p>}
        </>
      )}
    </section>
  )
}
