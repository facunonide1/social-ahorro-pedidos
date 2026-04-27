import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header'
import { formatARS, formatDate, formatNumber } from '@/lib/utils/format'

/* =====================================================================
 * Helpers para crear `ColumnDef<TData>` con menos boilerplate.
 *
 * Convención:
 * - Todos los helpers aceptan opcionalmente `meta` para configurar
 *   visibilidad mobile, números tabulares, pinning, etc.
 * - El header se renderiza con `<DataTableColumnHeader>` que ya
 *   provee sort + alineación.
 * ================================================================== */

export type DataTableMeta = {
  /** Aplica `tabular-nums` al cell. */
  tabularNums?: boolean
  /** Si está fijada al hacer scroll horizontal. */
  pinned?: 'left' | 'right'
  /** Si la columna tiene prioridad para mobile. */
  priority?: 'mobile' | 'normal'
  /** Alineación del cell (default 'left'). */
  align?: 'left' | 'center' | 'right'
  /** Label visible en el dropdown de "Columnas" (default = id). */
  headerLabel?: string
}

/* ---------- selección ---------- */

export function selectColumn<TData>(): ColumnDef<TData> {
  return {
    id: '__select__',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Seleccionar todas las filas"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
    meta: { pinned: 'left', priority: 'mobile' } satisfies DataTableMeta,
  }
}

/* ---------- acciones ---------- */

export function actionsColumn<TData>(
  render: (row: TData) => React.ReactNode,
): ColumnDef<TData> {
  return {
    id: '__actions__',
    header: '',
    cell: ({ row }) => render(row.original),
    enableSorting: false,
    enableHiding: false,
    size: 48,
    meta: { pinned: 'right', priority: 'mobile' } satisfies DataTableMeta,
  }
}

/* ---------- texto sortable ---------- */

export function sortableColumn<TData>(opts: {
  accessorKey: keyof TData & string
  header: string
  meta?: DataTableMeta
  cell?: ColumnDef<TData>['cell']
}): ColumnDef<TData> {
  const { accessorKey, header, meta, cell } = opts
  return {
    accessorKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title={header} />,
    ...(cell ? { cell } : {}),
    meta: { ...(meta ?? {}), headerLabel: meta?.headerLabel ?? header } satisfies DataTableMeta,
  }
}

/* ---------- moneda ---------- */

export function currencyColumn<TData>(opts: {
  accessorKey: keyof TData & string
  header: string
  meta?: DataTableMeta
}): ColumnDef<TData> {
  const { accessorKey, header, meta } = opts
  return {
    accessorKey,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={header} align="right" />
    ),
    cell: ({ getValue }) => {
      const v = getValue() as number | null | undefined
      return <div className="text-right tabular-nums">{formatARS(v ?? 0)}</div>
    },
    meta: {
      ...(meta ?? {}),
      tabularNums: true,
      align: 'right',
      headerLabel: meta?.headerLabel ?? header,
    } satisfies DataTableMeta,
  }
}

/* ---------- fecha ---------- */

export function dateColumn<TData>(opts: {
  accessorKey: keyof TData & string
  header: string
  format?: string
  meta?: DataTableMeta
}): ColumnDef<TData> {
  const { accessorKey, header, format = 'dd/MM/yyyy', meta } = opts
  return {
    accessorKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title={header} />,
    cell: ({ getValue }) => {
      const v = getValue() as string | Date | null | undefined
      return (
        <span className="tabular-nums text-muted-foreground">
          {formatDate(v ?? null, format)}
        </span>
      )
    },
    meta: {
      ...(meta ?? {}),
      tabularNums: true,
      headerLabel: meta?.headerLabel ?? header,
    } satisfies DataTableMeta,
  }
}

/* ---------- número ---------- */

export function numberColumn<TData>(opts: {
  accessorKey: keyof TData & string
  header: string
  decimals?: number
  meta?: DataTableMeta
}): ColumnDef<TData> {
  const { accessorKey, header, decimals = 0, meta } = opts
  return {
    accessorKey,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={header} align="right" />
    ),
    cell: ({ getValue }) => {
      const v = getValue() as number | null | undefined
      return (
        <div className="text-right tabular-nums">
          {formatNumber(v ?? 0, decimals)}
        </div>
      )
    },
    meta: {
      ...(meta ?? {}),
      tabularNums: true,
      align: 'right',
      headerLabel: meta?.headerLabel ?? header,
    } satisfies DataTableMeta,
  }
}

/* ---------- badge (estado) ---------- */

type BadgeVariant = NonNullable<BadgeProps['variant']>

export function badgeColumn<TData>(opts: {
  accessorKey: keyof TData & string
  header: string
  variants: Record<string, { label: string; variant: BadgeVariant }>
  meta?: DataTableMeta
}): ColumnDef<TData> {
  const { accessorKey, header, variants, meta } = opts
  return {
    accessorKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title={header} />,
    cell: ({ getValue }) => {
      const raw = String(getValue() ?? '')
      const cfg = variants[raw]
      if (!cfg) return <Badge variant="outline">{raw || '—'}</Badge>
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>
    },
    filterFn: (row, columnId, filterValue) => {
      if (Array.isArray(filterValue) && filterValue.length > 0) {
        return filterValue.includes(row.getValue(columnId))
      }
      return true
    },
    meta: { ...(meta ?? {}), headerLabel: meta?.headerLabel ?? header } satisfies DataTableMeta,
  }
}
