'use client'

import { useMemo } from 'react'
import { usePermissions } from '@/lib/hooks/use-permissions'
import {
  NAVEGACION_DEPARTAMENTAL,
  type DepartamentoNav,
} from '@/lib/constants/navegacion'
import { DEPARTAMENTO_LABELS } from '@/lib/types/admin'
import type { Departamento } from '@/lib/types/admin'

/**
 * Item simplificado de departamento para renderizar el TopNav.
 * Si `NAVEGACION_DEPARTAMENTAL[dept]` está definido (T-C en adelante),
 * se usan sus campos. Caso contrario armamos un stub con el label.
 */
export type DepartamentoItem = {
  id: Departamento
  label: string
  icon: string | null
  path: string
  badge?: string | null
}

/**
 * Lista los departamentos accesibles por el usuario actual, listos
 * para renderizar en el TopNav.
 *
 * En T-B la navegación está vacía, así que devolvemos stubs por
 * cada departamento permitido por el rol. En T-C, cuando se llene
 * `NAVEGACION_DEPARTAMENTAL`, automáticamente aparecen icon/path/etc.
 */
export function useDepartamentos(): {
  departamentos: DepartamentoItem[]
  isLoading: boolean
} {
  const { departamentos: deps, rol, isLoading } = usePermissions()

  const items: DepartamentoItem[] = useMemo(() => {
    return deps.map((id) => {
      const fromNav: DepartamentoNav | undefined = NAVEGACION_DEPARTAMENTAL[id]
      if (fromNav && (!fromNav.rolesPermitidos.length || (rol && fromNav.rolesPermitidos.includes(rol)))) {
        return {
          id,
          label: fromNav.label,
          icon: fromNav.icon,
          path: fromNav.path,
        }
      }
      return {
        id,
        label: DEPARTAMENTO_LABELS[id],
        icon: null,
        path: `/${id}`,
      }
    })
  }, [deps, rol])

  return { departamentos: items, isLoading }
}
