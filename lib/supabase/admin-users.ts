import { createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisosCustom } from '@/lib/types/permisos'

export type CreateAdminUserInput = {
  email: string
  password: string
  rol: AdminRole
  nombre: string
  sucursal_id?: string | null
  permisos_custom?: PermisosCustom
}

export type UpdateAdminUserInput = {
  rol?: AdminRole
  sucursal_id?: string | null
  activo?: boolean
  permisos_custom?: PermisosCustom
  nombre?: string
}

export type CreateAdminUserResult =
  | { ok: true; userId: string; email: string; rol: AdminRole }
  | { ok: false; error: string; stage: 'validate' | 'auth_create' | 'users_admin_insert' }

/**
 * Crea un usuario del Admin Hub de forma transaccional-ish.
 *
 * 1. Valida inputs.
 * 2. Crea el user en `auth.users` con `raw_user_meta_data = { is_admin_hub: true, nombre, rol }`
 *    y `email_confirm: true`. El flag `is_admin_hub` hace que el trigger
 *    `handle_new_user` (de la cuponera) skipee su lógica — ver migración
 *    0017_fix_handle_new_user_trigger.sql.
 * 3. Inserta la fila en `public.users_admin` (rol + sucursal + activo=true).
 * 4. Si el paso 3 falla, hace rollback borrando el auth user recién creado.
 *
 * Requiere estar corriendo en un entorno con SUPABASE_SERVICE_ROLE_KEY
 * (server-side o script con dotenv).
 */
export async function createAdminUser(
  input: CreateAdminUserInput
): Promise<CreateAdminUserResult> {
  const email = input.email?.trim().toLowerCase()
  const password = input.password
  const nombre = input.nombre?.trim() || null
  const { rol, sucursal_id } = input

  if (!email || !password || !rol) {
    return { ok: false, error: 'email_password_rol_requeridos', stage: 'validate' }
  }
  if (password.length < 8) {
    return { ok: false, error: 'password_min_8', stage: 'validate' }
  }
  if (rol === 'sucursal' && !sucursal_id) {
    return { ok: false, error: 'sucursal_requerida_para_rol_sucursal', stage: 'validate' }
  }

  const admin = createAdminClient()

  // 1) Crear auth user con flag is_admin_hub
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      is_admin_hub: true,
      nombre,
      rol,
    },
  })

  if (authErr || !created?.user) {
    return {
      ok: false,
      error: authErr?.message || 'auth_create_failed',
      stage: 'auth_create',
    }
  }

  const userId = created.user.id

  // 2) Fila en users_admin
  const { error: insErr } = await admin.from('users_admin').insert({
    id: userId,
    rol,
    sucursal_id: sucursal_id ?? null,
    activo: true,
    permisos_custom: input.permisos_custom ?? {},
  })

  if (insErr) {
    // Rollback: borrar el auth user
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    return {
      ok: false,
      error: insErr.message,
      stage: 'users_admin_insert',
    }
  }

  return { ok: true, userId, email, rol }
}

/**
 * Actualiza un admin: rol, sucursal, activo, permisos y/o nombre.
 * El nombre vive en auth.users.user_metadata; el resto en users_admin.
 */
export async function updateAdminUser(
  userId: string,
  input: UpdateAdminUserInput,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  const patch: Record<string, unknown> = {}
  if (input.rol !== undefined) patch.rol = input.rol
  if (input.sucursal_id !== undefined) patch.sucursal_id = input.sucursal_id
  if (input.activo !== undefined) patch.activo = input.activo
  if (input.permisos_custom !== undefined) patch.permisos_custom = input.permisos_custom

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from('users_admin').update(patch).eq('id', userId)
    if (error) return { ok: false, error: error.message }
  }

  if (input.nombre !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { nombre: input.nombre.trim() || null },
    })
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true }
}

/**
 * Desactiva (no borra) un admin. Preserva auditoría.
 */
export async function deactivateAdminUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.from('users_admin').update({ activo: false }).eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Elimina un admin por completo (auth + users_admin por cascade).
 * Reservar para casos de error/test; para operativa usar deactivateAdminUser.
 */
export async function deleteAdminUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
