'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export type Breadcrumb = {
  label: string
  /** Si se omite, el item se renderiza como "actual" (no link). */
  href?: string
}

export type PageHeaderTab = {
  label: string
  href: string
  /** Override de "activo" si la lógica por pathname no es suficiente. */
  active?: boolean
  badge?: string | number
}

export interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: Breadcrumb[]
  actions?: React.ReactNode
  tabs?: PageHeaderTab[]
  /** Si true, el header se queda sticky al scrollear. Default true. */
  sticky?: boolean
  className?: string
}

/**
 * Cabecera estándar de páginas del ERP. Combina breadcrumbs, título,
 * descripción, acciones (a la derecha) y tabs opcionales.
 *
 * @example
 *   <PageHeader
 *     title="Proveedores"
 *     description="Maestro de proveedores"
 *     breadcrumbs={[
 *       { label: 'Compras', href: '/admin/compras' },
 *       { label: 'Proveedores' },
 *     ]}
 *     actions={
 *       <PageActions>
 *         <Button variant="outline">Exportar</Button>
 *         <Button>Nuevo proveedor</Button>
 *       </PageActions>
 *     }
 *     tabs={[
 *       { label: 'Activos',   href: '?estado=activos' },
 *       { label: 'Inactivos', href: '?estado=inactivos' },
 *     ]}
 *   />
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  tabs,
  sticky = true,
  className,
}: PageHeaderProps) {
  const pathname = usePathname() || ''

  return (
    <header
      className={cn(
        'border-b border-border bg-background',
        sticky && 'sticky top-14 z-20',
        className,
      )}
    >
      <div className="px-4 py-4 md:px-6 md:py-5">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} className="mb-2" />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>

      {tabs && tabs.length > 0 && (
        <nav
          aria-label="Subsecciones"
          className="-mb-px overflow-x-auto px-4 md:px-6"
        >
          <ul className="flex min-w-max items-center gap-1">
            {tabs.map((t) => {
              const active =
                t.active ?? (pathname === t.href || pathname.startsWith(t.href + '/'))
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                    )}
                  >
                    {t.label}
                    {t.badge != null && t.badge !== '' && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                        {t.badge}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </header>
  )
}

function Breadcrumbs({
  items,
  className,
}: {
  items: Breadcrumb[]
  className?: string
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-xs', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        {items.map((b, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${b.label}-${i}`} className="flex items-center gap-1">
              {b.href && !last ? (
                <Link
                  href={b.href}
                  className="hover:text-foreground hover:underline"
                >
                  {b.label}
                </Link>
              ) : (
                <span className={cn(last && 'font-medium text-foreground')}>
                  {b.label}
                </span>
              )}
              {!last && <ChevronRight className="size-3 opacity-60" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
