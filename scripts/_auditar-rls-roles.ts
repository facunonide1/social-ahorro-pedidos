/**
 * El cuerpo del auditor de RLS por rol. Lo invoca scripts/auditar-rls-roles.mjs.
 *
 * Crea un usuario por rol, entra con su sesión, mide y los borra. Si algo
 * falla, los borra igual: un usuario de prueba que queda vivo es una puerta.
 */
import { createClient } from '@supabase/supabase-js'

import { PRESET_POR_ROL, type PermisoModulo } from '../lib/types/permisos'
import type { AdminRole } from '../lib/types/admin'
import { filasDeLaMatriz } from './sincronizar-permisos'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const adm = createClient(URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

/** Los roles que no son de gerencia: los que tienen que ver MENOS. */
const ROLES: AdminRole[] = ['encargado_sucursal', 'cajero', 'repartidor', 'empleado_general', 'marketing']

/**
 * Las tablas donde un acceso de más duele. No son todas: son las que guardan
 * plata, datos de clientes o el costo.
 */
const SENSIBLES = [
  'facturas_proveedor', 'pagos', 'cheques', 'cuentas_bancarias_propias',
  'arqueos_caja', 'caja_general', 'clientes', 'proveedores',
  'doc_precios_historial', 'ordenes_compra', 'listas_precios', 'anomalias',
  'empleado_documentos', 'empleados_evaluaciones',
]

let fallas = 0
const ok = (s: string) => console.log(`  ok    ${s}`)
const falla = (s: string) => { console.log(`  FALLA ${s}`); fallas++ }

async function main() {
  // ── 1 · LA MATRIZ DE LA BASE CONTRA LA DEL TYPESCRIPT ─────────────────────
  const delTs = filasDeLaMatriz()
  const { data: deLaBase } = await adm.from('permisos_matriz').select('rol, modulo, ver, crear, editar, aprobar, eliminar')
  const porClave = new Map(((deLaBase ?? []) as any[]).map((f) => [`${f.rol}|${f.modulo}`, f]))

  let desync = 0
  for (const f of delTs) {
    const b = porClave.get(`${f.rol}|${f.modulo}`)
    if (!b) { desync++; continue }
    for (const a of ['ver', 'crear', 'editar', 'aprobar', 'eliminar'] as const) {
      if (b[a] !== (f as any)[a]) desync++
    }
  }
  if (desync > 0) {
    falla(`la matriz de la base está desincronizada del TypeScript en ${desync} celdas. Corré: npx tsx --env-file=.env.local scripts/sincronizar-permisos.ts`)
  } else {
    ok(`la matriz de la base coincide con el TypeScript (${delTs.length} celdas)`)
  }

  // ── 1.b · NINGUNA POLÍTICA DE ESCRITURA PUEDE DAR LECTURA ─────────────────
  //
  // Una política `FOR ALL` permisiva incluye SELECT, y las permisivas se
  // combinan con OR: alcanza una para que la política de lectura por rol y
  // sucursal no haga falta. En la v0.97 había **130 tablas así**, heredadas de
  // antes de que existiera la matriz, y anulaban casi todo el trabajo de RLS de
  // la v0.95 sin que nada fallara.
  //
  // Se encontró de casualidad —probando que un encargado no viera los arqueos de
  // otra sucursal— y por eso esto está acá: para que la próxima no dependa de
  // que a alguien se le ocurra probarlo.
  const { data: fugas } = await adm.rpc('rls_escrituras_que_dan_lectura')
  const fuga = (fugas ?? []) as { tabla: string; politica: string }[]
  if (fuga.length) {
    falla(`${fuga.length} política(s) de escritura FOR ALL también dan SELECT y anulan la lectura por rol: ` +
      fuga.slice(0, 5).map((f) => `${f.tabla}.${f.politica}`).join(', ') +
      (fuga.length > 5 ? ` y ${fuga.length - 5} más` : '') +
      '. Partirlas en insert/update/delete.')
  } else {
    ok('ninguna política de escritura da lectura de arrastre')
  }

  // ── 2 · LAS TABLAS SENSIBLES, MAPEADAS ────────────────────────────────────
  const { data: mapeo } = await adm.from('tabla_modulo').select('tabla, modulo')
  const modulos = new Map(((mapeo ?? []) as any[]).map((m) => [m.tabla, m.modulo]))
  const sinMapear = SENSIBLES.filter((t) => !modulos.has(t))
  if (sinMapear.length) falla(`tablas sensibles sin módulo declarado en tabla_modulo: ${sinMapear.join(', ')}`)
  else ok(`las ${SENSIBLES.length} tablas sensibles tienen módulo declarado`)

  // Cuántas filas hay de verdad: sin eso, «no veo nada» no prueba nada.
  const hay = new Map<string, number>()
  for (const t of SENSIBLES) {
    const { count } = await adm.from(t).select('*', { count: 'exact', head: true })
    hay.set(t, count ?? 0)
  }

  // ── 3 · ENTRAR CON CADA ROL Y MEDIR ───────────────────────────────────────
  //
  // Esta parte crea usuarios de verdad en auth, entra con cada uno y los borra.
  // Hacerlo en el build de Vercel sería crear y borrar usuarios en la base de
  // PRODUCCIÓN en cada deploy: si el build se cancela a la mitad, queda un
  // usuario vivo con contraseña conocida. Eso es una puerta, no una prueba.
  //
  // El portón sigue siendo el build local, que es el que corre antes de cada
  // push y el que falla. En Vercel quedan las dos verificaciones de arriba, que
  // sólo leen — y la de la matriz desincronizada es la única de las tres que
  // puede llegar sola hasta producción sin que nadie la vea.
  if (process.env.VERCEL) {
    console.log(
      '  --    las sesiones por rol no se prueban en el build de Vercel: crear usuarios en ' +
      'producción para medir es peor que la medición. Se prueban en el build local, antes del push.',
    )
    console.log(fallas === 0 ? '\nTODO BIEN' : `\nFALLA · ${fallas} problemas de RLS por rol`)
    if (fallas > 0) process.exit(1)
    return
  }

  const { data: suc } = await adm.from('sucursales')
    .select('id').eq('activa', true).order('codigo').limit(1).maybeSingle()

  const creados: string[] = []
  try {
    for (const rol of ROLES) {
      const email = `auditor.${rol}@rls.test`
      const pass = `Rls-${Date.now()}-${rol}!`

      const { data: previos } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
      for (const u of previos?.users ?? []) {
        if (u.email === email) { await adm.from('users_admin').delete().eq('id', u.id); await adm.auth.admin.deleteUser(u.id) }
      }

      const { data: c, error: e } = await adm.auth.admin.createUser({ email, password: pass, email_confirm: true })
      if (e || !c?.user) { falla(`no se pudo crear el usuario de prueba de ${rol}: ${e?.message}`); continue }
      creados.push(c.user.id)
      await adm.from('users_admin').upsert({ id: c.user.id, rol, sucursal_id: suc?.id ?? null, activo: true }, { onConflict: 'id' })

      const s = createClient(URL, ANON, { auth: { persistSession: false } })
      const { error: eL } = await s.auth.signInWithPassword({ email, password: pass })
      if (eL) { falla(`${rol} no puede entrar: ${eL.message}`); continue }

      const deMas: string[] = []
      const noSePudo: string[] = []
      for (const t of SENSIBLES) {
        const modulo = modulos.get(t)
        if (!modulo) continue
        const puedeVer = PRESET_POR_ROL[rol][modulo as PermisoModulo]?.ver === true
        const total = hay.get(t) ?? 0
        if (total === 0) { if (!puedeVer) noSePudo.push(t); continue }

        const { count, error } = await s.from(t).select('*', { count: 'exact', head: true })
        if (error) continue  // sin permiso a nivel de API: es un no rotundo
        const ve = count ?? 0
        if (!puedeVer && ve > 0) deMas.push(`${t} (ve ${ve} de ${total})`)
      }

      if (deMas.length) falla(`${rol} lee tablas que su rol no habilita → ${deMas.join(' · ')}`)
      else ok(`${rol}: no lee ninguna tabla sensible que su rol no habilite${noSePudo.length ? ` (${noSePudo.length} vacías, no se pudo probar)` : ''}`)
    }
  } finally {
    for (const id of creados) { await adm.from('users_admin').delete().eq('id', id); await adm.auth.admin.deleteUser(id) }
    const { data: q } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
    const quedan = (q?.users ?? []).filter((u) => u.email?.endsWith('@rls.test')).length
    if (quedan > 0) falla(`quedaron ${quedan} usuarios de prueba sin borrar`)
    else ok(`${creados.length} usuarios de prueba borrados`)
  }

  console.log(fallas === 0 ? '\nTODO BIEN' : `\nFALLA · ${fallas} problemas de RLS por rol`)
  if (fallas > 0) process.exit(1)
}

main().catch((e) => { console.error('FALLA · el auditor no pudo correr:', e?.message ?? e); process.exit(1) })
