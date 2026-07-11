'use client'

import Link from 'next/link'
import { toast } from 'sonner'

import { Icon } from '@/components/icon'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { SUBAPPS, puedeAccion } from '@/lib/os/subapps'
import { cn } from '@/lib/utils'

/**
 * NORA OS · fila de acciones primary de una sub-app, LEÍDA DEL MANIFEST
 * (lib/os/subapps.ts) — no hardcodea. Filtra por permisos del usuario: nadie ve
 * una acción que no puede ejecutar. La primera es la principal (violeta).
 */
export function AccionesSubApp({ app, className, max = 6 }: { app: string; className?: string; max?: number }) {
  const { rol, permisosCustom, isReady } = usePermissions()
  if (!isReady || !rol) return null

  const manifest = SUBAPPS.find((a) => a.id === app)
  if (!manifest) return null

  const acciones = manifest.quickActions
    .filter((a) => a.primary && puedeAccion(rol, permisosCustom, a))
    .slice(0, max)
  if (acciones.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {acciones.map((a, i) => {
        const primaria = i === 0
        const cls = cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          primaria ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-border bg-card hover:bg-accent/50',
          a.proximamente && 'opacity-60',
        )
        if (a.proximamente) {
          return (
            <button key={a.id} type="button" title="Próximamente" onClick={() => toast.message(a.nombre, { description: 'Próximamente.' })} className={cls}>
              <Icon name={a.icono} className="size-4" /> {a.nombre}
            </button>
          )
        }
        return (
          <Link key={a.id} href={a.destino} className={cls}>
            <Icon name={a.icono} className="size-4" /> {a.nombre}
          </Link>
        )
      })}
    </div>
  )
}
