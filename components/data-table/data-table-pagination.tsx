'use client'

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import type { Table } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  pageSizeOptions?: number[]
}

/**
 * Footer de paginación: total + filas por página + controles de página.
 */
export function DataTablePagination<TData>({
  table,
  pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps<TData>) {
  const pageIndex = table.getState().pagination.pageIndex
  const pageSize  = table.getState().pagination.pageSize
  const total     = table.getFilteredRowModel().rows.length
  const start     = total === 0 ? 0 : pageIndex * pageSize + 1
  const end       = Math.min(total, (pageIndex + 1) * pageSize)
  const selected  = table.getFilteredSelectedRowModel().rows.length

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-background px-3 py-2 text-sm sm:flex-row">
      <div className="text-xs text-muted-foreground">
        {selected > 0 ? (
          <span>
            <span className="font-medium text-foreground">{selected}</span> de {total} fila{total === 1 ? '' : 's'} seleccionada{selected === 1 ? '' : 's'}
          </span>
        ) : (
          <span>
            <span className="font-medium tabular-nums text-foreground">{start}–{end}</span>
            <span className="mx-1">de</span>
            <span className="font-medium tabular-nums text-foreground">{total}</span>
            <span className="ml-1">resultado{total === 1 ? '' : 's'}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filas:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Primera página"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-2 text-xs tabular-nums text-muted-foreground">
            {pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Página siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Última página"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
