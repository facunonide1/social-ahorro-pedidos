/**
 * EL AUDITOR DE FUNCIONES SECURITY DEFINER.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 *
 * Una función SECURITY DEFINER corre con los permisos de su dueño, no de quien
 * la llama. Si `anon` la puede ejecutar, cualquiera que tenga la URL pública y
 * la anon key (que está en el navegador) la llama por /rest/v1/rpc. En este
 * proyecto pasó ocho veces, siempre de la misma forma:
 *
 *   · Una función nueva nace con EXECUTE para PUBLIC (y por eso para anon).
 *   · `create or replace function` CONSERVA la ACL vieja… salvo que la función
 *     no existiera, y entonces nace abierta otra vez.
 *   · El revoke estaba, pero ANTES del último `create`: no servía de nada.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 * Para cada función cuya ÚLTIMA definición en supabase/migrations es SECURITY
 * DEFINER, después de ese último `create` (en el mismo archivo o en uno
 * posterior) tiene que haber un `revoke … on function <nombre> … from …` que
 * nombre a `public` y a `anon`, o un `revoke … on all functions in schema
 * public from … anon`. Y no puede haber, después, un `grant … to anon`.
 *
 * Lo que es público a propósito va en scripts/definer-aceptados.json con el
 * motivo. Lo que ya se sabe abierto y espera su migración (F2) va en
 * scripts/definer-deuda.json: no rompe el build, pero se lista en cada uno.
 * Cualquier función NUEVA que quede abierta lo rompe. Esto es estático: mira el repo, no la base. Lo que vive sólo en la
 * base (aplicado a mano) no lo ve; para eso está la verificación en vivo (F3,
 * segunda parte, con acceso a la base).
 *
 *   npm run auditar:definer
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const DIR = 'supabase/migrations'
const ACEPTADOS = 'scripts/definer-aceptados.json'
const DEUDA = 'scripts/definer-deuda.json'

/** Saca comentarios `--` y `/* *\/` sin tocar los cuerpos `$$…$$` (no hace falta: sólo miramos sentencias). */
function sinComentarios(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Parte un archivo en sentencias respetando los cuerpos con dólar ($$, $fn$, $function$). */
export function sentencias(sql) {
  const out = []
  let actual = ''
  let i = 0
  let dolar = null
  while (i < sql.length) {
    if (dolar) {
      const fin = sql.indexOf(dolar, i)
      if (fin < 0) { actual += sql.slice(i); break }
      actual += sql.slice(i, fin + dolar.length)
      i = fin + dolar.length
      dolar = null
      continue
    }
    const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 40))
    if (m) { dolar = m[0]; actual += m[0]; i += m[0].length; continue }
    const c = sql[i]
    if (c === "'") {
      const fin = sql.indexOf("'", i + 1)
      const hasta = fin < 0 ? sql.length : fin + 1
      actual += sql.slice(i, hasta); i = hasta; continue
    }
    if (c === ';') { out.push(actual.trim()); actual = ''; i++; continue }
    actual += c; i++
  }
  if (actual.trim()) out.push(actual.trim())
  return out
}

const nombreFn = (s) => s.replace(/"/g, '').toLowerCase().replace(/^public\./, '')

/**
 * Recorre las migraciones en orden y devuelve los hallazgos.
 * `archivos` es [{ nombre, sql }] ya ordenado.
 */
export function auditar(archivos, aceptados = {}) {
  // nombre → { definer, donde, orden, revocado, abiertoAnon }
  const fns = new Map()
  let orden = 0
  let revokeGlobalAnon = -1
  for (const { nombre, sql } of archivos) {
    for (const s of sentencias(sinComentarios(sql))) {
      orden++
      const low = s.toLowerCase()
      const cre = /^create\s+(or\s+replace\s+)?function\s+([\w."]+)\s*\(/i.exec(s)
      if (cre) {
        const n = nombreFn(cre[2])
        const cabecera = low.split(/\bas\s+\$[a-z_]*\$/)[0]
        const definer = /\bsecurity\s+definer\b/.test(cabecera) ||
          /\bsecurity\s+definer\b/.test(low.slice(low.lastIndexOf('$') + 1))
        const esTrigger = /\breturns\s+trigger\b/.test(cabecera)
        fns.set(n, { definer, esTrigger, donde: nombre, orden, revocado: false, abiertoAnon: null })
        continue
      }
      const drop = /^drop\s+function\s+(if\s+exists\s+)?([\w."]+)/i.exec(s)
      if (drop) { fns.delete(nombreFn(drop[2])); continue }
      // El bloque de la 0228: cierra de una todas las funciones de trigger que
      // ya existen (`prorettype = 'trigger'` + revoke dinámico a anon).
      if (/^do\b/i.test(s) && /prorettype\s*=\s*'trigger'/i.test(s) && /revoke\s+all\s+on\s+function[\s\S]*\banon\b/i.test(s)) {
        for (const f of fns.values()) if (f.esTrigger) { f.revocado = true; f.abiertoAnon = null }
        continue
      }
      const alt = /^alter\s+function\s+([\w."]+)\s*\([^)]*\)\s+security\s+(definer|invoker)/i.exec(s)
      if (alt) {
        const f = fns.get(nombreFn(alt[1]))
        if (f) f.definer = alt[2].toLowerCase() === 'definer'
        continue
      }
      const rev = /^revoke\s+[\s\S]*?\bon\s+function\s+([\w."]+)\s*\([^)]*\)\s+from\s+([\s\S]+)$/i.exec(s)
      if (rev) {
        const f = fns.get(nombreFn(rev[1]))
        const a = rev[2].toLowerCase()
        if (f && /\bpublic\b/.test(a) && /\banon\b/.test(a)) { f.revocado = true; f.abiertoAnon = null }
        continue
      }
      if (/^revoke\s+[\s\S]*\bon\s+all\s+functions\s+in\s+schema\s+public\s+from\s+[\s\S]*\banon\b/i.test(s)) {
        revokeGlobalAnon = orden
        for (const f of fns.values()) { f.revocado = true; f.abiertoAnon = null }
        continue
      }
      const gr = /^grant\s+[\s\S]*?\bon\s+function\s+([\w."]+)\s*\([^)]*\)\s+to\s+([\s\S]+)$/i.exec(s)
      if (gr && /\b(anon|public)\b/i.test(gr[2])) {
        const f = fns.get(nombreFn(gr[1]))
        if (f) f.abiertoAnon = nombre
      }
    }
  }

  const hallazgos = []
  for (const [n, f] of fns) {
    if (!f.definer) continue
    if (aceptados[n]) continue
    if (f.abiertoAnon) hallazgos.push({ funcion: n, donde: f.abiertoAnon, por_que: 'tiene un grant a anon/public después del último create' })
    else if (!f.revocado) hallazgos.push({ funcion: n, donde: f.donde, por_que: 'no tiene revoke de public y anon después de su último create' })
  }
  return hallazgos.sort((a, b) => a.funcion.localeCompare(b.funcion))
}

function main() {
  const archivos = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    .map((f) => ({ nombre: f, sql: readFileSync(join(DIR, f), 'utf8') }))
  const leer = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {})
  const aceptados = leer(ACEPTADOS)
  const deuda = leer(DEUDA)
  const h = auditar(archivos, aceptados)
  const conocidos = h.filter((x) => deuda[x.funcion])
  const nuevos = h.filter((x) => !deuda[x.funcion])
  const yaCerradas = Object.keys(deuda).filter((n) => !h.some((x) => x.funcion === n))

  for (const x of conocidos) console.log(`  deuda  ${x.funcion}  (${x.donde})  ${deuda[x.funcion]}`)
  for (const n of yaCerradas) console.log(`  ok     ${n} ya está cerrada en las migraciones: sacala de ${DEUDA}`)
  if (!nuevos.length) {
    console.log(`auditar:definer · TODO BIEN · ninguna función SECURITY DEFINER nueva queda ejecutable por anon` +
      (conocidos.length ? ` (${conocidos.length} en deuda conocida, se cierran con F2)` : ''))
    return
  }
  for (const x of nuevos) console.log(`! ${x.funcion}  (${x.donde})  ${x.por_que}`)
  console.log(`\nFALLA · ${nuevos.length} función(es) SECURITY DEFINER nuevas ejecutables por anon.\n` +
    'Agregá, DESPUÉS del último create, `revoke all on function public.<f>(<args>) from public, anon;`\n' +
    `o anotala en ${ACEPTADOS} con el motivo si es pública a propósito.`)
  process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
