'use client'

import Link from 'next/link'
import { toast } from 'sonner'

import { Icon } from '@/components/icon'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { quickActionsVisibles } from '@/lib/os/subapps'
import { cn } from '@/lib/utils'

/**
 * Zona 2 de Mission Control · fila de acciones rápidas primary según rol
 * (del catálogo del OS). Las `proximamente` se muestran deshabilitadas.
 */
export function OsAccionesRapidas() {
  const { rol, permisosCustom, isReady } = usePermissions()
  if (!isReady || !rol) return null

  const primary = quickActionsVisibles(rol, permisosCustom)
    .filter(({ action }) => action.primary)
    .slice(0, 6)
  if (primary.length === 0) return null

  return (
    <section aria-label="Acciones rápidas">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Acciones rápidas</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {primary.map(({ app, action }) => {
          const inner = (
            <>
              <Icon name={action.icono} className="size-5" style={{ color: app?.acento }} />
              <span className="text-xs font-medium leading-tight">{action.nombre}</span>
            </>
          )
          const cls = cn(
            'flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 transition-all',
            action.proximamente ? 'opacity-60' : 'hover:border-primary/40 hover:shadow-sm',
          )
          if (action.proximamente) {
            return (
              <button key={action.id} type="button" title="Próximamente" onClick={() => toast.message(action.nombre, { description: 'Próximamente.' })} className={cls}>
                {inner}
              </button>
            )
          }
          return <Link key={action.id} href={action.destino} className={cls}>{inner}</Link>
        })}
      </div>
    </section>
  )
}
