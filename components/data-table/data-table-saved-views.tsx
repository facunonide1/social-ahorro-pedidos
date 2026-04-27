'use client'

import * as React from 'react'
import { Bookmark, BookmarkPlus, ChevronDown, Star, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SavedView } from '@/lib/hooks/use-table-state'
import { cn } from '@/lib/utils'

interface DataTableSavedViewsProps {
  savedViews: SavedView[]
  activeViewId?: string | null
  onLoadView: (id: string) => void
  onSaveView: (name: string) => void
  onDeleteView: (id: string) => void
}

/**
 * Dropdown de saved views integrado al toolbar del DataTable.
 * Abre un Dialog para nombrar una vista nueva.
 */
export function DataTableSavedViews({
  savedViews,
  activeViewId = null,
  onLoadView,
  onSaveView,
  onDeleteView,
}: DataTableSavedViewsProps) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')

  const active = activeViewId
    ? savedViews.find((v) => v.id === activeViewId) ?? null
    : null

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    onSaveView(trimmed)
    setName('')
    setOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Bookmark className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">{active ? active.name : 'Vistas'}</span>
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Vistas guardadas
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {savedViews.length > 0 ? (
            savedViews.map((v) => (
              <div
                key={v.id}
                className="group flex items-center gap-1 rounded-sm pr-1 hover:bg-accent/60"
              >
                <button
                  type="button"
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                    v.id === activeViewId && 'font-medium text-foreground',
                  )}
                  onClick={() => onLoadView(v.id)}
                >
                  {v.id === activeViewId && (
                    <Star className="size-3 fill-primary text-primary" />
                  )}
                  <span className="truncate">{v.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar vista ${v.name}`}
                  onClick={() => onDeleteView(v.id)}
                  className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Aún no tenés vistas guardadas.
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <BookmarkPlus className="size-4" />
            Guardar vista actual…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar vista</DialogTitle>
            <DialogDescription>
              Guardá los filtros, orden y columnas actuales con un nombre
              para volver fácil después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="saved-view-name">Nombre</Label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Activos con saldo"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
