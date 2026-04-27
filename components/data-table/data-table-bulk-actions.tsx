'use client'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DataTableBulkActionsProps<TData> {
  selectedCount: number
  selectedRows: TData[]
  onClear: () => void
  render: (rows: TData[]) => React.ReactNode
  className?: string
}

/**
 * Footer flotante con acciones masivas. Visible solo cuando hay
 * al menos una fila seleccionada.
 */
export function DataTableBulkActions<TData>({
  selectedCount,
  selectedRows,
  onClear,
  render,
  className,
}: DataTableBulkActionsProps<TData>) {
  if (selectedCount === 0) return null

  return (
    <div
      role="region"
      aria-label="Acciones masivas"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4',
        className,
      )}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClear}
          aria-label="Deseleccionar todo"
        >
          <X className="size-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">
          {selectedCount} seleccionada{selectedCount === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">{render(selectedRows)}</div>
      </div>
    </div>
  )
}
