'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ListChecks, MessageSquare, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * NORA OS · bottom bar mobile. 4 fijos: Inicio · Tareas · Chat · NORA.
 * El resto de sub-apps se abren desde Inicio (Mission Control). NORA abre el
 * chat transversal existente vía evento.
 */
export function MobileBottomBar() {
  const pathname = usePathname() || '/admin'
  const items = [
    { label: 'Inicio', href: '/admin', icon: Home, match: (p: string) => p === '/admin' },
    { label: 'Tareas', href: '/admin/tareas', icon: ListChecks, match: (p: string) => p.startsWith('/admin/tareas') || p.startsWith('/admin/mi-panel') },
    { label: 'Chat', href: '/admin/comunicacion', icon: MessageSquare, match: (p: string) => p.startsWith('/admin/comunicacion') },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background lg:hidden" aria-label="Navegación">
      {items.map((it) => {
        const active = it.match(pathname)
        const I = it.icon
        return (
          <Link key={it.href} href={it.href} className={cn('flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]', active ? 'text-primary' : 'text-muted-foreground')}>
            <I className="size-5" />
            {it.label}
          </Link>
        )
      })}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('nora:open'))}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
      >
        <Sparkles className="size-5" />
        NORA
      </button>
    </nav>
  )
}
