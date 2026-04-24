/**
 * Script único para crear el primer `super_admin` del Admin Hub.
 *
 * Cómo se corre (desde la raíz del repo, en tu máquina):
 *
 *   # 1) cargá las env vars del proyecto:
 *   export $(grep -v '^#' .env.local | xargs)
 *   # o en PowerShell:
 *   #   Get-Content .env.local | ForEach-Object { if($_ -match '^[^#](.+?)=(.+)') { $env:($matches[1]) = $matches[2] } }
 *
 *   # 2) instalá tsx si no lo tenés:
 *   npx tsx scripts/bootstrap-admin.ts
 *
 * Requiere en el entorno:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Modifica las constantes ADMIN_* de abajo o pasalas por env
 * (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE).
 */

import { createAdminUser } from '../lib/supabase/admin-users'

const email    = process.env.ADMIN_EMAIL    || 'admin@socialahorro.com.ar'
const password = process.env.ADMIN_PASSWORD
const nombre   = process.env.ADMIN_NOMBRE   || 'Admin Principal'

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltan env vars NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!password) {
    console.error('❌ Falta ADMIN_PASSWORD en el entorno.')
    console.error('   Ejemplo: ADMIN_PASSWORD="...contraseña-segura..." npx tsx scripts/bootstrap-admin.ts')
    process.exit(1)
  }

  console.log(`Creando super_admin: ${email} (${nombre})…`)

  const res = await createAdminUser({
    email, password, nombre,
    rol: 'super_admin',
  })

  if (!res.ok) {
    console.error(`❌ Falló en etapa "${res.stage}": ${res.error}`)
    process.exit(1)
  }

  console.log(`✅ Creado. userId=${res.userId}`)
  console.log('   Ya podés entrar con este email y la contraseña que pusiste.')
}

main().catch(err => {
  console.error('❌ Error inesperado:', err)
  process.exit(1)
})
