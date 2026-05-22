import { cn } from '@/lib/utils'

/** Indicador de "NORA está escribiendo": 3 puntos violeta en pulso secuencial. */
export function NoraTyping({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-nora-pulse rounded-full bg-nora"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  )
}
