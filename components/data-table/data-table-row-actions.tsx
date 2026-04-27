'use client'

import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Wrapper para acciones por fila. Renderiza un botón ⋯ que abre un
 * dropdown con los items pasados como children.
 *
 * @example
 *   <DataTableRowActions>
 *     <DropdownMenuItem onClick={...}>Editar</DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem className="text-destructive" onClick={...}>
 *       Eliminar
 *     </DropdownMenuItem>
 *   </DataTableRowActions>
 */
export function DataTableRowActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Acciones de la fila"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
