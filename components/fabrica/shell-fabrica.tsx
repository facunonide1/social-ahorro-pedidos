'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Factory } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Shell de la FÁBRICA.
 *
 * Se distingue de NORA OS por la cabecera y la navegación, NO por la paleta:
 * dos productos con dos paletas distintas se ven como dos sistemas mal
 * integrados, no como dos productos. Misma tipografía, mismos tokens de color,
 * misma densidad — otra barra de arriba.
 *
 * No hay dock, no hay ⌘K, no hay Mission Control: la fábrica tiene tres
 * lugares, y una barra con tres links los cubre.
 */

const NAV = [
  { href: '/fabrica', label: 'Proyectos', exacto: true },
  { href: '/fabrica/catalogo', label: 'Catálogo de pools' },
]

export function ShellFabrica({
  email,
  esDueno,
  children,
}: {
  email: string | null
  esDueno: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname() || ''

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex h-14 items-center gap-4 px-4 md:px-6">
          <Link href="/fabrica" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md border border-border bg-muted">
              <Factory className="size-4" aria-hidden />
            </span>
            <span className="font-[family-name:var(--font-fraunces)] text-base">
              Fábrica
            </span>
          </Link>

          <nav aria-label="Secciones de la fábrica" className="flex items-center gap-1">
            {NAV.map((n) => {
              const activo = n.exacto
                ? pathname === n.href
                : pathname === n.href || pathname.startsWith(n.href + '/')
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    activo
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {esDueno && (
              <span className="rounded-full border border-border px-2 py-0.5">
                dueño de la fábrica
              </span>
            )}
            <span className="hidden truncate sm:inline">{email}</span>
            <Link href="/admin" className="hover:text-foreground hover:underline">
              ← NORA OS
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  )
}
