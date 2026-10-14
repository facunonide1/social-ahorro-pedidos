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
import { existsSync } from 'fs'

// `.env.local` existe en la máquina de Facundo y NO existe en la de Vercel: está
// en el .gitignore. Pasarlo con `--env-file` cuando no está hace que node corte
// con ENOENT antes de empezar, y el deploy entero falla por un auditor. En
// Vercel las variables ya vienen en el entorno del build.
const ENV = existsSync('.env.local') ? '--env-file=.env.local ' : ''

// Si el auditor corta con código distinto de cero, lo que dijo antes de cortar
// es justamente el motivo: hay que imprimirlo, no perderlo.
let salida = ''
let corto = false
try {
  salida = execSync(`npx tsx ${ENV}scripts/_auditar-rls-roles.ts`, {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  }).toString()
} catch (e) {
  salida = (e.stdout ?? '').toString()
  corto = true
}

process.stdout.write(salida)
if (corto || /FALLA/.test(salida)) process.exit(1)
