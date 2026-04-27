'use client'

import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import {
  User,
  Settings,
  LogOut,
  ExternalLink,
  Moon,
  Sun,
  MonitorSmartphone,
  Rows3,
  Rows2,
  Rows4,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useUIStore, type Densidad } from '@/lib/stores/ui-store'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { HubProfile } from '@/lib/admin-hub/auth'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { cn } from '@/lib/utils'

function initialsFor(profile: HubProfile): string {
  const base = profile.nombre || profile.email
  const parts = base.split(/[\s@.]/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase()
}

export function UserMenu({ profile }: { profile: HubProfile }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const densidad = useUIStore((s) => s.densidad)
  const setDensidad = useUIStore((s) => s.setDensidad)

  async function handleLogout() {
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function notReady(label: string) {
    toast.message(label, { description: 'Esta vista todavía no está implementada en el ERP nuevo.' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-full p-0" aria-label="Menú de usuario">
          <Avatar className="size-9">
            <AvatarFallback className="bg-secondary text-xs font-bold text-secondary-foreground">
              {initialsFor(profile)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-3">
          <div className="text-sm font-semibold leading-tight">
            {profile.nombre || profile.email.split('@')[0]}
          </div>
          <div className="text-xs font-normal text-muted-foreground">
            {ADMIN_ROLE_LABELS[profile.rol]}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => notReady('Mi perfil')}>
          <User className="size-4" />
          Mi perfil
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => notReady('Ajustes')}>
          <Settings className="size-4" />
          Ajustes
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? <Moon className="size-4" /> : theme === 'light' ? <Sun className="size-4" /> : <MonitorSmartphone className="size-4" />}
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

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {densidad === 'compact' ? <Rows4 className="size-4" /> : densidad === 'comfortable' ? <Rows2 className="size-4" /> : <Rows3 className="size-4" />}
            Densidad
            <span className="ml-auto text-xs text-muted-foreground capitalize">
              {densidad === 'normal' ? 'normal' : densidad === 'compact' ? 'compacta' : 'cómoda'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => setDensidad('compact')}>
                <Rows4 className="size-4" />
                <span>Compacta</span>
                {densidad === 'compact' && <span className="ml-auto text-xs">●</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDensidad('normal')}>
                <Rows3 className="size-4" />
                <span>Normal</span>
                {densidad === 'normal' && <span className="ml-auto text-xs">●</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDensidad('comfortable' as Densidad)}>
                <Rows2 className="size-4" />
                <span>Cómoda</span>
                {densidad === 'comfortable' && <span className="ml-auto text-xs">●</span>}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => router.push('/hub')} className={cn('gap-2')}>
          <ExternalLink className="size-4" />
          <div className="flex flex-col">
            <span>Hub clásico</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              Vista anterior, en migración
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
