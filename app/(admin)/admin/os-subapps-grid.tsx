'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { Icon } from '@/components/icon'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { subAppsVisibles, type BadgeResult } from '@/lib/os/subapps'
import { cn } from '@/lib/utils'

const SEV_CLS: Record<'info' | 'warn' | 'danger', string> = {
  info: 'bg-sky-500',
  warn: 'bg-amber-500',
  danger: 'bg-rose-500',
}

/**
 * Zona 4 de Mission Control · grilla de sub-apps permitidas al rol, con badge
 * vivo. Click → home de la sub-app. Cada card lleva el acento de su sub-app.
 */
export function OsSubAppsGrid() {
  const { rol, permisosCustom, isReady } = usePermissions()
  const [badges, setBadges] = useState<Record<string, BadgeResult>>({})
  const apps = useMemo(() => subAppsVisibles(rol, permisosCustom), [rol, permisosCustom])

  useEffect(() => {
    let alive = true
    fetch('/api/os/badges', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && j && typeof j === 'object') setBadges(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (!isReady || apps.length === 0) return null

  return (
    <section aria-label="Aplicaciones">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tus aplicaciones</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {apps.map((app) => {
          const b = badges[app.id]
          return (
            <Link
              key={app.id}
              href={app.rutaHome}
              className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex size-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${app.acento}1a` }}>
                <Icon name={app.icono} className="size-6" style={{ color: app.acento }} />
              </span>
              {b && (
                <span className={cn('absolute right-3 top-3 flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white', SEV_CLS[b.severidad])}>
                  {b.count > 99 ? '99+' : b.count}
                </span>
              )}
              <div>
                <div className="text-sm font-semibold">{app.nombre}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{app.descripcion}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
