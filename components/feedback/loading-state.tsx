import * as React from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type LoadingStateVariant = 'rows' | 'card' | 'page'

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: LoadingStateVariant
  /** Cantidad de placeholders. Para 'rows' = filas; para 'card' = cards. */
  rows?: number
  count?: number
}

/**
 * Skeleton genérico para estados de carga.
 *
 * @example
 *   <LoadingState rows={5} />
 *   <LoadingState variant="card" count={4} />
 *   <LoadingState variant="page" />
 */
export function LoadingState({
  variant = 'rows',
  rows,
  count,
  className,
  ...props
}: LoadingStateProps) {
  if (variant === 'card') {
    const n = count ?? rows ?? 4
    return (
      <div
        className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}
        aria-busy="true"
        aria-live="polite"
        {...props}
      >
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="mt-4 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'page') {
    return (
      <div className={cn('space-y-6', className)} aria-busy="true" aria-live="polite" {...props}>
        {/* header */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        {/* table */}
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/5" />
                <Skeleton className="h-4 w-1/6" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 'rows' default
  const n = rows ?? count ?? 5
  return (
    <div
      className={cn('space-y-2', className)}
      aria-busy="true"
      aria-live="polite"
      {...props}
    >
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}
