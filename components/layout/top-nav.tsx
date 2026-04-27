'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, ExternalLink as ExtLinkIcon } from 'lucide-react'
import { toast } from 'sonner'

import { usePermissions } from '@/lib/hooks/use-permissions'
import { NAVEGACION_DEPARTAMENTAL } from '@/lib/constants/navegacion'
import type { DepartamentoNav } from '@/lib/constants/navegacion'
import { DEPARTAMENTOS_ORDER } from '@/lib/constants/departamentos'
import { deptFromPath } from '@/lib/utils/departamento-from-path'
import type { Departamento } from '@/lib/types/admin'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Icon } from '@/components/icon'

import { SucursalSelector } from '@/components/layout/sucursal-selector'
import { PeriodSelector } from '@/components/layout/period-selector'
import { SearchTrigger } from '@/components/layout/search-trigger'
import { NotificationsTrigger } from '@/components/layout/notifications-trigger'
import { UserMenu } from '@/components/layout/user-menu'
import { cn } from '@/lib/utils'

export function TopNav({ profile }: { profile: HubProfile }) {
  const pathname = usePathname() || '/admin'
  const deptActivo = deptFromPath(pathname)
  const { rol } = usePermissions()

  // Lista de deptos ordenados según DEPARTAMENTOS_ORDER, filtrados por rol.
  const items = DEPARTAMENTOS_ORDER
    .map((id) => NAVEGACION_DEPARTAMENTAL[id])
    .filter((d) => rol && d.rolesPermitidos.includes(rol))

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-4">
        {/* Hamburguesa mobile */}
        <MobileNavSheet
          deptActivo={deptActivo}
          items={items}
          profile={profile}
        />

        {/* Logo */}
        <Link
          href="/admin"
          className="flex items-center gap-2 text-sm font-bold tracking-tight"
        >
          <span className="size-2.5 rounded-full bg-primary" aria-hidden />
          <span className="hidden sm:inline">Social Ahorro</span>
          <Badge
            variant="outline"
            className="hidden border-border/60 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-flex"
          >
            ERP
          </Badge>
        </Link>

        {/* Departamentos (desktop) */}
        <nav role="navigation" aria-label="Departamentos" className="ml-2 hidden flex-1 lg:block">
          <TooltipProvider delayDuration={200}>
            <ul className="flex items-center gap-1">
              {items.map((d) => (
                <li key={d.id}>
                  <DeptButton
                    id={d.id}
                    activo={deptActivo === d.id}
                    label={d.label}
                    icon={d.icon}
                    path={d.path}
                    estado={d.estado}
                    descripcion={d.descripcion}
                    externalUrl={d.externalUrl}
                  />
                </li>
              ))}
            </ul>
          </TooltipProvider>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1 md:gap-2 lg:flex-none">
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

function DeptButton({
  id,
  activo,
  label,
  icon,
  path,
  estado,
  descripcion,
  externalUrl,
}: {
  id: Departamento
  activo: boolean
  label: string
  icon: string
  path: string
  estado: 'activo' | 'placeholder' | 'fase2' | 'externo'
  descripcion: string
  externalUrl?: string
}) {
  const isExterno = estado === 'externo'
  const isFase2   = estado === 'fase2'
  const isPlace   = estado === 'placeholder'

  const className = cn(
    'group relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
    activo
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    (isFase2 || isExterno) && !activo && 'opacity-70',
  )

  const content = (
    <>
      <Icon name={icon} className="size-3.5" />
      <span>{label}</span>
      {isExterno && <ExtLinkIcon className="size-3 opacity-60" />}
      {isFase2 && (
        <span className="ml-0.5 rounded bg-muted px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          Pronto
        </span>
      )}
    </>
  )

  const node = isExterno && externalUrl ? (
    <a
      href={externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  ) : isPlace || isFase2 ? (
    <button
      type="button"
      className={className}
      onClick={() => toast.message(label, {
        description: isFase2
          ? 'Departamento disponible en fase 2.'
          : 'En construcción.',
      })}
    >
      {content}
    </button>
  ) : (
    <Link href={path} className={className} aria-current={activo ? 'page' : undefined}>
      {content}
    </Link>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="font-medium">{label}</span>
        <span className="ml-1 text-muted-foreground/80">·</span>
        <span className="ml-1 opacity-90">{descripcion}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function MobileNavSheet({
  deptActivo,
  items,
  profile,
}: {
  deptActivo: Departamento
  items: DepartamentoNav[]
  profile: HubProfile
}) {
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
      <SheetContent side="left" className="w-72 p-0">
        <div className="border-b border-border p-4">
          <SheetTitle className="text-base">Departamentos</SheetTitle>
          <SheetDescription className="text-xs">
            {profile.nombre || profile.email}
          </SheetDescription>
        </div>

        <nav className="flex flex-col gap-1 p-2" role="navigation">
          {items.map((d) => (
            <DeptListItem key={d.id} d={d} activo={deptActivo === d.id} />
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

function DeptListItem({
  d,
  activo,
}: {
  d: DepartamentoNav
  activo: boolean
}) {
  const isExterno = d.estado === 'externo'
  const isFase2   = d.estado === 'fase2'
  const isPlace   = d.estado === 'placeholder'

  const cls = cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    activo
      ? 'bg-accent text-accent-foreground'
      : 'text-foreground hover:bg-accent/60',
    (isFase2 || isExterno) && 'opacity-75',
  )
  const inner = (
    <>
      <Icon name={d.icon} className="size-4" />
      <span className="flex-1">{d.label}</span>
      {isExterno && <ExtLinkIcon className="size-3.5 opacity-60" />}
      {isFase2 && (
        <span className="rounded bg-muted px-1.5 text-[9px] font-bold uppercase text-muted-foreground">
          Pronto
        </span>
      )}
    </>
  )
  if (isExterno && d.externalUrl) {
    return (
      <a href={d.externalUrl} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    )
  }
  if (isFase2 || isPlace) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() =>
          toast.message(d.label, {
            description: isFase2 ? 'Disponible en fase 2.' : 'En construcción.',
          })
        }
      >
        {inner}
      </button>
    )
  }
  return (
    <Link href={d.path} className={cls}>
      {inner}
    </Link>
  )
}
