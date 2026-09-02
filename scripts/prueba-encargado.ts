/**
 * EL CIRCUITO DE UN ENCARGADO, PROBADO DE VERDAD.
 *
 * ── QUÉ PRUEBA ──────────────────────────────────────────────────────────────
 *
 * Crea un usuario de PRUEBA con rol de encargado y una sucursal, entra con su
 * sesión —no con service_role— y recorre el circuito: ver su sucursal, crear
 * una tarea, completarla, y que quede esperando verificación (regla de oro 5:
 * toda tarea completada genera un control).
 *
 * Usar la sesión del usuario es el punto: `service_role` ve todo y no prueba
 * nada. La mitad de los agujeros de este proyecto fueron consultas que el
 * importador veía perfectas y la pantalla recibía vacías.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No crea usuarios reales del equipo: los nombres los da Facundo. El de prueba
 * se borra al terminar, pase lo que pase.
 *
 *   npx tsx --env-file=.env.local scripts/prueba-encargado.ts
 */

import { createClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const adm = createClient(URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const EMAIL = 'prueba.encargado.v092@social-ahorro.test'
const PASS = `Prueba-${Math.floor(Date.now() / 1000)}!`

const ok = (s: string) => console.log(`  ok   ${s}`)
const mal = (s: string) => { console.log(`  MAL  ${s}`); fallas++ }
let fallas = 0

async function main() {
  console.log('── preparando el usuario de prueba ──')

  // Por si quedó uno de una corrida anterior.
  const { data: previos } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
  for (const u of previos?.users ?? []) {
    if (u.email === EMAIL) await adm.auth.admin.deleteUser(u.id)
  }

  const { data: suc } = await adm.from('sucursales')
    .select('id, nombre, codigo').eq('activa', true).eq('es_ecommerce', false).order('codigo').limit(1).maybeSingle()
  if (!suc) throw new Error('No hay sucursales activas contra las que probar.')
  console.log(`  sucursal de prueba: ${suc.nombre} (${suc.codigo})`)

  const { data: creado, error: eCrear } = await adm.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
    user_metadata: { nombre: 'Encargado de prueba (v0.92)' },
  })
  if (eCrear || !creado?.user) throw new Error(`No se pudo crear el usuario: ${eCrear?.message}`)
  const uid = creado.user.id

  try {
    await adm.from('users_admin').upsert({
      id: uid, rol: 'encargado_sucursal', sucursal_id: suc.id, activo: true,
    }, { onConflict: 'id' })

    // ── ENTRAR CON SU SESIÓN ────────────────────────────────────────────────
    const suyo = createClient(URL, env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
    const { error: eLogin } = await suyo.auth.signInWithPassword({ email: EMAIL, password: PASS })
    if (eLogin) throw new Error(`No pudo entrar: ${eLogin.message}`)
    ok('entra con su usuario y contraseña')

    console.log('\n── qué ve al entrar ──')

    const { data: yo } = await suyo.from('users_admin').select('rol, sucursal_id, activo').eq('id', uid).maybeSingle()
    yo?.rol === 'encargado_sucursal' ? ok('se lee su propio rol y su sucursal') : mal('no puede leer su propia fila de users_admin')

    const { count: nSuc } = await suyo.from('sucursales').select('id', { count: 'exact', head: true }).eq('activa', true)
    ;(nSuc ?? 0) > 0 ? ok(`ve ${nSuc} sucursales`) : mal('no ve ninguna sucursal')

    const { count: nProd } = await suyo.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_demo', false)
    ;(nProd ?? 0) > 1000 ? ok(`ve el catálogo (${nProd} productos)`) : mal(`ve ${nProd ?? 0} productos: el catálogo le llega vacío o cortado`)

    const { data: buscados, error: eBuscar } = await suyo.rpc('catalogo_pagina', { p_q: 'ibupro', p_limite: 5 })
    !eBuscar && (buscados ?? []).length > 0 ? ok('puede buscar en el catálogo desde su sesión') : mal(`la búsqueda del catálogo le devuelve vacío: ${eBuscar?.message ?? 'sin filas'}`)

    const { count: nPedidos, error: ePed } = await suyo.from('orders').select('id', { count: 'exact', head: true })
    !ePed ? ok(`ve los pedidos (${nPedidos})`) : mal(`no ve pedidos: ${ePed.message}`)

    const { count: nTareas, error: eTar } = await suyo.from('tareas').select('id', { count: 'exact', head: true })
    !eTar ? ok(`ve las tareas (${nTareas})`) : mal(`no ve tareas: ${eTar.message}`)

    // Lo que NO debería ver. Ojo: con RLS, «no puede» no da error — devuelve
    // cero filas. Comparar contra lo que ve `service_role` es la única forma de
    // distinguir «no lo ve» de «no hay nada».
    for (const [tabla, quien] of [['pagos', 'tesorería'], ['cuentas_bancarias_propias', 'tesorería']] as const) {
      const { count: hay } = await adm.from(tabla).select('id', { count: 'exact', head: true })
      const { count: ve } = await suyo.from(tabla).select('id', { count: 'exact', head: true })
      if ((hay ?? 0) === 0) console.log(`  --   ${tabla}: no hay filas, no se puede probar si las ocultaría`)
      else if ((ve ?? 0) === 0) ok(`no ve ${tabla} (correcto: es de ${quien}) — hay ${hay} y recibe 0`)
      else mal(`ve ${ve} filas de ${tabla} y no debería`)
    }

    console.log('\n── el circuito de una tarea ──')

    const codigo = `PRB-${Date.now().toString(36).slice(-5).toUpperCase()}`
    const { data: tarea, error: eIns } = await suyo.from('tareas').insert({
      codigo, tipo_origen: 'manual', titulo: 'Prueba de circuito (v0.92) — borrar',
      descripcion: 'Tarea creada por scripts/prueba-encargado.ts. Se borra sola.',
      prioridad: 'baja', estado: 'pendiente', asignacion_tipo: 'usuario_especifico',
      responsable_id: uid, sucursal_id: suc.id, verificacion_humana: true,
    }).select('id, codigo, estado').maybeSingle()
    if (eIns || !tarea) { mal(`no puede crear una tarea: ${eIns?.message}`); return }
    ok(`crea una tarea (${tarea.codigo})`)

    const { error: eProg } = await suyo.from('tareas').update({ estado: 'en_progreso' }).eq('id', tarea.id)
    !eProg ? ok('la puede tomar') : mal(`no puede tomarla: ${eProg.message}`)

    // Completar con evidencia. Con `verificacion_humana` la tarea NO queda
    // completada: queda esperando que otra persona la verifique. Esa es la
    // tarea de control de la regla de oro 5.
    const { data: comp, error: eComp } = await suyo.from('tareas').update({
      estado: 'en_verificacion',
      evidencias: [{ tipo: 'foto', url: 'prueba://evidencia', at: new Date().toISOString() }],
      fecha_inicio_real: new Date().toISOString(),
    }).eq('id', tarea.id).select('estado, evidencias').maybeSingle()

    if (eComp) mal(`no puede completarla con evidencia: ${eComp.message}`)
    else if (comp?.estado === 'en_verificacion') ok('la completa con foto y queda ESPERANDO VERIFICACIÓN (regla 5)')
    else mal(`quedó en "${comp?.estado}" en vez de en_verificacion`)

    const { count: enVerif } = await suyo.from('tareas')
      .select('id', { count: 'exact', head: true }).eq('estado', 'en_verificacion')
    ;(enVerif ?? 0) > 0 ? ok(`aparece en la cola de verificación (${enVerif} esperando)`) : mal('no aparece en la cola de verificación')

    // ── LIMPIEZA ────────────────────────────────────────────────────────────
    await adm.from('tareas').delete().eq('id', tarea.id)
    ok('tarea de prueba borrada')
  } finally {
    await adm.from('users_admin').delete().eq('id', uid)
    await adm.auth.admin.deleteUser(uid)
    console.log('  ok   usuario de prueba borrado')
  }

  console.log(fallas === 0 ? '\nTODO BIEN' : `\n${fallas} COSAS QUE NO ANDAN`)
  if (fallas > 0) process.exitCode = 1
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
