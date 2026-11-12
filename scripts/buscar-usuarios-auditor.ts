/**
 * SOLO LECTURA. Lista todos los usuarios `*@rls.test` que quedaron en Auth y
 * si tienen fila en `users_admin` (y si está activa). No borra nada.
 *
 *   npx tsx --env-file=.env.local scripts/buscar-usuarios-auditor.ts
 */
import { createClient } from '@supabase/supabase-js'
import { esUsuarioAuditor, listarTodosLosUsuarios } from './usuarios-auth'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

async function main() {
  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
  const todos = await listarTodosLosUsuarios(adm)
  const auditores = todos.filter((u) => esUsuarioAuditor(u.email))
  console.log(`usuarios en Auth: ${todos.length} · ${'@rls.test'}: ${auditores.length}`)
  if (!auditores.length) return

  const { data: filas, error } = await adm.from('users_admin')
    .select('id, rol, activo, sucursal_id').in('id', auditores.map((u) => u.id))
  if (error) throw new Error(`no se pudo leer users_admin: ${error.message}`)
  const porId = new Map((filas ?? []).map((f: any) => [f.id, f]))
  for (const u of auditores) {
    const f: any = porId.get(u.id)
    console.log([
      u.email, u.id, `creado ${u.created_at}`, `último login ${u.last_sign_in_at ?? 'nunca'}`,
      u.banned_until ? `bloqueado hasta ${u.banned_until}` : 'no bloqueado',
      f ? `users_admin: ${f.rol}, ${f.activo ? 'ACTIVO' : 'inactivo'}` : 'sin fila en users_admin',
    ].join(' · '))
  }
}

main().catch((e) => { console.error('no se pudo revisar:', e?.message ?? e); process.exit(1) })
