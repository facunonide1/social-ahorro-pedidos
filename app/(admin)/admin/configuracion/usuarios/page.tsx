import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisosCustom } from '@/lib/types/permisos'
import { PageHeader } from '@/components/shared/page-header'

import { UsuariosClient } from './usuarios-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usuarios y permisos' }

/** Fila unificada: una persona puede ser empleado, usuario del panel, o ambos. */
export type PersonaRow = {
  /** id de auth/users_admin si tiene cuenta; si no, null. */
  userId: string | null
  /** id de legajo de empleado si tiene; si no, null. */
  empleadoId: string | null
  tipo: 'empleado' | 'admin' | 'ambos'
  nombre: string | null
  email: string
  rol: AdminRole | null
  sucursal_id: string | null
  sucursales_acceso: string[]
  sucursal_nombre: string | null
  puesto: string | null
  tieneAcceso: boolean
  activo: boolean
  permisos_custom: PermisosCustom
  ultimo_login: string | null
  caller: boolean
}

export default async function UsuariosConfigPage() {
  const me = await requireAdminHubAccess({ allowedRoles: ['super_admin'] })
  const sb = createClient()

  const [{ data: uaRows }, { data: empRows }, { data: sucursalesData }] = await Promise.all([
    sb.from('users_admin').select('id, rol, sucursal_id, sucursales_acceso, activo, permisos_custom, sucursales(nombre)').order('activo', { ascending: false }),
    sb.from('empleados').select('id, nombre_completo, email, dni, puesto, sucursal_id, sucursales_acceso, activo, user_id, sucursales(nombre)').order('activo', { ascending: false }),
    sb.from('sucursales').select('id, nombre, activa').eq('activa', true).order('nombre'),
  ])

  // auth (nombre/email/último login) para usuarios del panel
  const adm = createAdminClient()
  const authMap = new Map<string, { nombre: string | null; email: string; ultimo_login: string | null }>()
  try {
    const { data } = await adm.auth.admin.listUsers({ page: 1, perPage: 500 })
    for (const u of data?.users ?? []) {
      authMap.set(u.id, {
        nombre: ((u.user_metadata as any)?.nombre as string | undefined) ?? null,
        email: u.email ?? '',
        ultimo_login: u.last_sign_in_at ?? null,
      })
    }
  } catch { /* sin service role */ }

  const empPorUser = new Map<string, any>()
  for (const e of (empRows ?? []) as any[]) if (e.user_id) empPorUser.set(e.user_id, e)

  const personas: PersonaRow[] = []

  // 1) Usuarios del panel (con o sin legajo vinculado)
  for (const u of (uaRows ?? []) as any[]) {
    const au = authMap.get(u.id)
    const emp = empPorUser.get(u.id)
    personas.push({
      userId: u.id,
      empleadoId: emp?.id ?? null,
      tipo: emp ? 'ambos' : 'admin',
      nombre: emp?.nombre_completo ?? au?.nombre ?? null,
      email: au?.email ?? emp?.email ?? '',
      rol: u.rol,
      sucursal_id: u.sucursal_id,
      sucursales_acceso: u.sucursales_acceso ?? [],
      sucursal_nombre: u.sucursales?.nombre ?? emp?.sucursales?.nombre ?? null,
      puesto: emp?.puesto ?? null,
      tieneAcceso: true,
      activo: u.activo,
      permisos_custom: (u.permisos_custom ?? {}) as PermisosCustom,
      ultimo_login: au?.ultimo_login ?? null,
      caller: u.id === me.id,
    })
  }

  // 2) Empleados SIN cuenta de panel
  for (const e of (empRows ?? []) as any[]) {
    if (e.user_id && (uaRows ?? []).some((u: any) => u.id === e.user_id)) continue   // ya listado arriba
    personas.push({
      userId: null,
      empleadoId: e.id,
      tipo: 'empleado',
      nombre: e.nombre_completo,
      email: e.email ?? '',
      rol: null,
      sucursal_id: e.sucursal_id,
      sucursales_acceso: e.sucursales_acceso ?? [],
      sucursal_nombre: e.sucursales?.nombre ?? null,
      puesto: e.puesto,
      tieneAcceso: false,
      activo: e.activo,
      permisos_custom: {},
      ultimo_login: null,
      caller: false,
    })
  }

  const sucursales = ((sucursalesData ?? []) as any[]).map((s) => ({ id: s.id as string, nombre: s.nombre as string }))

  return (
    <>
      <PageHeader
        title="Usuarios y permisos"
        description="Empleados y usuarios del panel en una sola gestión: roles, accesos y permisos finos por sector."
        breadcrumbs={[{ label: 'Administración' }, { label: 'Usuarios y permisos' }]}
      />
      <div className="p-4 md:p-6">
        <UsuariosClient personas={personas} sucursales={sucursales} />
      </div>
    </>
  )
}
