'use client'

import * as React from 'react'
import { X, Star, Bookmark, BookmarkPlus, ChevronDown, Trash2 } from 'lucide-react'

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
import { cn } from '@/lib/utils'

export type ActiveFilter = {
  key: string
  label: string
  onRemove: () => void
}

export type SavedView = {
  id: string
  label: string
}

export interface FilterBarProps {
  filters?: ActiveFilter[]
  savedViews?: SavedView[]
  activeViewId?: string | null
  onClearAll?: () => void
  onLoadView?: (id: string) => void
  onSaveView?: () => void
  onDeleteView?: (id: string) => void
  className?: string
}

/**
 * Barra de filtros activos + selector de vistas guardadas.
 *
 * Si `filters` y `savedViews` están vacíos (y no hay handler `onSaveView`
 * para mostrar al menos el botón "Guardar"), retorna null.
 *
 * @example
 *   <FilterBar
 *     filters={[
 *       { key: 'estado', label: 'Estado: Activo', onRemove: () => clearFilter('estado') },
 *     ]}
 *     onClearAll={clearAll}
 *     savedViews={savedViews}
 *     activeViewId={null}
 *     onLoadView={loadView}
 *     onSaveView={openSaveDialog}
 *     onDeleteView={deleteView}
 *   />
 */
export function FilterBar({
  filters = [],
  savedViews = [],
  activeViewId = null,
  onClearAll,
  onLoadView,
  onSaveView,
  onDeleteView,
  className,
}: FilterBarProps) {
  const hasFilters = filters.length > 0
  const hasViews   = savedViews.length > 0
  const hasViewActions = !!onLoadView || !!onSaveView

  if (!hasFilters && !hasViews && !hasViewActions) return null

  const activeView = activeViewId
    ? savedViews.find((v) => v.id === activeViewId) ?? null
    : null

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2 md:px-6',
        className,
      )}
    >
      {/* Vistas guardadas (izquierda) */}
      {(hasViews || onSaveView) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Bookmark className="size-3.5 text-muted-foreground" />
              <span className="font-medium">
                {activeView ? activeView.label : 'Vistas'}
              </span>
              <ChevronDown className="size-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Vistas guardadas
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hasViews ? (
              savedViews.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-1 rounded-sm pr-1 hover:bg-accent/60"
                >
                  <button
                    type="button"
                    className={cn(
                      'flex flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                      v.id === activeViewId && 'font-medium text-foreground',
                    )}
                    onClick={() => onLoadView?.(v.id)}
                  >
                    {v.id === activeViewId && (
                      <Star className="size-3 fill-primary text-primary" />
                    )}
                    <span className="truncate">{v.label}</span>
                  </button>
                  {onDeleteView && (
                    <button
                      type="button"
                      aria-label={`Eliminar vista ${v.label}`}
                      onClick={() => onDeleteView(v.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Aún no tenés vistas guardadas.
              </div>
            )}
            {onSaveView && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSaveView}>
                  <BookmarkPlus className="size-4" />
                  Guardar vista actual…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Chips de filtros activos */}
      {hasFilters && (
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
          {filters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className="h-7 shrink-0 gap-1 pl-2 pr-1 text-xs font-medium"
            >
              <span className="truncate">{f.label}</span>
              <button
                type="button"
                aria-label={`Quitar filtro ${f.label}`}
                onClick={f.onRemove}
                className="rounded-sm p-0.5 transition-colors hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {hasFilters && onClearAll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="ml-auto h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Limpiar todo
        </Button>
      )}
    </div>
  )
}
