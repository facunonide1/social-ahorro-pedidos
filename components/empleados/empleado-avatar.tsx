import { cn } from '@/lib/utils'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-lg',
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

const PALETA = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-orange-500',
]

function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETA[h % PALETA.length]
}

export function EmpleadoAvatar({
  nombre,
  fotoUrl,
  size = 'md',
  className,
}: {
  nombre: string
  fotoUrl?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={nombre}
        className={cn(
          'shrink-0 rounded-full border border-border object-cover',
          SIZES[size],
          className,
        )}
      />
    )
  }
  return (
    <span
      aria-label={nombre}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase text-white',
        colorFor(nombre || '?'),
        SIZES[size],
        className,
      )}
    >
      {iniciales(nombre || '?') || '?'}
    </span>
  )
}
