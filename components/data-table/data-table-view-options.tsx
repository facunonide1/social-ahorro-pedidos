'use client'

import { Settings2 } from 'lucide-react'
import type { Table } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

/**
 * Dropdown para mostrar/ocultar columnas. Excluye las que tienen
 * `enableHiding: false` y las internas (selección/acciones).
 */
export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const columns = table
    .getAllColumns()
    .filter((c) => typeof c.accessorFn !== 'undefined' && c.getCanHide())

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5">
          <Settings2 className="size-3.5" />
          <span className="hidden sm:inline">Columnas</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Mostrar columnas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            className="capitalize"
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
          >
            {(column.columnDef.meta as { headerLabel?: string } | undefined)?.headerLabel ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
