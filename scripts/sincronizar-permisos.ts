/**
 * LA MATRIZ DE PERMISOS, DEL TYPESCRIPT A LA BASE.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 *
 * La matriz 18×5×13 vive en `lib/types/permisos.ts` y la usan las pantallas y
 * las APIs. La RLS no la podía consultar: una política de Postgres no puede
 * importar un módulo de TypeScript. Por eso las políticas decían «cualquier
 * usuario activo del hub», y por eso un repartidor leía la deuda completa.
 *
 * Este script copia la matriz a `permisos_matriz`, que es lo que la RLS lee.
 *
 * **El TS sigue siendo la fuente de verdad.** Esta tabla es un espejo, y el
 * auditor de permisos verifica que no se desincronice: si alguien cambia el TS
 * y no corre esto, el build falla.
 *
 *   npx tsx --env-file=.env.local scripts/sincronizar-permisos.ts
 */

import { createClient } from '@supabase/supabase-js'

import { PERMISO_MODULOS, PERMISO_ACCIONES, PRESET_POR_ROL } from '../lib/types/permisos'
import type { AdminRole } from '../lib/types/admin'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

export function filasDeLaMatriz() {
  const filas: any[] = []
  for (const rol of Object.keys(PRESET_POR_ROL) as AdminRole[]) {
    const m = PRESET_POR_ROL[rol]
    for (const modulo of PERMISO_MODULOS) {
      const f = m[modulo]
      filas.push({
        rol, modulo,
        ver: f.ver, crear: f.crear, editar: f.editar,
        aprobar: f.aprobar, eliminar: f.eliminar,
      })
    }
  }
  return filas
}

async function main() {
  const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  const filas = filasDeLaMatriz()
  console.log(`matriz del TS: ${Object.keys(PRESET_POR_ROL).length} roles × ${PERMISO_MODULOS.length} módulos = ${filas.length} filas`)

  const { error } = await adm.from('permisos_matriz').upsert(filas, { onConflict: 'rol,modulo' })
  if (error) throw error

  const { count } = await adm.from('permisos_matriz').select('rol', { count: 'exact', head: true })
  console.log(`en la base: ${count}`)

  // Lo que importa de verdad: quién puede VER dinero y quién no.
  const dinero = ['finanzas', 'caja', 'aprobaciones'] as const
  console.log(`\nquién ve los módulos de dinero:`)
  for (const rol of Object.keys(PRESET_POR_ROL) as AdminRole[]) {
    const ve = dinero.filter((m) => PRESET_POR_ROL[rol][m].ver)
    console.log(`  ${rol.padEnd(20)} ${ve.length ? ve.join(', ') : '— ninguno'}`)
  }
}

if (process.argv[1]?.endsWith('sincronizar-permisos.ts')) {
  main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
}
