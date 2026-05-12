'use client'

import { useTheme } from 'next-themes'
import {
  User as UserIcon,
  LogOut,
  Moon,
  Sun,
  MonitorSmartphone,
} from 'lucide-react'

import type { CrmUser } from '@/lib/hooks/use-crm-user'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'

const ROLE_LABELS: Record<CrmUser['role'], string> = {
  admin: 'Administrador',
  operador: 'Operador',
  repartidor: 'Repartidor',
}

function initialsFor(user: CrmUser): string {
  const base = user.name || user.email
  const parts = base.split(/[\s@.]/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
}

export function CrmUserMenu({ user }: { user: CrmUser }) {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full p-0"
          aria-label="Menú de usuario"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
              {initialsFor(user)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1 py-3">
          <div className="text-sm font-semibold leading-tight">
            {user.name || user.email.split('@')[0]}
          </div>
          <div className="text-xs font-normal text-muted-foreground">
            {user.email}
          </div>
          <Badge
            variant="outline"
            className="mt-1 w-fit border-border/60 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {ROLE_LABELS[user.role]}
          </Badge>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a href="/cuenta" className="cursor-pointer">
            <UserIcon className="size-4" />
            Mi perfil
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? (
              <Moon className="size-4" />
            ) : theme === 'light' ? (
              <Sun className="size-4" />
            ) : (
              <MonitorSmartphone className="size-4" />
            )}
            Tema
            <span className="ml-auto text-xs text-muted-foreground capitalize">
              {theme === 'system' ? 'sistema' : theme === 'dark' ? 'oscuro' : 'claro'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => setTheme('light')}>
                <Sun className="size-4" />
                <span>Claro</span>
                {theme === 'light' && <span className="ml-auto text-xs">●</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme('dark')}>
                <Moon className="size-4" />
                <span>Oscuro</span>
                {theme === 'dark' && <span className="ml-auto text-xs">●</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme('system')}>
                <MonitorSmartphone className="size-4" />
                <span>Sistema</span>
                {theme === 'system' && <span className="ml-auto text-xs">●</span>}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          asChild
          className="text-destructive focus:text-destructive"
        >
          <a href="/logout" className="cursor-pointer">
            <LogOut className="size-4" />
            Cerrar sesión
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
