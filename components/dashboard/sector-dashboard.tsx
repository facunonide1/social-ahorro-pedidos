import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { NoraCard } from '@/components/nora/nora-card'
import { cn } from '@/lib/utils'

export type SectorKpi = {
  label: string
  value: number | string | null | undefined
  format?: 'number' | 'currency' | 'percent' | 'custom'
  formattedValue?: string
  icon?: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'danger'
  href?: string
  footer?: React.ReactNode
}

export type SectorAcceso = {
  label: string
  href: string
  icon: LucideIcon
  descripcion?: string
}

/**
 * Dashboard de entrada de un sector (nivel intermedio entre Mission Control y
 * las secciones). Patrón único: header + KPIs reales + aviso de NORA + grid de
 * accesos rápidos. Server component (sin estado); los KPIs los calcula la página
 * índice del sector y se pasan ya resueltos.
 */
export function SectorDashboard({
  title,
  descripcion,
  breadcrumbs,
  kpis,
  nora,
  accesos,
  children,
}: {
  title: string
  descripcion?: string
  breadcrumbs?: { label: string; href?: string }[]
  kpis: SectorKpi[]
  nora?: React.ReactNode
  accesos: SectorAcceso[]
  children?: React.ReactNode
}) {
  return (
    <>
      <PageHeader title={title} description={descripcion} breadcrumbs={breadcrumbs} />
      <div className="space-y-5 p-4 md:p-6">
        {kpis.length > 0 && (
          <section aria-label="Indicadores del sector" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k, i) => (
              <KpiCard
                key={i}
                label={k.label}
                value={k.value}
                format={k.format ?? 'number'}
                formattedValue={k.formattedValue}
                icon={k.icon}
                variant={k.variant}
                href={k.href}
                footer={k.footer}
              />
            ))}
          </section>
        )}

        {nora && <NoraCard contexto={title}>{nora}</NoraCard>}

        {accesos.length > 0 && (
          <section aria-label="Accesos del sector">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Accesos rápidos
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {accesos.map((a) => {
                const Icon = a.icon
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={cn(
                      'group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all',
                      'hover:scale-[1.02] hover:border-primary/50 hover:shadow-md',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="size-5 text-primary" />
                      <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{a.label}</div>
                      {a.descripcion && (
                        <div className="text-xs text-muted-foreground">{a.descripcion}</div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {children}
      </div>
    </>
  )
}
