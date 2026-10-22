'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, History } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * D.1 · EL PANEL LATERAL, DESDE CUALQUIER PANTALLA.
 *
 * Va montado una sola vez en el shell y escucha un evento global. Cualquier
 * fila de cualquier pantalla lo abre con:
 *
 *   abrirPanel('producto', id)
 *
 * ── POR QUÉ UNO SOLO Y NO UNO POR PANTALLA ──────────────────────────────────
 *
 * Porque un producto tiene que verse igual mirado desde compras, desde stock o
 * desde una decisión. Si cada pantalla armara el suyo, el mismo producto diría
 * cosas distintas según de dónde lo abriste — y la que esté desactualizada va
 * a ser siempre la que menos se mira.
 *
 * Lo que muestra sale de `/api/entidad`, con la sesión de quien mira: la RLS
 * decide qué ve. Un panel con el cliente de servicio mostraría datos que la
 * pantalla de atrás oculta.
 */

export function abrirPanel(tipo: 'producto' | 'proveedor', id: string) {
  window.dispatchEvent(new CustomEvent('nora:panel', { detail: { tipo, id } }))
}

type Datos = {
  titulo: string; subtitulo: string | null
  datos: { etiqueta: string; valor: string }[]
  acciones: { nombre: string; href: string }[]
  historia: any[]
}

export function PanelEntidad() {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function onAbrir(e: Event) {
      const { tipo, id } = (e as CustomEvent).detail ?? {}
      if (!tipo || !id) return
      setAbierto(true); setCargando(true); setD(null); setError(null)
      try {
        const r = await fetch(`/api/entidad?tipo=${tipo}&id=${id}`, { cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) { setError(j?.error ?? 'No se pudo abrir.'); return }
        setD(j)
      } catch {
        setError('No se pudo abrir.')
      } finally { setCargando(false) }
    }
    window.addEventListener('nora:panel', onAbrir)
    return () => window.removeEventListener('nora:panel', onAbrir)
  }, [])

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-6 text-left leading-tight">
            {cargando ? 'Abriendo…' : d?.titulo ?? 'No se pudo abrir'}
          </SheetTitle>
        </SheetHeader>

        {cargando && <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" />}
        {error && <p className="mt-4 text-sm text-muted-foreground">{error}</p>}

        {d && (
          <div className="mt-4 space-y-4">
            {d.subtitulo && <p className="text-xs text-muted-foreground">{d.subtitulo}</p>}

            <dl className="space-y-1.5">
              {d.datos.map((x, i) => (
                <div key={i} className="flex flex-wrap gap-x-2 text-sm">
                  <dt className="text-muted-foreground">{x.etiqueta}:</dt>
                  <dd className="font-medium">{x.valor}</dd>
                </div>
              ))}
            </dl>

            {!!d.acciones.length && (
              <div className="flex flex-wrap gap-2">
                {d.acciones.map((a, i) => (
                  <Button key={i} size="sm" variant="outline" asChild>
                    <Link href={a.href}>{a.nombre}</Link>
                  </Button>
                ))}
              </div>
            )}

            {/* ── D.3 · POR QUÉ ESTÁ ASÍ ──────────────────────────────── */}
            <section className="space-y-2 border-t pt-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="size-3.5" /> Por qué está así
              </h3>
              {!d.historia.length ? (
                <p className="text-xs leading-snug text-muted-foreground">
                  Ningún agente propuso nada sobre esto todavía, así que no hay una cadena de
                  decisiones que contar. Está como está porque así vino de SIFACO.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {d.historia.map((h, i) => (
                    <div key={i} className="text-xs leading-snug">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{h.agente}</Badge>
                        <span className="text-muted-foreground">
                          {new Date(h.propuesta_at).toLocaleDateString('es-AR')}
                        </span>
                        <Badge variant={h.estado === 'aceptada' ? 'default' : 'outline'} className="text-[10px]">
                          {h.estado}
                        </Badge>
                      </div>
                      <p>{h.propuso}</p>
                      {h.acerto === null
                        ? <p className="text-muted-foreground">Todavía no se midió si acertó.</p>
                        : <p className="text-muted-foreground">{h.acerto ? 'Acertó.' : 'No dio el resultado calculado.'}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
