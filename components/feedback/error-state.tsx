'use client'

import * as React from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
  /** Error técnico opcional, se muestra colapsado en `<details>`. */
  error?: unknown
  onRetry?: () => void
  retryLabel?: string
}

function errorMessage(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  try {
    return JSON.stringify(err, null, 2)
  } catch {
    return String(err)
  }
}

/**
 * Estado de error para fallos de carga / servidor.
 *
 * @example
 *   <ErrorState
 *     title="No pudimos cargar los proveedores"
 *     description="Hubo un problema con la conexión."
 *     error={err}
 *     onRetry={() => refetch()}
 *   />
 */
export function ErrorState({
  title = 'Algo salió mal',
  description = 'Hubo un problema al cargar la información.',
  error,
  onRetry,
  retryLabel = 'Reintentar',
  className,
  ...props
}: ErrorStateProps) {
  const detail = errorMessage(error)
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <div className="text-base font-semibold leading-tight text-foreground">
          {title}
        </div>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw className="size-3.5" />
          {retryLabel}
        </Button>
      )}

      {detail && (
        <details className="mt-2 max-w-md text-left">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
            Detalle técnico
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {detail}
          </pre>
        </details>
      )}
    </div>
  )
}
