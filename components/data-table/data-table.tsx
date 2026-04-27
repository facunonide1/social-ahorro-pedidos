'use client'

import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table as TTable,
  type VisibilityState,
} from '@tanstack/react-table'
import type { LucideIcon } from 'lucide-react'

import { useTableState } from '@/lib/hooks/use-table-state'
import { useUIStore, type Densidad } from '@/lib/stores/ui-store'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ErrorState } from '@/components/feedback/error-state'
import { EmptyState } from '@/components/feedback/empty-state'
import { LoadingState } from '@/components/feedback/loading-state'

import {
  DataTableToolbar,
  type FilterableColumn,
} from '@/components/data-table/data-table-toolbar'
import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { DataTableBulkActions } from '@/components/data-table/data-table-bulk-actions'
import { selectColumn, actionsColumn, type DataTableMeta } from '@/lib/utils/data-table'
import { type ExportConfig } from '@/components/data-table/data-table-export'
import { cn } from '@/lib/utils'

/* ---------- types ---------- */

export type SearchableColumn = {
  id: string
  label: string
}

export type DataTableEmpty = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]

  /** Skeleton mientras carga. */
  loading?: boolean
  error?: unknown
  onRetry?: () => void

  searchableColumns?: SearchableColumn[]
  searchPlaceholder?: string

  filterableColumns?: FilterableColumn[]

  /** Identificador para `useTableState` (URL + localStorage). */
  stateKey?: string

  rowActions?: (row: TData) => React.ReactNode
  bulkActions?: (selected: TData[]) => React.ReactNode
  toolbarActions?: React.ReactNode

  enableRowSelection?: boolean
  enableColumnVisibility?: boolean
  enableSavedViews?: boolean

  exportable?: ExportConfig

  onRowClick?: (row: TData) => void

  emptyState?: DataTableEmpty

  className?: string
}

/* ---------- density mapping ---------- */

const DENSITY_CELL_PADDING: Record<Densidad, string> = {
  compact:     'py-1 px-3 text-xs',
  normal:      'py-2 px-3 text-sm',
  comfortable: 'py-3 px-3 text-sm',
}

/* ---------- helpers ---------- */

function alignClass(meta?: DataTableMeta): string {
  if (meta?.align === 'right') return 'text-right'
  if (meta?.align === 'center') return 'text-center'
  return ''
}

/* ---------- component ---------- */

/**
 * DataTable profesional con TanStack v8.
 *
 * Conecta automáticamente con `useTableState` para persistir search,
 * sort, filtros y página en URL; visibilidad/orden de columnas y
 * saved views en localStorage; densidad en `ui-store`.
 *
 * Para virtualización (data > 100 filas), envolver `<TableBody>` con
 * `useVirtualizer` de @tanstack/react-virtual. No incluido en T-E
 * para no inflar el bundle.
 *
 * @example
 *   <DataTable
 *     stateKey="proveedores-list"
 *     columns={columns}
 *     data={proveedores}
 *     loading={isLoading}
 *     searchableColumns={[{ id: 'nombre', label: 'Nombre' }]}
 *     filterableColumns={[{ id: 'estado', label: 'Estado', options: [...] }]}
 *     rowActions={(row) => <DataTableRowActions>...</DataTableRowActions>}
 *     bulkActions={(rows) => <Button>Eliminar {rows.length}</Button>}
 *     toolbarActions={<Button>+ Nuevo</Button>}
 *     enableRowSelection
 *     enableSavedViews
 *     exportable
 *     onRowClick={(row) => router.push(`/admin/.../${row.id}`)}
 *     emptyState={{ icon: Building2, title: 'Sin proveedores', action: ... }}
 *   />
 */
export function DataTable<TData>({
  columns,
  data,
  loading = false,
  error,
  onRetry,
  searchableColumns,
  searchPlaceholder,
  filterableColumns,
  stateKey = 'datatable',
  rowActions,
  bulkActions,
  toolbarActions,
  enableRowSelection = false,
  enableColumnVisibility = true,
  enableSavedViews = false,
  exportable,
  onRowClick,
  emptyState,
  className,
}: DataTableProps<TData>) {
  const ts = useTableState(stateKey)
  const density = useUIStore((s) => s.densidad)

  // Selección NO se persiste; se mantiene en memoria de la sesión.
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Construir columnas finales: select al inicio + actions al final.
  const finalColumns = React.useMemo<ColumnDef<TData>[]>(() => {
    const cols: ColumnDef<TData>[] = []
    if (enableRowSelection) cols.push(selectColumn<TData>())
    cols.push(...columns)
    if (rowActions) cols.push(actionsColumn<TData>(rowActions))
    return cols
  }, [columns, enableRowSelection, rowActions])

  // Mapeo TanStack ↔ useTableState
  const sorting: SortingState = React.useMemo(
    () => (ts.sort ? [ts.sort] : []),
    [ts.sort],
  )

  const columnFilters: ColumnFiltersState = React.useMemo(
    () =>
      Object.entries(ts.filters).map(([id, value]) => ({ id, value })),
    [ts.filters],
  )

  const columnVisibility: VisibilityState = ts.columnVisibility

  const pagination = React.useMemo(
    () => ({ pageIndex: Math.max(0, ts.page - 1), pageSize: ts.pageSize }),
    [ts.page, ts.pageSize],
  )

  const searchableIds = React.useMemo(
    () => new Set((searchableColumns ?? []).map((c) => c.id)),
    [searchableColumns],
  )

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
      globalFilter: ts.search,
    },
    enableRowSelection,
    enableMultiSort: true,

    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      ts.setSort(next[0] ?? null)
    },
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater
      const map: Record<string, unknown> = {}
      for (const f of next) map[f.id] = f.value
      // Diff con ts.filters: setear nuevos, borrar los que dejaron de existir
      const allKeys = Array.from(
        new Set<string>([...Object.keys(ts.filters), ...Object.keys(map)]),
      )
      for (const k of allKeys) {
        if (k in map) ts.setFilter(k, map[k])
        else ts.setFilter(k, undefined)
      }
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      ts.setColumnVisibility(next)
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      if (next.pageSize !== ts.pageSize) ts.setPageSize(next.pageSize)
      if (next.pageIndex + 1 !== ts.page) ts.setPage(next.pageIndex + 1)
    },
    onGlobalFilterChange: (s: unknown) => ts.setSearch(typeof s === 'string' ? s : ''),
    onRowSelectionChange: setRowSelection,

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),

    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true
      const q = String(filterValue).toLowerCase()
      // Si no se definieron searchableColumns, busca en todos los strings
      const ids = searchableIds.size > 0
        ? Array.from(searchableIds)
        : row.getAllCells().map((c) => c.column.id)
      for (const id of ids) {
        const v = row.getValue(id)
        if (v != null && String(v).toLowerCase().includes(q)) return true
      }
      return false
    },
  })

  const cellPadding = DENSITY_CELL_PADDING[density]
  const filteredRows = table.getFilteredRowModel().rows
  const isFiltered = table.getState().columnFilters.length > 0 || (ts.search?.length ?? 0) > 0
  const showEmpty = !loading && !error && filteredRows.length === 0

  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card', className)}>
      <DataTableToolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        enableSearch={(searchableColumns?.length ?? 0) > 0}
        filterableColumns={filterableColumns}
        enableViewOptions={enableColumnVisibility}
        enableSavedViews={enableSavedViews}
        savedViews={ts.savedViews}
        activeViewId={null}
        onLoadView={ts.loadView}
        onSaveView={ts.saveView}
        onDeleteView={ts.deleteView}
        exportable={exportable}
        toolbarActions={toolbarActions}
        search={ts.search}
        onSearchChange={ts.setSearch}
      />

      <div className="relative overflow-x-auto border-y border-border">
        {error ? (
          <div className="p-4">
            <ErrorState
              title="No pudimos cargar los datos"
              description="Hubo un problema al traer la información."
              error={error}
              onRetry={onRetry}
            />
          </div>
        ) : loading && data.length === 0 ? (
          <div className="p-4">
            <LoadingState rows={8} />
          </div>
        ) : showEmpty ? (
          <div className="p-4">
            <DataTableEmptyView isFiltered={isFiltered} emptyState={emptyState} />
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b border-border">
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta as DataTableMeta | undefined
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(alignClass(meta))}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        aria-sort={
                          header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : undefined
                        }
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading && (
                <tr aria-hidden>
                  <td colSpan={table.getAllLeafColumns().length} className="h-0 p-0">
                    <div className="h-0.5 w-full animate-pulse bg-primary/40" />
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={(e) => {
                    if (!onRowClick) return
                    // No disparar onRowClick al hacer click en checkbox/menu
                    const target = e.target as HTMLElement
                    if (target.closest('[role="checkbox"], [role="menu"], [role="menuitem"], [data-no-row-click], button, a, input')) return
                    onRowClick(row.original)
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as DataTableMeta | undefined
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cellPadding,
                          alignClass(meta),
                          meta?.tabularNums && 'tabular-nums',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DataTablePagination table={table} />

      {bulkActions && enableRowSelection && (
        <DataTableBulkActions
          selectedCount={Object.values(rowSelection).filter(Boolean).length}
          selectedRows={table
            .getFilteredSelectedRowModel()
            .rows.map((r) => r.original)}
          onClear={() => setRowSelection({})}
          render={(rows) => bulkActions(rows)}
        />
      )}
    </div>
  )
}

/* ---------- empty subview ---------- */

function DataTableEmptyView({
  isFiltered,
  emptyState,
}: {
  isFiltered: boolean
  emptyState?: DataTableEmpty
}) {
  if (isFiltered) {
    return (
      <EmptyState
        title="Sin resultados"
        description="Probá ajustar la búsqueda o limpiar los filtros."
      />
    )
  }
  if (emptyState) {
    return (
      <EmptyState
        icon={emptyState.icon}
        title={emptyState.title}
        description={emptyState.description}
        action={emptyState.action}
      />
    )
  }
  return <EmptyState title="No hay datos" />
}

/* ---------- re-exports ---------- */

export type { TTable }
