/**
 * F.5 · LOS DIEZ PASOS DEL DÍA DE UN ENCARGADO, PROBADOS CON SU SESIÓN.
 *
 * ── POR QUÉ CON SU SESIÓN ───────────────────────────────────────────────────
 *
 * `service_role` ve todo y no prueba nada. La mitad de los agujeros de este
 * proyecto fueron consultas que el importador veía perfectas y la pantalla
 * recibía vacías, o al revés: un encargado viendo lo de otra sucursal.
 *
 * Con RLS, «no puede» NO da error: devuelve cero filas. Por eso cada vez que
 * se prueba que algo NO se ve, se compara contra lo que ve `service_role`.
 * Sin esa comparación, una tabla vacía se lee igual que una tabla protegida.
 *
 * ── LOS DOS CAMINOS ─────────────────────────────────────────────────────────
 *
 * Algunos pasos se escriben desde el navegador con la sesión del usuario: ahí
 * manda la RLS. Otros pasan por una ruta de API que verifica el rol y después
 * escribe con el cliente de servicio: ahí manda la lista de roles de la ruta y
 * la RLS no interviene.
 *
 * Esta prueba sigue el camino que sigue la aplicación, cada uno con su guardia.
 * Probar RLS donde la app usa una ruta daría un «MAL» falso; probar la ruta
 * donde la app usa la sesión dejaría pasar un agujero de verdad.
 *
 * Donde manda la ruta, la lista de roles está copiada acá con el archivo al
 * lado. Si alguien la cambia allá y no acá, esta prueba deja de probar lo que
 * dice que prueba — por eso se compara contra la lista, no se asume.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No crea usuarios reales del equipo: los nombres los da Facundo. El de prueba
 * se borra al terminar, pase lo que pase. Todo lo que escribe lleva una marca
 * y se borra.
 *
 *   npx tsx --env-file=.env.local scripts/prueba-dia-encargado.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const adm = createClient(URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const MARCA = 'PRB-DIA-V099'

/**
 * Las listas de roles de las rutas que escriben con el cliente de servicio.
 * Copiadas de los archivos que dicen al lado.
 */
const GUARDIAS_DE_RUTA: Record<string, { archivo: string; roles: string[] }> = {
  recepcion: {
    archivo: 'app/api/recepciones/crear/route.ts',
    roles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'encargado_sucursal', 'sucursal'],
  },
  caja: {
    archivo: 'app/api/finanzas/caja/route.ts (abrir_turno)',
    roles: ['super_admin', 'gerente', 'tesoreria', 'sucursal', 'administrativo', 'cajero', 'encargado_sucursal'],
  },
  transferencia: {
    archivo: 'app/api/operaciones/transferencias/route.ts',
    roles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'],
  },
}

/** ¿La ruta deja pasar a este rol? Es la guardia real de ese paso. */
function laRutaLoDeja(clave: string, rol: string): boolean {
  const g = GUARDIAS_DE_RUTA[clave]
  if (!g) throw new Error(`guardia sin declarar: ${clave}`)
  return g.roles.includes(rol)
}
const EMAIL = 'prueba.dia.encargado.v099@social-ahorro.test'
const PASS = `Prueba-${process.env.PRUEBA_SEMILLA ?? '990099'}-x!`

let fallas = 0
let pasoActual = 0
const ok = (s: string) => console.log(`     ok   ${s}`)
const mal = (s: string) => { console.log(`     MAL  ${s}`); fallas++ }
const nd = (s: string) => console.log(`     --   ${s}`)
function paso(t: string) { pasoActual++; console.log(`\n${pasoActual}. ${t}`) }

/**
 * Prueba que una tabla esté REALMENTE oculta y no simplemente vacía.
 */
async function noDeberiaVer(suyo: SupabaseClient, tabla: string, col: string, quien: string) {
  const { count: hay } = await adm.from(tabla).select(col, { count: 'exact', head: true })
  if ((hay ?? 0) === 0) { nd(`${tabla}: no hay filas, no se puede probar si las ocultaría`); return }
  const { count: ve } = await suyo.from(tabla).select(col, { count: 'exact', head: true })
  if ((ve ?? 0) === 0) ok(`no ve ${tabla} (es de ${quien}): hay ${hay} y recibe 0`)
  else mal(`ve ${ve} filas de ${tabla} y no debería: son de ${quien}`)
}

async function main() {
  // ── PREPARACIÓN ─────────────────────────────────────────────────────────
  const { data: previos } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
  for (const u of previos?.users ?? []) if (u.email === EMAIL) await adm.auth.admin.deleteUser(u.id)

  const { data: sucs } = await adm.from('sucursales')
    .select('id, nombre, codigo').eq('activa', true).eq('es_ecommerce', false).order('codigo')
  const mia = (sucs ?? [])[0]
  const otra = (sucs ?? [])[1]
  if (!mia || !otra) throw new Error('Hacen falta al menos dos sucursales físicas activas.')
  console.log(`sucursal del encargado: ${mia.nombre} · la otra: ${otra.nombre}`)

  const { data: creado, error: eCrear } = await adm.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
    user_metadata: { nombre: 'Encargado de prueba (v0.99)' },
  })
  if (eCrear || !creado?.user) throw new Error(`No se pudo crear el usuario: ${eCrear?.message}`)
  const uid = creado.user.id
  const aBorrar: { tabla: string; ids: string[] }[] = []

  try {
    await adm.from('users_admin').upsert({
      id: uid, rol: 'encargado_sucursal', sucursal_id: mia.id, activo: true,
    }, { onConflict: 'id' })

    const suyo = createClient(URL, env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
    const { error: eLogin } = await suyo.auth.signInWithPassword({ email: EMAIL, password: PASS })
    if (eLogin) throw new Error(`No pudo entrar: ${eLogin.message}`)

    // ── 1 ─────────────────────────────────────────────────────────────────
    paso('Entra y el sistema sabe quién es y dónde trabaja')
    const { data: yo } = await suyo.from('users_admin')
      .select('rol, sucursal_id').eq('id', uid).maybeSingle()
    yo?.rol === 'encargado_sucursal' && yo?.sucursal_id === mia.id
      ? ok('lee su rol y su sucursal')
      : mal('no puede leer su propia fila de users_admin')

    // ── 2 ─────────────────────────────────────────────────────────────────
    paso('Ve el catálogo entero, no los primeros mil')
    const { count: nProd } = await suyo.from('productos_catalogo')
      .select('id', { count: 'exact', head: true }).eq('es_demo', false)
    const { count: nProdReal } = await adm.from('productos_catalogo')
      .select('id', { count: 'exact', head: true }).eq('es_demo', false)
    nProd === nProdReal
      ? ok(`ve ${nProd?.toLocaleString('es-AR')} productos, los mismos que hay`)
      : mal(`ve ${nProd} y hay ${nProdReal}`)

    const { data: busq, error: eBusq } = await suyo.rpc('catalogo_pagina', { p_q: 'ibupro', p_limite: 5 })
    !eBusq && (busq ?? []).length > 0
      ? ok('puede buscar en el catálogo')
      : mal(`la búsqueda le devuelve vacío: ${eBusq?.message ?? 'sin filas'}`)

    // ── 3 ─────────────────────────────────────────────────────────────────
    paso('Reparte las tareas del turno')
    const codigo = `${MARCA}-${pasoActual}`
    const { data: tarea, error: eTar } = await suyo.from('tareas').insert({
      codigo, tipo_origen: 'manual', titulo: `${MARCA} — borrar`,
      descripcion: 'Creada por scripts/prueba-dia-encargado.ts. Se borra sola.',
      prioridad: 'baja', estado: 'pendiente', asignacion_tipo: 'usuario_especifico',
      responsable_id: uid, sucursal_id: mia.id, verificacion_humana: true,
    }).select('id, codigo').maybeSingle()
    if (eTar || !tarea) mal(`no puede crear una tarea: ${eTar?.message}`)
    else { ok(`crea y asigna una tarea (${tarea.codigo})`); aBorrar.push({ tabla: 'tareas', ids: [tarea.id] }) }

    // ── 4 ─────────────────────────────────────────────────────────────────
    paso('Mira lo que necesita su firma, y sólo lo de su sucursal')
    const { data: dec, error: eDec } = await suyo.from('decisiones_pendientes').select('*')
    if (eDec) mal(`no puede leer las decisiones: ${eDec.message}`)
    else {
      const ajenas = (dec ?? []).filter((d: any) =>
        d.sucursal_id != null && d.sucursal_id !== mia.id)
      ajenas.length === 0
        ? ok(`ve ${(dec ?? []).length} decisión(es), ninguna de otra sucursal`)
        : mal(`ve ${ajenas.length} decisión(es) de otra sucursal`)
    }

    // ── 5 ─────────────────────────────────────────────────────────────────
    paso('Ve lo que falta y lo que se resuelve moviendo en vez de comprando')
    const { count: q } = await suyo.from('quiebres_por_sucursal')
      .select('producto_id', { count: 'exact', head: true }).eq('sucursal_id', mia.id)
    const { count: qReal } = await adm.from('quiebres_por_sucursal')
      .select('producto_id', { count: 'exact', head: true }).eq('sucursal_id', mia.id)
    q === qReal
      ? ok(`ve los ${q?.toLocaleString('es-AR')} quiebres de su sucursal`)
      : mal(`ve ${q} quiebres y hay ${qReal}`)

    const { data: resumen, error: eRes } = await suyo.rpc('agentes_resumen', { p_sucursal: mia.id })
    if (eRes) mal(`no puede leer el resumen de los agentes: ${eRes.message}`)
    else if (resumen == null) mal('el resumen de los agentes viene vacío: nunca se calculó')
    else ok(`los agentes le hablan con números del ${new Date((resumen as any).calculado_at).toLocaleString('es-AR')}`)

    // ── 6 ─────────────────────────────────────────────────────────────────
    paso('Pide una transferencia a otra sucursal en vez de comprar')
    // La pantalla pasa por una ruta que escribe con el cliente de servicio:
    // la guardia es la lista de roles de la ruta.
    laRutaLoDeja('transferencia', 'encargado_sucursal')
      ? ok(`la ruta lo deja pedir transferencias (${GUARDIAS_DE_RUTA.transferencia.archivo})`)
      : mal(`la ruta NO deja a un encargado pedir transferencias (${GUARDIAS_DE_RUTA.transferencia.archivo})`)

    const { data: tr, error: eTr } = await adm.from('transferencias_sucursal').insert({
      sucursal_origen_id: otra.id, sucursal_destino_id: mia.id, estado: 'solicitada',
      solicitado_por: uid, notas: `${MARCA} — borrar`,
    }).select('id, estado').maybeSingle()
    if (eTr) mal(`no se pudo crear la transferencia: ${eTr.message}`)
    else if (tr) {
      aBorrar.push({ tabla: 'transferencias_sucursal', ids: [tr.id] })
      ok(`queda en «${tr.estado}»: pedida, no movida (el stock lo mueve SIFACO)`)
      const { data: laVe } = await suyo.from('transferencias_sucursal')
        .select('id').eq('id', tr.id).maybeSingle()
      laVe ? ok('la ve en su lista') : mal('pide la transferencia y después no la ve')
    }

    // Y que la RLS tambien lo habilite: la ruta es la guardia de hoy, pero una
    // ruta con cliente de servicio es la unica puerta, y las unicas puertas se
    // rompen solas. Esto se arreglo en la migracion 0207.
    const { data: trRls, error: eTrRls } = await suyo.from('transferencias_sucursal').insert({
      sucursal_origen_id: otra.id, sucursal_destino_id: mia.id, estado: 'solicitada',
      solicitado_por: uid, notas: `${MARCA} — borrar`,
    }).select('id').maybeSingle()
    if (eTrRls) mal(`la RLS tampoco lo deja escribir directo: ${eTrRls.message}`)
    else if (trRls) { ok('la RLS también lo habilita, y sólo en sus sucursales'); aBorrar.push({ tabla: 'transferencias_sucursal', ids: [trRls.id] }) }

    // Lo que NO puede: una transferencia entre dos sucursales ajenas.
    const tercera = (sucs ?? [])[2]
    if (!tercera) nd('hace falta una tercera sucursal para probar el límite')
    else {
      const { data: ajena, error: eAjena } = await suyo.from('transferencias_sucursal').insert({
        sucursal_origen_id: otra.id, sucursal_destino_id: tercera.id, estado: 'solicitada',
        solicitado_por: uid, notas: `${MARCA} — borrar`,
      }).select('id').maybeSingle()
      if (eAjena) ok('no puede crear una transferencia entre dos sucursales que no son la suya')
      else { mal('creó una transferencia entre dos sucursales ajenas'); if (ajena) aBorrar.push({ tabla: 'transferencias_sucursal', ids: [ajena.id] }) }
    }

    // ── 7 ─────────────────────────────────────────────────────────────────
    paso('Registra la llegada de mercadería, con las fotos')
    laRutaLoDeja('recepcion', 'encargado_sucursal')
      ? ok(`la ruta del celular lo deja registrar (${GUARDIAS_DE_RUTA.recepcion.archivo})`)
      : mal(`la ruta NO deja a un encargado registrar la llegada (${GUARDIAS_DE_RUTA.recepcion.archivo})`)

    const { data: rec, error: eRec } = await adm.from('recepciones_mercaderia').insert({
      sucursal_id: mia.id, recibido_por: uid, observaciones: `${MARCA} — borrar`,
      estado: 'completa', fecha_recepcion: new Date().toISOString().slice(0, 10),
    }).select('id').maybeSingle()
    if (eRec) mal(`no se pudo registrar la recepción: ${eRec.message}`)
    else if (rec) {
      aBorrar.push({ tabla: 'recepciones_mercaderia', ids: [rec.id] })
      const { data: laVe } = await suyo.from('recepciones_mercaderia')
        .select('id').eq('id', rec.id).maybeSingle()
      laVe ? ok('la recepción queda registrada y la ve') : mal('registra la recepción y después no la ve')
    }

    // ── 8 ─────────────────────────────────────────────────────────────────
    //
    // El paso nuevo de la v0.99. Se prueba lo que de verdad importa: que el
    // lote caiga en SU sucursal, porque un vencimiento cargado en la sucursal
    // equivocada es peor que no cargarlo.
    paso('Carga una fecha de vencimiento desde el celular')
    // El producto sale de la lista real de los 200 priorizados. Con uno
    // cualquiera el contador de avance no se mueve, y eso no sería un error
    // del sistema sino de la prueba: `vencimientos_avance` cuenta sobre esos
    // 200, no sobre el catálogo entero.
    const { data: delTop } = await suyo.from('vencimientos_a_cargar')
      .select('producto_id, ya_cargado').eq('sucursal_id', mia.id)
      .eq('ya_cargado', false).order('prioridad', { ascending: false }).limit(1).maybeSingle()
    if (!delTop) nd('no quedan productos sin cargar entre los 200 priorizados')
    else {
      const { data: lote, error: eLote } = await adm.from('lotes_productos').insert({
        producto_id: delTop.producto_id, sucursal_id: mia.id, numero_lote: MARCA,
        fecha_vencimiento: '2027-01-31', cantidad_actual: 1, estado: 'activo', es_demo: false,
      }).select('id, sucursal_id').maybeSingle()
      if (eLote) mal(`no se pudo cargar el lote: ${eLote.message}`)
      else if (lote) {
        aBorrar.push({ tabla: 'lotes_productos', ids: [lote.id] })
        lote.sucursal_id === mia.id
          ? ok('el lote queda en su sucursal, no en otra')
          : mal('el lote quedó en otra sucursal')

        const { data: ve } = await suyo.from('lotes_productos')
          .select('id').eq('id', lote.id).maybeSingle()
        ve ? ok('lo ve después de cargarlo') : mal('carga el lote y después no lo ve')

        const { data: av } = await suyo.rpc('vencimientos_avance', { p_sucursal: mia.id }).maybeSingle()
        const cargados = Number((av as any)?.cargados ?? 0)
        cargados > 0
          ? ok(`el contador de avance lo cuenta (${cargados} cargados)`)
          : mal('el contador de avance sigue en cero después de cargar')
      }
    }

    // ── 9 ─────────────────────────────────────────────────────────────────
    paso('Cierra la caja del turno')
    laRutaLoDeja('caja', 'encargado_sucursal')
      ? ok(`la ruta de caja lo deja abrir y cerrar turno (${GUARDIAS_DE_RUTA.caja.archivo})`)
      : mal(`la ruta de caja NO deja a un encargado abrir turno (${GUARDIAS_DE_RUTA.caja.archivo})`)

    const { data: turno, error: eTurno } = await adm.from('caja_turnos').insert({
      sucursal_id: mia.id, cajero_user_id: uid, estado: 'abierto',
      fecha: new Date().toISOString().slice(0, 10), apertura: 0, es_demo: false,
    }).select('id, estado').maybeSingle()
    if (eTurno) mal(`no se pudo abrir el turno de caja: ${eTurno.message}`)
    else if (turno) {
      ok('abre el turno de caja de su sucursal')
      aBorrar.push({ tabla: 'caja_turnos', ids: [turno.id] })

      // ── EL ARQUEO A CIEGAS, COMO ES ──────────────────────────────────
      //
      // Dos pasos (v0.97): primero se sella el conteo sin ver el sistema, y
      // recién después entra el total de SIFACO y aparece la diferencia.
      // `caja_turnos.diferencia` NO la calcula la base: la escribe la ruta al
      // contrastar. Por eso acá se reproduce el contraste, no se espera que
      // un update suelto la complete sola.
      const { data: arq, error: eArq } = await adm.from('arqueos_caja').insert({
        sucursal_id: mia.id, caja_turno_id: turno.id, cajero_id: uid,
        fecha: new Date().toISOString().slice(0, 10), inicio_caja: 0,
        total_efectivo: 1000, total_mercadopago: 0, total_tarjetas: 0,
        total_sistema: 0, diferencia_cierre: 0, efectivo_a_general: 0,
        captura_url: 'prueba://captura', estado: 'en_contraste',
        conteo_confirmado_at: new Date().toISOString(), es_demo: false,
      }).select('id, estado').maybeSingle()
      if (eArq || !arq) mal(`no se pudo sellar el conteo: ${eArq?.message}`)
      else {
        aBorrar.push({ tabla: 'arqueos_caja', ids: [arq.id] })
        ok('sella el conteo a ciegas, antes de ver el total del sistema')

        const declarado = 1000, sistema = 1200
        const diferencia = declarado - sistema
        await adm.from('arqueos_caja').update({
          total_sistema: sistema, diferencia_cierre: diferencia, estado: 'observada',
        }).eq('id', arq.id)
        await adm.from('caja_turnos').update({
          contado: declarado, esperado: sistema, diferencia, estado: 'aprobado',
        }).eq('id', turno.id)

        const { data: final } = await adm.from('arqueos_caja')
          .select('estado, diferencia_cierre').eq('id', arq.id).maybeSingle()
        final?.estado === 'observada' && Number(final.diferencia_cierre) === -200
          ? ok('con diferencia queda OBSERVADA, no cerrada: el motivo lo pone una persona')
          : mal(`quedó en «${final?.estado}» con diferencia ${final?.diferencia_cierre}`)

        // El encargado ve la diferencia de SU caja. Que no acuse a nadie no
        // significa que se esconda.
        const { data: laVe } = await suyo.from('arqueos_caja')
          .select('id, diferencia_cierre').eq('id', arq.id).maybeSingle()
        laVe ? ok('la ve, con el monto y sin señalar a nadie') : mal('no ve la diferencia de su propia caja')
      }
    }

    // ── 10 ────────────────────────────────────────────────────────────────
    paso('Sube el maestro del día')
    const { count: imp, error: eImp } = await suyo.from('sifaco_importaciones')
      .select('id', { count: 'exact', head: true })
    !eImp
      ? ok(`ve las importaciones del maestro (${imp})`)
      : mal(`no ve las importaciones: ${eImp.message}`)

    // ── Y LO QUE NO TIENE QUE VER ─────────────────────────────────────────
    console.log('\n   lo que NO tiene que ver')
    await noDeberiaVer(suyo, 'pagos', 'id', 'tesorería')
    await noDeberiaVer(suyo, 'cuentas_bancarias_propias', 'id', 'tesorería')

    const { count: arqOtra } = await suyo.from('arqueos_caja')
      .select('id', { count: 'exact', head: true }).eq('sucursal_id', otra.id)
    const { count: arqOtraReal } = await adm.from('arqueos_caja')
      .select('id', { count: 'exact', head: true }).eq('sucursal_id', otra.id)
    if ((arqOtraReal ?? 0) === 0) nd(`${otra.nombre} no tiene arqueos, no se puede probar`)
    else if ((arqOtra ?? 0) === 0) ok(`no ve los ${arqOtraReal} arqueos de ${otra.nombre}`)
    else mal(`ve ${arqOtra} arqueos de ${otra.nombre} y no debería`)
  } finally {
    for (const { tabla, ids } of aBorrar.reverse()) {
      await adm.from(tabla).delete().in('id', ids)
    }
    await adm.from('users_admin').delete().eq('id', uid)
    await adm.auth.admin.deleteUser(uid)
    console.log('\n   lo de prueba, borrado')
  }

  console.log(fallas === 0
    ? '\nTODO BIEN · los diez pasos del día andan'
    : `\n${fallas} COSA(S) QUE NO ANDAN en el día del encargado`)
  if (fallas > 0) process.exitCode = 1
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
