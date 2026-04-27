import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Wrapper de las acciones del PageHeader (botones a la derecha).
 * Aplica spacing y wrap consistente.
 *
 * @example
 *   <PageActions>
 *     <Button variant="outline">Exportar</Button>
 *     <Button>Nuevo</Button>
 *   </PageActions>
 */
export function PageActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    >
      {children}
    </div>
  )
}
