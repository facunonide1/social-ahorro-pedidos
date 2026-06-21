'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { toast } from 'sonner'

import { usePermissions } from '@/lib/hooks/use-permissions'
import { navegacionParaUsuario, type NavGrupo } from '@/lib/constants/navegacion'
import { NoraBrand } from '@/components/nora/nora-brand'
import type { HubProfile } from '@/lib/admin-hub/auth'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Icon } from '@/components/icon'

import { SucursalSelector } from '@/components/layout/sucursal-selector'
import { PeriodSelector } from '@/components/layout/period-selector'
import { SearchTrigger } from '@/components/layout/search-trigger'
import { NotificationsTrigger } from '@/components/layout/notifications-trigger'
import { UserMenu } from '@/components/layout/user-menu'
import { cn } from '@/lib/utils'

/**
 * Top bar de NORA HQ (F6.5.T3).
 *
 * Los 8 pilares viven ahora en el Sidebar (desktop) y en el drawer mobile.
 * El top bar queda con marca + selectores + búsqueda + notificaciones + user.
 */
export function TopNav({ profile }: { profile: HubProfile }) {
  const { rol, permisosCustom } = usePermissions()
  const grupos = navegacionParaUsuario(rol, permisosCustom)

  return (
    <header
      role="banner"
      className="border-b border-border bg-background"
    >
      <div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-4">
        {/* Hamburguesa mobile */}
        <MobileNavSheet grupos={grupos} profile={profile} />

        {/* Marca */}
        <div className="flex items-center gap-2">
          <NoraBrand size="sm" />
          <Badge
            variant="outline"
            className="hidden border-border/60 px-1.5 py-0 text-[10px] font-medium tracking-wide text-muted-foreground xl:inline-flex"
          >
            Tu centro de mando
          </Badge>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <div className="hidden md:block">
            <SucursalSelector />
          </div>
          <div className="hidden md:block">
            <PeriodSelector />
          </div>
          <div className="hidden sm:block">
            <SearchTrigger />
          </div>
          <NotificationsTrigger />
          <UserMenu profile={profile} />
        </div>
      </div>
    </header>
  )
}

function MobileNavSheet({
  grupos,
  profile,
}: {
  grupos: NavGrupo[]
  profile: HubProfile
}) {
  const pathname = usePathname() || '/admin'

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 lg:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <div className="border-b border-border p-4">
          <SheetTitle className="text-base">NORA HQ</SheetTitle>
          <SheetDescription className="text-xs">
            {profile.nombre || profile.email}
          </SheetDescription>
        </div>

        <nav className="flex flex-col gap-3 p-3" role="navigation">
          {grupos.map((g) => (
            <div key={g.grupo}>
              <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {g.grupo}
              </div>
              <div className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <NavListItem
                    key={it.href}
                    href={it.href}
                    label={it.label}
                    icon={it.icon}
                    estado={it.estado ?? 'activo'}
                    activo={
                      pathname === it.href ||
                      pathname.startsWith(it.href + '/')
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-border p-4">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Sucursal
            </div>
            <SucursalSelector />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Período
            </div>
            <PeriodSelector />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NavListItem({
  href,
  label,
  icon,
  estado,
  activo,
}: {
  href: string
  label: string
  icon: string
  estado: 'activo' | 'placeholder' | 'fase2' | 'externo'
  activo: boolean
}) {
  const disabled = estado === 'fase2' || estado === 'placeholder'
  const cls = cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    activo
      ? 'bg-nora-bg font-medium text-primary'
      : 'text-foreground hover:bg-accent/60',
    disabled && 'text-muted-foreground/70',
  )
  const inner = (
    <>
      <Icon name={icon} className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {estado === 'fase2' && (
        <span className="rounded bg-muted px-1.5 text-[9px] font-bold uppercase text-muted-foreground">
          Pronto
        </span>
      )}
    </>
  )
  if (estado === 'externo') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    )
  }
  if (disabled) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() =>
          toast.message(label, {
            description: estado === 'fase2' ? 'Disponible en fase 2.' : 'En construcción.',
          })
        }
      >
        {inner}
      </button>
    )
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  )
}
