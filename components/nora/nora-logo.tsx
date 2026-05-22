import { cn } from '@/lib/utils'

export type NoraLogoState = 'idle' | 'thinking' | 'speaking' | 'error'
export type NoraLogoSize = 'sm' | 'md' | 'lg' | 'xl'

const OUTER: Record<NoraLogoSize, string> = {
  sm: 'size-5',
  md: 'size-8',
  lg: 'size-12',
  xl: 'size-16',
}
const DOT: Record<NoraLogoSize, string> = {
  sm: 'size-[5px]',
  md: 'size-2',
  lg: 'size-3',
  xl: 'size-4',
}

/**
 * Símbolo de NORA: círculo violeta con un punto interno verde menta.
 * El punto pulsa cuando NORA está "pensando".
 */
export function NoraLogo({
  size = 'md',
  state = 'idle',
  className,
}: {
  size?: NoraLogoSize
  state?: NoraLogoState
  className?: string
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full',
        OUTER[size],
        state === 'error'
          ? 'bg-destructive'
          : 'bg-[hsl(var(--nora,var(--primary)))]',
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          'rounded-full bg-emerald-400',
          DOT[size],
          state === 'thinking' && 'animate-nora-pulse',
          state === 'speaking' && 'animate-pulse',
        )}
      />
    </span>
  )
}
