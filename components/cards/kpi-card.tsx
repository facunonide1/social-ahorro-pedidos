'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Minus, type LucideIcon } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatARS, formatNumber, formatPercent } from '@/lib/utils/format'

/* ---------- variants ---------- */

const kpiVariants = cva(
  'relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4 transition-shadow',
  {
    variants: {
      variant: {
        default: 'border-border',
        success: 'border-l-4 border-l-success/70',
        warning: 'border-l-4 border-l-warning/70',
        danger:  'border-l-4 border-l-destructive/70',
      },
      interactive: {
        true:  'cursor-pointer hover:shadow-md hover:border-primary/40',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      interactive: false,
    },
  },
)

/* ---------- types ---------- */

export type KpiFormat = 'number' | 'currency' | 'percent' | 'custom'

export type KpiTrendDirection = 'up' | 'down' | 'flat'

export type KpiTrend = {
  direction: KpiTrendDirection
  /** Valor numérico de la variación (en porcentaje, ej: 12.5 = +12.5%). */
  value: number
  /** Etiqueta auxiliar, ej "vs mes pasado". */
  period?: string
}

export interface KpiCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof kpiVariants> {
  label: string
  value: number | string | null | undefined
  /** 'custom' usa `formattedValue` o el value crudo. */
  format?: KpiFormat
  /** Si format='custom', permite pasar el valor ya formateado. */
  formattedValue?: string
  trend?: KpiTrend | null
  /**
   * Si true, una `direction='down'` con `value > 0` se interpreta como
   * positivo (ej: gastos bajando → bueno). Por default `down` es malo.
   */
  invertTrend?: boolean
  icon?: LucideIcon
  href?: string
  loading?: boolean
  footer?: React.ReactNode
}

/* ---------- helpers ---------- */

function formatValue(value: KpiCardProps['value'], format: KpiFormat, formattedValue?: string): string {
  if (formattedValue) return formattedValue
  if (value == null || value === '') return '—'
  if (format === 'custom') return String(value)
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  if (format === 'currency') return formatARS(n)
  if (format === 'percent')  return formatPercent(n, 1)
  return formatNumber(n, n % 1 === 0 ? 0 : 2)
}

function trendColor(t: KpiTrend, invert: boolean): string {
  if (t.direction === 'flat') return 'text-muted-foreground'
  const isPositive = t.direction === 'up'
    ? !invert
    : invert
  return isPositive ? 'text-success' : 'text-destructive'
}

function TrendIcon({ direction }: { direction: KpiTrendDirection }) {
  if (direction === 'up')   return <ArrowUp className="size-3" />
  if (direction === 'down') return <ArrowDown className="size-3" />
  return <Minus className="size-3" />
}

/* ---------- component ---------- */

/**
 * Tarjeta de KPI con valor, tendencia opcional y CTA opcional via href.
 *
 * @example
 *   <KpiCard
 *     label="Facturas pendientes"
 *     value={42}
 *     format="number"
 *     trend={{ direction: 'up', value: 12.5, period: 'vs mes pasado' }}
 *     icon={FileText}
 *     href="/admin/finanzas/facturas?estado=pendiente"
 *     footer="3 vencen esta semana"
 *   />
 */
export function KpiCard({
  label,
  value,
  format = 'number',
  formattedValue,
  trend,
  invertTrend = false,
  icon: Icon,
  href,
  loading = false,
  footer,
  variant,
  className,
  ...props
}: KpiCardProps) {
  const interactive = !!href

  const content = loading ? (
    <KpiSkeleton />
  ) : (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {Icon && (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="text-2xl font-semibold tabular-nums leading-tight tracking-tight md:text-3xl">
        {formatValue(value, format, formattedValue)}
      </div>

      {trend && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            trendColor(trend, invertTrend),
          )}
        >
          <TrendIcon direction={trend.direction} />
          <span className="tabular-nums">
            {trend.direction === 'flat' ? '0%' : `${trend.value > 0 ? '+' : ''}${trend.value.toFixed(1)}%`}
          </span>
          {trend.period && (
            <span className="text-muted-foreground">{trend.period}</span>
          )}
        </div>
      )}

      {footer && (
        <div className="mt-auto pt-1 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </>
  )

  const card = (
    <Card
      className={cn(kpiVariants({ variant, interactive }), 'shadow-none', className)}
      role={href ? undefined : 'group'}
      aria-label={label}
      {...props}
    >
      {content}
    </Card>
  )

  if (href && !loading) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl">
        {card}
      </Link>
    )
  }
  return card
}

function KpiSkeleton() {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="size-4 rounded" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-28" />
    </>
  )
}
