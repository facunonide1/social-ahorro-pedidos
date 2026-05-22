'use client'

import {
  Sprout,
  UserPlus,
  BadgeCheck,
  Star,
  Award,
  Flame,
  Compass,
  Crown,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const ICONS: Record<string, LucideIcon> = {
  Sprout,
  UserPlus,
  BadgeCheck,
  Star,
  Award,
  Flame,
  Compass,
  Crown,
  Trophy,
}

export type NivelInfo = {
  nivel: number
  nombre: string
  titulo_profesional: string
  icono: string | null
  color: string | null
}

export function NivelBadge({
  nivel,
  score,
  siguiente,
  variant = 'inline',
  className,
}: {
  nivel: NivelInfo
  score?: number
  siguiente?: { nombre: string; puntos_necesarios: number } | null
  variant?: 'inline' | 'full'
  className?: string
}) {
  const IconCmp = ICONS[nivel.icono ?? ''] ?? Star
  const color = nivel.color ?? '#8b5cf6'
  const faltan =
    siguiente && score != null
      ? Math.max(0, siguiente.puntos_necesarios - score)
      : null

  if (variant === 'full') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border p-3',
          className,
        )}
        style={{ borderColor: `${color}55` }}
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <IconCmp className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color }}>
            Nivel {nivel.nivel} · {nivel.nombre}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {nivel.titulo_profesional}
            {faltan != null && siguiente
              ? ` · faltan ${faltan.toLocaleString('es-AR')} pts para ${siguiente.nombre}`
              : ''}
          </div>
        </div>
      </div>
    )
  }

  const pill = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <IconCmp className="size-3.5" />
      {nivel.nombre}
    </span>
  )

  if (faltan == null || !siguiente) return pill

  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent>
        Próximo: {siguiente.nombre} · faltan{' '}
        {faltan.toLocaleString('es-AR')} pts
      </TooltipContent>
    </Tooltip>
  )
}
