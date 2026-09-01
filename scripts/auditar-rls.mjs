/**
 * EL AUDITOR DE TABLAS CIEGAS.
 *
 * ── QUÉ ES UNA TABLA CIEGA ──────────────────────────────────────────────────
 *
 * Una tabla con RLS activa y CERO políticas. Eso no es «acceso restringido»:
 * es que **nadie ve nada** salvo `service_role`.
 *
 * El importador usa `service_role` y ve todo, así que la carga se verifica
 * perfecta. La pantalla usa la sesión del usuario y recibe cero filas. Y cero
 * filas suman cero, sin ningún error.
 *
 * En v0.86 aparecieron diez. La peor fue `oferta_items`: la ficha de una oferta
 * mostraba la oferta **sin sus productos**. Una oferta vacía. Y el tablero de
 * anomalías habría dicho «no hay anomalías» con trece mil cargadas — un tablero
 * ciego que por eso dice que está todo bien.
 *
 * ── LO QUE EL LINTER DE SUPABASE NO DICE ────────────────────────────────────
 *
 * El advisor «RLS Enabled No Policy» marca las dos situaciones igual, y son
 * opuestas:
 *
 *   INTENCIONAL — sólo la escribe un importador con `service_role`.
 *                 RLS sin políticas es exactamente lo que se quiere.
 *   CIEGA       — la lee una pantalla con la sesión del usuario.
 *                 El dato está y nadie lo ve.
 *
 * **La diferencia no está en la tabla: está en quién la lee.** Por eso este
 * auditor mira el código, que es donde vive esa información.
 *
 * ── CÓMO DECIDE ─────────────────────────────────────────────────────────────
 *
 * Una tabla la lee «una pantalla» si aparece en `app/(admin)`, `app/(app)` o
 * `components` — que corren con la sesión del usuario. Las rutas de `app/api`
 * dependen de si usan `createClient` (sesión) o `createAdminClient`
 * (service_role), así que se mira cuál importan.
 *
 *   npm run auditar:rls
 */
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

const DECLARADAS = 'scripts/rls-intencional.json'

/** Las tablas con RLS activa y sin políticas. Se refresca con la consulta del pie. */
export const SIN_POLITICAS = [
  'sifaco_maestro_staging', 'backup_movimientos_stock_v20', 'backup_stock_items_v20',
  'demo_origen_ref', 'crons_calculo', 'backup_users_admin_v26',
  'backup_empleados_v26', 'sifaco_mapeo_columnas', 'auth_trigger_errors',
  'backup_stock_sucursal_v20',
]

/** ¿Este archivo consulta con la sesión del usuario, o con service_role? */
function comoConsulta(src) {
  const admin = /createAdminClient/.test(src)
  const sesion = /createClient\(/.test(src) && !/createAdminClient/.test(src)
  if (sesion) return 'sesion'
  if (admin && /createClient\(/.test(src)) return 'mixto'
  if (admin) return 'service_role'
  return 'sesion' // los componentes de cliente usan el cliente del navegador
}

export function auditar() {
  const out = []

  for (const tabla of SIN_POLITICAS) {
    let archivos = []
    try {
      archivos = execSync(
        `grep -rl "from('${tabla}')" app components lib --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
      ).toString().trim().split('\n').filter(Boolean)
    } catch { /* sin usos */ }

    const lectores = []
    for (const f of archivos) {
      const src = readFileSync(f, 'utf8')
      // Sólo cuentan las LECTURAS: un insert no se trunca por RLS de select.
      const lee = new RegExp(`from\\('${tabla}'\\)\\s*\\.?\\s*\\n?\\s*\\.select`).test(src)
        || new RegExp(`from\\('${tabla}'\\)[^\\n]*\\.select`).test(src)
      if (!lee) continue
      lectores.push({ archivo: f, como: comoConsulta(src) })
    }

    const conSesion = lectores.filter((l) => l.como === 'sesion' || l.como === 'mixto')
    out.push({
      tabla,
      lectores: lectores.length,
      con_sesion: conSesion.length,
      // CIEGA: alguien la lee con la sesión del usuario y no hay política.
      clase: conSesion.length > 0 ? 'ciega' : (lectores.length > 0 ? 'intencional' : 'sin-uso'),
      archivos: conSesion.map((l) => l.archivo),
    })
  }

  return out
}

const res = auditar()
const declaradas = existsSync(DECLARADAS) ? JSON.parse(readFileSync(DECLARADAS, 'utf8')) : {}
const ciegas = res.filter((r) => r.clase === 'ciega' && !(r.tabla in declaradas))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(res, null, 1))
} else {
  const porClase = res.reduce((a, r) => ({ ...a, [r.clase]: (a[r.clase] ?? 0) + 1 }), {})
  console.log(`tablas con RLS y sin politicas: ${res.length}`)
  console.log(`  ciegas (las lee una pantalla): ${porClase.ciega ?? 0}`)
  console.log(`  intencionales (solo importador): ${porClase.intencional ?? 0}`)
  console.log(`  sin uso en el codigo: ${porClase['sin-uso'] ?? 0}\n`)
  for (const r of res.filter((x) => x.clase !== 'sin-uso')) {
    console.log(`${r.clase === 'ciega' ? '!' : ' '} ${r.tabla.padEnd(30)} ${r.clase}`)
    for (const a of r.archivos) console.log(`     lee con la sesion del usuario: ${a}`)
  }
}

if (ciegas.length > 0 && !process.argv.includes('--json')) {
  console.log(`\nHAY ${ciegas.length} TABLA(S) CIEGA(S): el dato esta y la pantalla no lo ve.`)
  console.log(`Poneles una politica de lectura, o declaralas en ${DECLARADAS} con el motivo.`)
  process.exit(1)
}
