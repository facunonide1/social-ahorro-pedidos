'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import type { Table } from '@tanstack/react-table'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/lib/hooks/use-debounce'
import type { SavedView } from '@/lib/hooks/use-table-state'

import { DataTableViewOptions } from '@/components/data-table/data-table-view-options'
import { DataTableFacetedFilter, type FacetedOption } from '@/components/data-table/data-table-faceted-filter'
import { DataTableSavedViews } from '@/components/data-table/data-table-saved-views'
import {
  DataTableExport,
  type ExportConfig,
} from '@/components/data-table/data-table-export'

export type FilterableColumn = {
  id: string
  label: string
  options: FacetedOption[]
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  searchPlaceholder?: string
  enableSearch?: boolean
  filterableColumns?: FilterableColumn[]
  enableViewOptions?: boolean
  enableSavedViews?: boolean
  savedViews?: SavedView[]
  activeViewId?: string | null
  onLoadView?: (id: string) => void
  onSaveView?: (name: string) => void
  onDeleteView?: (id: string) => void
  exportable?: ExportConfig
  toolbarActions?: React.ReactNode
  search: string
  onSearchChange: (s: string) => void
}

/**
 * Toolbar del DataTable. Combina:
 * - Search global con debounce
 * - Faceted filters por columna
 * - Botón "Limpiar" cuando hay filtros activos
 * - Saved views
 * - Visibilidad de columnas
 * - Export
 * - Acciones custom (toolbarActions)
 */
export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = 'Buscar…',
  enableSearch = true,
  filterableColumns = [],
  enableViewOptions = true,
  enableSavedViews = false,
  savedViews,
  activeViewId,
  onLoadView,
  onSaveView,
  onDeleteView,
  exportable,
  toolbarActions,
  search,
  onSearchChange,
}: DataTableToolbarProps<TData>) {
  const [draft, setDraft] = React.useState(search)
  const debounced = useDebounce(draft, 250)

  // Atajo Cmd+/ o Ctrl+/ para focus en search
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    if (debounced !== search) onSearchChange(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // Si la URL cambia el search externamente, sincronizamos el draft
  React.useEffect(() => {
    if (search !== draft && search !== debounced) setDraft(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const isFiltered =
    table.getState().columnFilters.length > 0 || (search?.length ?? 0) > 0

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      {enableSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Buscar"
            className="h-8 w-[200px] pl-7 lg:w-[260px]"
          />
        </div>
      )}

      {filterableColumns.map((f) => {
        const column = table.getColumn(f.id)
        if (!column) return null
        return (
          <DataTableFacetedFilter
            key={f.id}
            column={column}
            title={f.label}
            options={f.options}
          />
        )
      })}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            table.resetColumnFilters()
            setDraft('')
            onSearchChange('')
          }}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Limpiar
          <X className="size-3" />
        </Button>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {toolbarActions}

        {enableSavedViews && savedViews && onLoadView && onSaveView && onDeleteView && (
          <DataTableSavedViews
            savedViews={savedViews}
            activeViewId={activeViewId}
            onLoadView={onLoadView}
            onSaveView={onSaveView}
            onDeleteView={onDeleteView}
          />
        )}

        {exportable && (
          <DataTableExport
            config={exportable}
            rows={table.getFilteredRowModel().rows.map((r) => r.original)}
          />
        )}

        {enableViewOptions && <DataTableViewOptions table={table} />}
      </div>
    </div>
  )
}
