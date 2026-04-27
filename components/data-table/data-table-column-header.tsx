'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react'
import type { Column } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
  align?: 'left' | 'center' | 'right'
}

/**
 * Header de columna con sort en 3 estados (asc → desc → ninguno).
 * Si la columna no es sortable, renderiza el title plano.
 *
 * Shift+Click sobre el botón mantiene el sort multi-columna (TanStack
 * lo gestiona si `enableMultiSort: true` está activo en la table).
 */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  align = 'left',
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div
        className={cn(
          align === 'right' && 'text-right',
          align === 'center' && 'text-center',
          className,
        )}
      >
        {title}
      </div>
    )
  }

  const sorted = column.getIsSorted()
  const sortIndex = column.getSortIndex()
  const showIndex = sortIndex >= 0 && column.getCanMultiSort() && sortIndex !== 0

  return (
    <div
      className={cn(
        'flex items-center',
        align === 'right' && 'justify-end',
        align === 'center' && 'justify-center',
        className,
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 gap-1 px-2 font-semibold uppercase tracking-wide text-muted-foreground"
            aria-label={`Ordenar por ${title}`}
          >
            <span>{title}</span>
            {sorted === 'desc' ? (
              <ArrowDown className="size-3" />
            ) : sorted === 'asc' ? (
              <ArrowUp className="size-3" />
            ) : (
              <ChevronsUpDown className="size-3 opacity-50" />
            )}
            {showIndex && (
              <span className="rounded bg-muted px-1 text-[9px] font-bold tabular-nums text-foreground">
                {sortIndex + 1}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className="size-3.5" /> Ascendente
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className="size-3.5" /> Descendente
          </DropdownMenuItem>
          {sorted && (
            <DropdownMenuItem onClick={() => column.clearSorting()}>
              <ChevronsUpDown className="size-3.5" /> Quitar orden
            </DropdownMenuItem>
          )}
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff className="size-3.5" /> Ocultar columna
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
