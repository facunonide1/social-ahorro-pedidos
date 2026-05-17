'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'

import type { TareaConTipo, TipoTarea, TareaCategoria, TareaPrioridad, TareaEstado } from '@/lib/types/tareas'
import {
  TAREA_CATEGORIA_LABELS,
  TAREA_ESTADO_LABELS,
  TAREA_PRIORIDAD_LABELS,
} from '@/lib/constants/tareas'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TaskCard } from '@/components/tareas/task-card'
import { NuevaTareaSheet } from './nueva-tarea-sheet'

type UserOption = { id: string; nombre: string | null; email: string }
type UserMap = Record<string, { nombre: string | null; email: string }>

const NONE = '__all__'

const ESTADOS_FILTRO: TareaEstado[] = [
  'pendiente',
  'asignada',
  'en_progreso',
  'en_verificacion',
  'en_aprobacion',
  'bloqueada',
  'completada',
  'vencida',
]

const PRIORIDADES_FILTRO: TareaPrioridad[] = ['baja', 'media', 'alta', 'critica']

const CATEGORIAS_FILTRO: TareaCategoria[] = [
  'finanzas',
  'compras',
  'operaciones',
  'rrhh',
  'comercial',
  'sucursal',
  'regulatorio',
  'limpieza',
  'seguridad',
  'inventario',
  'otro',
]

export function TareasBandejaClient({
  tareas,
  tipos,
  users,
  usersMap,
  sucursales,
  currentUserId,
  currentUserRol,
}: {
  tareas: TareaConTipo[]
  tipos: TipoTarea[]
  users: UserOption[]
  usersMap: UserMap
  sucursales: { id: string; nombre: string }[]
  currentUserId: string
  currentUserRol: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(k: string, v: string | null) {
    const sp = new URLSearchParams(params.toString())
    if (v === null || v === '' || v === NONE) sp.delete(k)
    else sp.set(k, v)
    router.push(`/admin/tareas?${sp.toString()}`)
  }

  const hayFiltros =
    Boolean(params.get('estado')) ||
    Boolean(params.get('prioridad')) ||
    Boolean(params.get('categoria'))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Filter className="size-3" />
            Filtros
          </span>
          <Select
            value={params.get('estado') ?? NONE}
            onValueChange={(v) => setParam('estado', v)}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Todos los estados</SelectItem>
              {ESTADOS_FILTRO.map((e) => (
                <SelectItem key={e} value={e}>
                  {TAREA_ESTADO_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={params.get('prioridad') ?? NONE}
            onValueChange={(v) => setParam('prioridad', v)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Toda prioridad</SelectItem>
              {PRIORIDADES_FILTRO.map((p) => (
                <SelectItem key={p} value={p}>
                  {TAREA_PRIORIDAD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={params.get('categoria') ?? NONE}
            onValueChange={(v) => setParam('categoria', v)}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Toda categoría</SelectItem>
              {CATEGORIAS_FILTRO.map((c) => (
                <SelectItem key={c} value={c}>
                  {TAREA_CATEGORIA_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const sp = new URLSearchParams()
                if (params.get('tab')) sp.set('tab', params.get('tab')!)
                router.push(`/admin/tareas?${sp.toString()}`)
              }}
              className="h-8 gap-1 text-xs"
            >
              <X className="size-3" />
              Limpiar
            </Button>
          )}
        </div>
        <NuevaTareaSheet
          tipos={tipos}
          users={users}
          sucursales={sucursales}
          currentUserId={currentUserId}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tareas.map((t) => (
          <TaskCard
            key={t.id}
            tarea={t}
            responsableNombre={
              t.responsable_id
                ? usersMap[t.responsable_id]?.nombre ||
                  usersMap[t.responsable_id]?.email ||
                  'Asignado'
                : null
            }
          />
        ))}
      </div>
    </div>
  )
}
