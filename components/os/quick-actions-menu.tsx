'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Search, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Icon } from '@/components/icon'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/lib/hooks/use-permissions'
import {
  ACCIONES_GLOBALES,
  subAppsVisibles,
  subAppDeRuta,
  puedeAccion,
  type QuickAction,
} from '@/lib/os/subapps'

/**
 * NORA OS · sistema de acciones rápidas ("+"). Dos niveles:
 *  1. Principales: 3 globales + las primary de la sub-app donde estás (contexto).
 *  2. Todas: catálogo completo agrupado por sub-app (con sub-acciones) + buscador.
 * Todo filtrado por permisos: nadie ve acciones que no puede ejecutar.
 */
export function QuickActionsMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const pathname = usePathname() || '/admin'
  const { rol, permisosCustom } = usePermissions()
  const [nivel, setNivel] = useState<'principales' | 'todas'>('principales')
  const [q, setQ] = useState('')

  useEffect(() => { if (!open) { setNivel('principales'); setQ('') } }, [open])

  const apps = useMemo(() => subAppsVisibles(rol, permisosCustom), [rol, permisosCustom])
  const appActual = useMemo(() => subAppDeRuta(pathname), [pathname])

  const globales = useMemo(
    () => (rol ? ACCIONES_GLOBALES.filter((a) => puedeAccion(rol, permisosCustom, a)) : []),
    [rol, permisosCustom],
  )
  const contextuales = useMemo(() => {
    if (!rol || !appActual) return []
    return appActual.quickActions.filter((a) => a.primary && puedeAccion(rol, permisosCustom, a)).slice(0, 5)
  }, [rol, permisosCustom, appActual])

  function run(a: QuickAction) {
    if (a.proximamente) { toast.message(a.nombre, { description: 'Próximamente.' }); return }
    onOpenChange(false)
    if (a.evento) { window.dispatchEvent(new CustomEvent(a.evento)); return }
    if (a.destino && a.destino !== '#') router.push(a.destino)
  }

  const term = q.trim().toLowerCase()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">Acciones rápidas</DialogTitle>
        </DialogHeader>

        {/* Tabs de nivel */}
        <div className="flex gap-1 border-b border-border px-2 py-1.5 text-sm">
          {(['principales', 'todas'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setNivel(t)}
              className={cn('rounded-md px-3 py-1', nivel === t ? 'bg-nora-bg font-medium text-primary' : 'text-muted-foreground hover:bg-accent/50')}
            >
              {t === 'principales' ? 'Principales' : 'Todas las acciones'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-3">
          {nivel === 'principales' ? (
            <div className="space-y-4">
              {contextuales.length > 0 && (
                <Grupo titulo={appActual?.nombre ?? 'Acá'}>
                  {contextuales.map((a) => <AccionBtn key={a.id} a={a} onRun={run} />)}
                </Grupo>
              )}
              <Grupo titulo="Siempre a mano">
                {globales.map((a) => <AccionBtn key={a.id} a={a} onRun={run} />)}
              </Grupo>
              {contextuales.length === 0 && globales.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No tenés acciones disponibles.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar acción…" className="h-9 pl-8" autoFocus />
              </div>
              {apps.map((app) => {
                const acts = app.quickActions.filter(
                  (a) => rol && puedeAccion(rol, permisosCustom, a) && (!term || a.nombre.toLowerCase().includes(term)),
                )
                if (acts.length === 0) return null
                return (
                  <Grupo key={app.id} titulo={app.nombre} acento={app.acento}>
                    {acts.map((a) => (
                      <div key={a.id}>
                        <AccionBtn a={a} onRun={run} />
                        {a.children?.filter((c) => rol && puedeAccion(rol, permisosCustom, c)).map((c) => (
                          <div key={c.id} className="ml-6">
                            <AccionBtn a={c} onRun={run} pequeño />
                          </div>
                        ))}
                      </div>
                    ))}
                  </Grupo>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Grupo({ titulo, acento, children }: { titulo: string; acento?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {acento && <span className="size-2 rounded-full" style={{ backgroundColor: acento }} />}
        {titulo}
      </div>
      <div className="grid grid-cols-1 gap-1">{children}</div>
    </div>
  )
}

function AccionBtn({ a, onRun, pequeño }: { a: QuickAction; onRun: (a: QuickAction) => void; pequeño?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onRun(a)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 text-left transition-colors hover:border-border hover:bg-accent/40',
        pequeño ? 'py-1.5' : 'py-2.5',
        a.proximamente && 'opacity-60',
      )}
      title={a.proximamente ? 'Próximamente' : undefined}
    >
      <Icon name={a.icono} className={cn('shrink-0 text-muted-foreground', pequeño ? 'size-4' : 'size-5')} />
      <span className={cn('flex-1', pequeño ? 'text-sm' : 'text-sm font-medium')}>{a.nombre}</span>
      {a.proximamente ? (
        <span className="rounded bg-muted px-1.5 text-[9px] font-bold uppercase text-muted-foreground">Pronto</span>
      ) : (
        <ChevronRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  )
}
