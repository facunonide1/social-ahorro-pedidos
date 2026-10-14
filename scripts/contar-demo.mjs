/**
 * CUÁNTAS FILAS DE DEMOSTRACIÓN TIENE CADA TABLA, CONTADAS AHORA.
 *
 * ── POR QUÉ NO ESTÁ ESCRITO A MANO ──────────────────────────────────────────
 *
 * Lo estuvo, y se desincronizó. El auditor del lente decía `tareas: 12` cuando
 * había 64 de demostración, y `controles_zona: 0` cuando había 64. Con esos
 * números viejos marcaba como «no mienten hoy» dos pantallas que sí mentían: el
 * auditor subestimaba su propio hallazgo. Lo encontró la auditoría del 14-oct.
 *
 * Ahora se cuenta contra la base y se cachea en un archivo. El auditor usa el
 * cache si existe —para no depender de la red en cada build— y avisa cuando
 * tiene más de una semana.
 */
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const adm = createClient(URL, KEY, { auth: { persistSession: false } })

const { data, error } = await adm.rpc('contar_filas_demo')
if (error) { console.error('No se pudo contar:', error.message); process.exit(1) }

const tablas = {}
for (const f of data ?? []) tablas[f.tabla] = { total: Number(f.total), demo: Number(f.demo) }

const salida = { medido_at: new Date().toISOString(), tablas }
writeFileSync('scripts/conteo-demo.json', JSON.stringify(salida, null, 1) + '\n')

const conDemo = Object.entries(tablas).filter(([, v]) => v.demo > 0)
console.log(`tablas con es_demo: ${Object.keys(tablas).length} · con filas inventadas HOY: ${conDemo.length}`)
for (const [t, v] of conDemo.sort((a, b) => b[1].demo - a[1].demo)) {
  const todo = v.demo === v.total ? '  ← TODAS' : ''
  console.log(`  ${t.padEnd(28)} ${String(v.demo).padStart(6)} de ${String(v.total).padStart(6)}${todo}`)
}
