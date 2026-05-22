import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Wrapper para mensajes/sugerencias de NORA.
 * Fondo nora-bg, borde izquierdo violeta, label de contexto e icono.
 */
export function NoraCard({
  contexto,
  children,
  actions,
  className,
}: {
  contexto?: string
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border-l-[3px] border-l-nora bg-nora-bg p-4 text-foreground',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-nora" />
        <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-nora">
          NORA{contexto ? ` · ${contexto}` : ''}
        </span>
      </div>
      <div className="text-sm leading-relaxed">{children}</div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
