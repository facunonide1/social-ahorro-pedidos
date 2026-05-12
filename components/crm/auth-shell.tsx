import { type ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'

/**
 * Layout aislado para pantallas pre-login y de error
 * (login, bootstrap, error boundary). Centra una card sobre el
 * background y muestra un chip identificatorio.
 *
 * NO usa CrmShell porque no hay user logueado todavía.
 */
export function AuthShell({
  children,
  subtitle,
  brand = 'Social Ahorro · Pedidos',
  maxWidth = 'sm',
}: {
  children: ReactNode
  subtitle?: string
  brand?: string
  maxWidth?: 'sm' | 'md'
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold tracking-tight shadow-sm">
          <span className="size-2.5 rounded-full bg-primary" aria-hidden />
          {brand}
        </div>
        {subtitle && (
          <div className="mt-3 text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
      <Card className={maxWidth === 'md' ? 'w-full max-w-md' : 'w-full max-w-sm'}>
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </div>
  )
}
