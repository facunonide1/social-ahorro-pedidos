import Link from 'next/link'

import { NoraLogo } from '@/components/nora/nora-logo'
import { cn } from '@/lib/utils'

export type NoraBrandSize = 'sm' | 'md' | 'lg'

const TEXT: Record<NoraBrandSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
}

/**
 * Marca NORA HQ: símbolo (círculo violeta + punto menta) + wordmark
 * "NORA HQ" en Geist Sans medium. Click → Mission Control (/admin).
 *
 * @example
 *   <NoraBrand size="sm" />              // símbolo + texto
 *   <NoraBrand size="sm" showText={false} />  // solo símbolo (sidebar colapsado)
 */
export function NoraBrand({
  size = 'sm',
  showText = true,
  href = '/admin',
  className,
}: {
  size?: NoraBrandSize
  showText?: boolean
  href?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="NORA HQ — ir a Mission Control"
      className={cn(
        'flex items-center gap-2 tracking-tight transition-opacity hover:opacity-80',
        className,
      )}
    >
      <NoraLogo size={size} />
      {showText && (
        <span className={cn('font-medium', TEXT[size])}>NORA HQ</span>
      )}
    </Link>
  )
}
