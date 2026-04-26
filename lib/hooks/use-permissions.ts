'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ROL_A_DEPARTAMENTOS_LEGACY,
  ROLES_TRANSVERSALES,
  ROLES_JEFE_LEGACY,
} from '@/lib/types/admin'
import type { AdminRole, Departamento } from '@/lib/types/admin'

type PermissionsState = {
  rol: AdminRole | null
  sucursalId: string | null
  isLoading: boolean
  isReady: boolean
}

/**
 * Hook de permisos del usuario actual.
 *
 * **Modelo legacy (v1)**: hasta que se aplique el refactor de roles
 * v2 + tabla `rol_departamento`, traducimos roles → departamentos
 * usando el mapeo `ROL_A_DEPARTAMENTOS_LEGACY` definido en TS.
 *
 * Cuando llegue la migración v2, este hook va a:
 *   1. Consultar `current_admin_role()` (ya existe)
 *   2. Consultar `user_departamentos(user_id)` (nuevo)
 *   3. Consultar `user_es_jefe(user_id, dept)` (nuevo)
 *
 * Por ahora hace una sola query a `users_admin` y deriva todo en JS.
 */
export function usePermissions() {
  const [state, setState] = useState<PermissionsState>({
    rol: null,
    sucursalId: null,
    isLoading: true,
    isReady: false,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) {
        if (!cancelled) setState({ rol: null, sucursalId: null, isLoading: false, isReady: true })
        return
      }
      const { data } = await sb
        .from('users_admin')
        .select('rol, sucursal_id, activo')
        .eq('id', user.id)
        .maybeSingle<{ rol: AdminRole; sucursal_id: string | null; activo: boolean }>()

      if (cancelled) return
      if (!data?.activo) {
        setState({ rol: null, sucursalId: null, isLoading: false, isReady: true })
        return
      }
      setState({
        rol: data.rol,
        sucursalId: data.sucursal_id,
        isLoading: false,
        isReady: true,
      })
    })()
    return () => { cancelled = true }
  }, [])

  const departamentos: Departamento[] = useMemo(
    () => (state.rol ? ROL_A_DEPARTAMENTOS_LEGACY[state.rol] ?? [] : []),
    [state.rol],
  )

  const esSuperAdmin     = state.rol === 'super_admin'
  const esGerenteGeneral = state.rol === 'gerente'  // legacy: 'gerente' = gerente_general
  const esAuditor        = state.rol === 'auditor'
  const esTransversal    = state.rol ? ROLES_TRANSVERSALES.includes(state.rol) : false

  /**
   * En el modelo legacy solo super_admin y gerente son "jefes globales".
   * Cuando llegue v2, esto consulta `user_es_jefe(user, dept)`.
   */
  function esJefe(_dept: Departamento): boolean {
    return state.rol ? ROLES_JEFE_LEGACY.includes(state.rol) : false
  }

  function tieneAccesoDepartamento(dept: Departamento): boolean {
    return departamentos.includes(dept)
  }

  /**
   * - Roles transversales: acceso a TODA sucursal (incluso null).
   * - Rol 'sucursal' (legacy): solo si coincide con su sucursalId.
   * - Otros roles centrales (compras/finanzas): acceso a TODA sucursal.
   *
   * Si la entidad consultada no tiene sucursal (sucId = null) y el
   * user es 'sucursal', NO tiene acceso.
   */
  function tieneAccesoSucursal(sucId: string | null): boolean {
    if (!state.rol) return false
    if (esTransversal) return true
    if (state.rol === 'sucursal') {
      return sucId !== null && state.sucursalId === sucId
    }
    return true
  }

  return {
    rol: state.rol,
    sucursalId: state.sucursalId,
    departamentos,
    esJefe,
    esSuperAdmin,
    esGerenteGeneral,
    esAuditor,
    esTransversal,
    tieneAccesoDepartamento,
    tieneAccesoSucursal,
    isLoading: state.isLoading,
    isReady: state.isReady,
  }
}
