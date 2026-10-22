/**
 * E.3 · El cruce entre lo que muestra el código y lo que dice la base.
 *
 * Igual que el auditor de RLS por rol: `.env.local` existe en la máquina de
 * Facundo y no en la de Vercel, así que el flag se agrega sólo si está.
 */
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const ENV = existsSync('.env.local') ? '--env-file=.env.local ' : ''

let salida = ''
let corto = false
try {
  salida = execSync(`npx tsx ${ENV}scripts/_verificar-coherencia.ts`, {
    stdio: ['ignore', 'pipe', 'inherit'], env: process.env,
  }).toString()
} catch (e) {
  salida = (e.stdout ?? '').toString()
  corto = true
}
process.stdout.write(salida)
if (corto || /FALLA/.test(salida)) process.exit(1)
