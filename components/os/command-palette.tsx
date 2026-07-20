'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Package, Users, Truck, ListChecks, CornerDownLeft, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { Icon } from '@/components/icon'
import { usePermissions } from '@/lib/hooks/use-permissions'
import {
  subAppsVisibles,
  quickActionsVisibles,
  type QuickAction,
} from '@/lib/os/subapps'
import type { OsSearchHit } from '@/app/api/os/search/route'

const TIPO_ICON = { producto: Package, cliente: Users, proveedor: Truck, tarea: ListChecks, mensaje: MessageSquare } as const

/**
 * NORA OS · ⌘K universal. Un solo buscador para: acciones, navegación
 * (sub-apps + módulos), entidades (productos/clientes/proveedores/tareas vía
 * `/api/os/search`) y fallback a NORA. Todo respeta permisos. Accesible por
 * teclado (cmdk).
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const { rol, permisosCustom } = usePermissions()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<OsSearchHit[]>([])

  const apps = useMemo(() => subAppsVisibles(rol, permisosCustom), [rol, permisosCustom])
  const acciones = useMemo(() => quickActionsVisibles(rol, permisosCustom), [rol, permisosCustom])

  // Reset al cerrar.
  useEffect(() => { if (!open) { setQ(''); setHits([]) } }, [open])

  // Búsqueda de entidades (debounced).
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/os/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        const j = await r.json()
        if (alive) setHits((j?.hits ?? []) as OsSearchHit[])
      } catch { if (alive) setHits([]) }
    }, 200)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  const term = q.trim().toLowerCase()
  const matchTxt = (s: string) => !term || s.toLowerCase().includes(term)

  const accionesFiltradas = acciones.filter(({ action }) => matchTxt(action.nombre)).slice(0, 6)
  const navFiltrada = apps
    .flatMap((app) => [
      { label: app.nombre, ruta: app.rutaHome, icon: app.icono, sub: 'Sub-app' },
      ...app.modulos.map((m) => ({ label: m.nombre, ruta: m.ruta, icon: app.icono, sub: app.nombre })),
    ])
    .filter((n) => matchTxt(n.label))
    .slice(0, 8)

  function go(ruta: string) {
    onOpenChange(false)
    if (ruta && ruta !== '#') router.push(ruta)
  }
  function ejecutar(a: QuickAction) {
    if (a.proximamente) { toast.message(a.nombre, { description: 'Próximamente.' }); return }
    if (a.evento) { onOpenChange(false); window.dispatchEvent(new CustomEvent(a.evento)); return }
    go(a.destino)
  }
  function preguntarNora() {
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent('nora:open', { detail: { text: q.trim() } }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput value={q} onValueChange={setQ} placeholder="Buscar acciones, sub-apps, productos, clientes…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>Sin resultados. Probá preguntarle a NORA.</CommandEmpty>

            {accionesFiltradas.length > 0 && (
              <CommandGroup heading="Acciones">
                {accionesFiltradas.map(({ app, action }) => (
                  <CommandItem key={action.id} value={`accion-${action.id}`} onSelect={() => ejecutar(action)} className="gap-2">
                    <Icon name={action.icono} className="size-4 text-muted-foreground" />
                    <span>{action.nombre}</span>
                    {app && <span className="ml-auto text-xs text-muted-foreground">{app.nombre}</span>}
                    {action.proximamente && <span className="ml-auto rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">Pronto</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {navFiltrada.length > 0 && (
              <CommandGroup heading="Ir a">
                {navFiltrada.map((n) => (
                  <CommandItem key={`${n.sub}-${n.ruta}`} value={`nav-${n.ruta}`} onSelect={() => go(n.ruta)} className="gap-2">
                    <Icon name={n.icon} className="size-4 text-muted-foreground" />
                    <span>{n.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{n.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {hits.filter((h) => h.tipo !== 'mensaje').length > 0 && (
              <CommandGroup heading="Resultados">
                {hits.filter((h) => h.tipo !== 'mensaje').map((h) => {
                  const I = TIPO_ICON[h.tipo]
                  return (
                    <CommandItem key={`${h.tipo}-${h.id}`} value={`ent-${h.tipo}-${h.id}`} onSelect={() => go(h.ruta)} className="gap-2">
                      <I className="size-4 text-muted-foreground" />
                      <span className="truncate">{h.titulo}</span>
                      {h.subtitulo && <span className="ml-auto truncate text-xs text-muted-foreground">{h.subtitulo}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {hits.filter((h) => h.tipo === 'mensaje').length > 0 && (
              <CommandGroup heading="Mensajes">
                {hits.filter((h) => h.tipo === 'mensaje').map((h) => (
                  <CommandItem key={`msg-${h.id}`} value={`msg-${h.id}`} onSelect={() => go(h.ruta)} className="gap-2">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <span className="truncate">{h.titulo}</span>
                    {h.subtitulo && <span className="ml-auto truncate text-xs text-muted-foreground">{h.subtitulo}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {q.trim() && (
              <CommandGroup heading="NORA">
                <CommandItem value="nora-fallback" onSelect={preguntarNora} className="gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span>Preguntarle a NORA: “{q.trim()}”</span>
                  <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" />
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
