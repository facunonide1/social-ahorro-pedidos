'use client'

import { useEffect } from 'react'
import { Check, ChevronsUpDown, Building2 } from 'lucide-react'
import { useSucursal } from '@/lib/hooks/use-sucursal'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { useSucursalStore } from '@/lib/stores/sucursal-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Selector global de sucursal.
 *
 * - Roles transversales y centrales (super_admin, gerente, comprador,
 *   tesoreria, etc.) ven el dropdown con "Todas" + las 4 sucursales.
 * - Rol 'sucursal' (legacy) NO ve dropdown: muestra un badge con su
 *   sucursal y el store queda fijado a `sucursalId` automáticamente.
 */
export function SucursalSelector() {
  const {
    sucursalActiva,
    sucursalesDisponibles,
    sucursalActivaData,
    isAllSucursales,
    isHydrated,
    setSucursalActiva,
  } = useSucursal()
  const { rol, sucursalId, isReady } = usePermissions()
  const isLoading = useSucursalStore((s) => s.isLoading)

  // Si el rol está limitado a una sucursal, fijar el store a su sucursal_id.
  useEffect(() => {
    if (!isReady || !isHydrated) return
    if (rol === 'sucursal' && sucursalId && sucursalActiva !== sucursalId) {
      setSucursalActiva(sucursalId)
    }
  }, [isReady, isHydrated, rol, sucursalId, sucursalActiva, setSucursalActiva])

  if (!isHydrated || !isReady) {
    return <Skeleton className="h-9 w-44" />
  }

  // Rol fijado a una sucursal: badge no clickeable.
  if (rol === 'sucursal') {
    const propia = sucursalesDisponibles.find((s) => s.id === sucursalId)
    return (
      <Badge variant="outline" className="h-9 gap-2 px-3 font-medium">
        <Building2 className="size-3.5 text-muted-foreground" />
        {propia?.nombre ?? 'Tu sucursal'}
      </Badge>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 min-w-[10rem] justify-between gap-2">
          <span className="flex items-center gap-2 truncate">
            <Building2 className="size-3.5 text-muted-foreground" />
            <span className="truncate">
              {isAllSucursales ? 'Todas las sucursales' : sucursalActivaData?.nombre ?? 'Seleccionar...'}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Sucursal activa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setSucursalActiva('todas')}>
          <Check className={cn('size-4', isAllSucursales ? 'opacity-100' : 'opacity-0')} />
          <span>Todas las sucursales</span>
          <span className="ml-auto text-xs text-muted-foreground">consolidado</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isLoading && sucursalesDisponibles.length === 0 ? (
          <div className="space-y-1 p-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          sucursalesDisponibles.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => setSucursalActiva(s.id)}>
              <Check className={cn('size-4', sucursalActiva === s.id ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{s.nombre}</span>
              {s.codigo && (
                <span className="ml-auto text-xs text-muted-foreground">{s.codigo}</span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
