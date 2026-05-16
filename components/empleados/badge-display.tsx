'use client'

import { Award } from 'lucide-react'

import { Icon } from '@/components/icon'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BADGE_BY_CODIGO, type BadgeStatic } from '@/lib/constants/badges'

const SIZES = {
  sm: 'size-7',
  md: 'size-10',
  lg: 'size-14',
}
const ICON_SIZES = {
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-7',
}

export function BadgeDisplay({
  codigo,
  size = 'md',
  obtenido = true,
  className,
}: {
  codigo: string
  size?: keyof typeof SIZES
  obtenido?: boolean
  className?: string
}) {
  const meta: BadgeStatic | undefined = BADGE_BY_CODIGO[codigo]
  const color = meta?.color ?? '#94a3b8'
  const nombre = meta?.nombre ?? codigo

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full border-2 transition-transform',
              SIZES[size],
              obtenido
                ? 'border-white/40 shadow-sm hover:scale-110'
                : 'border-dashed border-muted-foreground/30 grayscale',
              className,
            )}
            style={{
              background: obtenido ? color : 'transparent',
              color: obtenido ? '#fff' : 'var(--muted-foreground)',
            }}
            aria-label={nombre}
          >
            {meta?.icono ? (
              <Icon name={meta.icono} className={ICON_SIZES[size]} />
            ) : (
              <Award className={ICON_SIZES[size]} />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px]">
          <div className="text-sm font-semibold">{nombre}</div>
          {meta?.descripcion && (
            <div className="text-xs text-muted-foreground">
              {meta.descripcion}
            </div>
          )}
          {!obtenido && (
            <div className="mt-1 text-[10px] text-warning">No obtenida aún</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function BadgesGallery({
  obtenidos,
  className,
}: {
  obtenidos: string[]
  className?: string
}) {
  const set = new Set(obtenidos)
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {Object.values(BADGE_BY_CODIGO).map((b) => (
        <BadgeDisplay
          key={b.codigo}
          codigo={b.codigo}
          obtenido={set.has(b.codigo)}
        />
      ))}
    </div>
  )
}
