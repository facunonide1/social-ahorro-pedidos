/**
 * Utilidades de solo lectura sobre los usuarios de Supabase Auth, para los
 * scripts de auditoría.
 *
 * `auth.admin.listUsers` pagina. Pedir la página 1 con `perPage: 200` y dar
 * eso por «todos» deja afuera al usuario 201 en adelante: un usuario de prueba
 * que quedó vivo puede no aparecer nunca. Acá se recorren todas las páginas.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js'

/** El dominio de los usuarios que crea `auditar:rls-roles`. */
export const DOMINIO_AUDITOR = '@rls.test'

export function esUsuarioAuditor(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(DOMINIO_AUDITOR)
}

/**
 * Trae TODOS los usuarios de Auth, página por página, hasta una página corta.
 * Tope de seguridad por si la API devolviera siempre páginas llenas.
 */
export async function listarTodosLosUsuarios(
  adm: SupabaseClient,
  { porPagina = 1000, maxPaginas = 1000 }: { porPagina?: number; maxPaginas?: number } = {},
): Promise<User[]> {
  const todos: User[] = []
  for (let page = 1; page <= maxPaginas; page++) {
    const { data, error } = await adm.auth.admin.listUsers({ page, perPage: porPagina })
    if (error) throw new Error(`no se pudo listar usuarios (página ${page}): ${error.message}`)
    const usuarios = data?.users ?? []
    todos.push(...usuarios)
    if (usuarios.length < porPagina) return todos
  }
  throw new Error(`listarTodosLosUsuarios: más de ${maxPaginas} páginas, se corta por seguridad`)
}

/**
 * Decide si `auditar:rls-roles` puede crear usuarios de prueba. Devuelve el
 * motivo para NO hacerlo, o null si puede.
 *
 * Crear usuarios es escribir en la base de producción. Hace falta pedirlo
 * explícitamente (`AUDITOR_CREAR_USUARIOS=1`) y nunca en un build de Vercel.
 */
export function motivoNoCrearUsuarios(env: Record<string, string | undefined>): string | null {
  if (env.VERCEL) return 'es un build de Vercel'
  if (env.AUDITOR_CREAR_USUARIOS !== '1') return 'falta AUDITOR_CREAR_USUARIOS=1'
  return null
}
