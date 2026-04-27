'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Trigger placeholder de la búsqueda global (Cmd+K).
 *
 * TODO T-G: integrar CommandPalette real (cmdk con categorías de
 * navegación / acciones rápidas / búsqueda en datos).
 */
export function SearchTrigger() {
  const [shortcut, setShortcut] = useState('⌘K')

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    setShortcut(isMac ? '⌘K' : 'Ctrl+K')

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toast.message('Búsqueda global', {
          description: 'Próximamente: Cmd+K para buscar en todo el ERP.',
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        toast.message('Búsqueda global', {
          description: 'Próximamente: buscador con Cmd+K en todo el ERP.',
        })
      }
      aria-label="Buscar"
      className="h-9 gap-2 text-muted-foreground"
    >
      <Search className="size-3.5" />
      <span className="hidden sm:inline">Buscar…</span>
      <kbd className="ml-1 hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums sm:inline-flex">
        {shortcut}
      </kbd>
    </Button>
  )
}
