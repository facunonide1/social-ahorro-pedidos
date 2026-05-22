import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { NoraLogo } from '@/components/nora/nora-logo'

/**
 * Variante de NoraCard para el panel del empleado: header con avatar de
 * NORA + saludo personalizado, mensaje coach, highlights y CTA.
 */
export function NoraCoachingCard({
  saludo,
  mensaje,
  highlights,
  cta,
  className,
}: {
  saludo: string
  mensaje: ReactNode
  highlights?: string[]
  cta?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border-l-[3px] border-l-nora bg-nora-bg p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <NoraLogo size="md" state="speaking" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-nora">
            NORA · tu coach del día
          </div>
          <div className="mt-0.5 text-sm font-semibold">{saludo}</div>
          <div className="mt-1 text-sm leading-relaxed text-foreground">
            {mensaje}
          </div>
          {highlights && highlights.length > 0 && (
            <ul className="mt-2 space-y-1">
              {highlights.map((h, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <span className="mt-1 size-1 shrink-0 rounded-full bg-mint" />
                  {h}
                </li>
              ))}
            </ul>
          )}
          {cta && <div className="mt-3">{cta}</div>}
        </div>
      </div>
    </div>
  )
}
