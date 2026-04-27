'use client'

import { Download, FileSpreadsheet, FileText, FileType } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ExportFormat = 'csv' | 'excel' | 'pdf'

export type ExportConfig =
  | boolean
  | {
      csv?: boolean
      excel?: boolean
      pdf?: boolean
      /** Si se provee, T-D delega completamente la lógica acá. */
      customExport?: <TData>(rows: TData[], format: ExportFormat) => void | Promise<void>
    }

interface DataTableExportProps<TData> {
  config: ExportConfig
  /** Filas FILTRADAS actualmente (sin paginación) — lo que se exporta. */
  rows: TData[]
}

function formatLabel(f: ExportFormat) {
  return f === 'csv' ? 'CSV' : f === 'excel' ? 'Excel' : 'PDF'
}

/**
 * Dropdown de exportación. En T-E todos los formatos son placeholders
 * que muestran un toast de "Exportando…" → "Listo" después de 500ms.
 *
 * En T-I se reemplaza por la lógica real con dynamic imports
 * (xlsx, jspdf, etc.).
 */
export function DataTableExport<TData>({ config, rows }: DataTableExportProps<TData>) {
  const cfg =
    typeof config === 'boolean'
      ? { csv: config, excel: config, pdf: config }
      : config

  const enabledFormats: ExportFormat[] = []
  if (cfg.csv)   enabledFormats.push('csv')
  if (cfg.excel) enabledFormats.push('excel')
  if (cfg.pdf)   enabledFormats.push('pdf')

  if (enabledFormats.length === 0) return null

  async function exportAs(format: ExportFormat) {
    const custom = (cfg as { customExport?: typeof export_default }).customExport
    if (custom) {
      await custom(rows, format)
      return
    }
    const tid = toast.loading(`Exportando ${formatLabel(format)}…`, {
      description: `${rows.length} fila${rows.length === 1 ? '' : 's'}`,
    })
    setTimeout(() => {
      toast.success(`Listo (${formatLabel(format)})`, {
        id: tid,
        description: 'Implementación real en T-I (dynamic imports).',
      })
    }, 500)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Exportar {rows.length} fila{rows.length === 1 ? '' : 's'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {cfg.csv && (
          <DropdownMenuItem onSelect={() => exportAs('csv')}>
            <FileText className="size-4" /> CSV
          </DropdownMenuItem>
        )}
        {cfg.excel && (
          <DropdownMenuItem onSelect={() => exportAs('excel')}>
            <FileSpreadsheet className="size-4" /> Excel
          </DropdownMenuItem>
        )}
        {cfg.pdf && (
          <DropdownMenuItem onSelect={() => exportAs('pdf')}>
            <FileType className="size-4" /> PDF
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Type helper for the customExport signature inference.
declare const export_default: <TData>(rows: TData[], format: ExportFormat) => void | Promise<void>
