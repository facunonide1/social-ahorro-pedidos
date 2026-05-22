'use client'

import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Pill clickable con una sugerencia contextual de NORA. */
export function NoraSuggestionPill({
  label,
  onClick,
  className,
}: {
  label: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-nora/40 bg-transparent px-3 py-1 text-xs text-foreground transition-colors hover:bg-nora-bg',
        className,
      )}
    >
      <Sparkles className="size-3 text-nora" />
      {label}
    </button>
  )
}
