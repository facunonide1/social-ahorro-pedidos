'use client'

import * as React from 'react'
import { Check, PlusCircle, type LucideIcon } from 'lucide-react'
import type { Column } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type FacetedOption = {
  label: string
  value: string
  icon?: LucideIcon
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title: string
  options: FacetedOption[]
}

/**
 * Filtro multi-select con búsqueda y conteos faceted (TanStack
 * `getFacetedUniqueValues`).
 *
 * - Trigger: botón con `+ Title (chip de seleccionados)` cuando hay
 *   selección, o `+ Title` cuando está vacío.
 * - Búsqueda dentro del popover si hay > 5 opciones.
 * - Conteo por opción.
 * - Footer con "Limpiar filtros" cuando hay selección.
 */
export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues()
  const selectedValues = new Set((column?.getFilterValue() as string[]) ?? [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-dashed">
          <PlusCircle className="size-3.5" />
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selectedValues.size} seleccionados
                  </Badge>
                ) : (
                  options
                    .filter((o) => selectedValues.has(o.value))
                    .map((o) => (
                      <Badge
                        variant="secondary"
                        key={o.value}
                        className="rounded-sm px-1 font-normal"
                      >
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {options.length > 5 && <CommandInput placeholder={title} />}
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                const count = facets?.get(option.value) ?? 0
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) selectedValues.delete(option.value)
                      else selectedValues.add(option.value)
                      const filterValues = Array.from(selectedValues)
                      column?.setFilterValue(filterValues.length ? filterValues : undefined)
                    }}
                  >
                    <div
                      className={cn(
                        'mr-2 flex size-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible',
                      )}
                    >
                      <Check className="size-3" />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 size-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                    {count > 0 && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Limpiar filtros
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
