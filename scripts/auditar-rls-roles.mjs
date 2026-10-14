/**
 * EL AUDITOR QUE PRUEBA LA RLS CON UN USUARIO DE CADA ROL.
 *
 * ── POR QUÉ HACÍA FALTA OTRO ────────────────────────────────────────────────
 *
 * `probar:permisos` decía «TODO BIEN» mientras un repartidor podía leer la
 * deuda completa de los proveedores. Miraba las herramientas que recibe NORA —
 * que estaban bien filtradas— y no miraba la RLS, que no sabía nada de roles.
 *
 * La auditoría del 14 de octubre lo encontró probando de verdad: creó tres
 * usuarios, entró con cada uno y midió qué leía. Esto hace lo mismo en cada
 * build.
 *
 * ── CÓMO DECIDE ─────────────────────────────────────────────────────────────
 *
 * Toma la matriz de permisos —la de `lib/types/permisos.ts`, que es la fuente de
 * verdad— y el mapeo `tabla_modulo`. Para cada rol y cada tabla sensible
 * pregunta: ¿este rol puede ver este módulo? Si no puede y la lectura devuelve
 * filas, falla el build.
 *
 * Y verifica que la matriz de la base no se haya desincronizado del TS: si
 * alguien cambia el TS y no corre `sincronizar-permisos`, la RLS queda vieja y
 * eso no se nota mirando el código.
 *
 *   npm run auditar:rls-roles
 */
import { execSync } from 'child_process'

const SALIDA = execSync('npx tsx --env-file=.env.local scripts/_auditar-rls-roles.ts', {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: process.env,
}).toString()

process.stdout.write(SALIDA)
if (/FALLA/.test(SALIDA)) process.exit(1)
