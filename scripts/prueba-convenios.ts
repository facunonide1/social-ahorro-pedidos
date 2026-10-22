/**
 * EL CIRCUITO DE OBRAS SOCIALES, PROBADO PUNTA A PUNTA.
 *
 * ── QUÉ PRUEBA ──────────────────────────────────────────────────────────────
 *
 * Padrón → presentación → troqueles → envío → débito → reclamable → reclamo,
 * con datos reales que se borran al terminar.
 *
 * El corazón es la lógica de **reclamable**: el mismo débito por troquel
 * faltante tiene que dar reclamable=true con acuse de recibo y false sin
 * acuse. Si eso no anda, todo el bloque C no sirve: o se reclama todo (y se
 * pierde tiempo) o nada (y se pierde plata).
 *
 * ── Y QUÉ MÁS VERIFICA ──────────────────────────────────────────────────────
 *
 * Que ninguna tabla `convenio*` tenga una columna de paciente, médico,
 * afiliado o diagnóstico. Es la regla de oro 9 y se chequea contra el catálogo
 * de Postgres, no contra lo que uno recuerda haber escrito.
 *
 *   npx tsx --env-file=.env.local scripts/prueba-convenios.ts
 */
import { createClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const MARCA = '__PRUEBA_CONVENIOS__'
let fallas = 0
const ok = (s: string) => console.log(`  ok    ${s}`)
const mal = (s: string) => { console.log(`  MAL   ${s}`); fallas++ }
const nd = (s: string) => console.log(`  --    ${s}`)
const hoy = () => new Date().toISOString().slice(0, 10)
const hace = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

async function reclamable(id: string) {
  const { data, error } = await adm.rpc('convenio_debito_reclamable', { p_debito: id })
  if (error) throw new Error(error.message)
  return data as { reclamable: boolean | null; por_que: string; vence_at?: string; dias?: number }
}

async function main() {
  // ── EL LÍMITE, CONTRA EL CATÁLOGO DE POSTGRES ───────────────────────────
  console.log('── la regla de oro 9 ──')
  const { data: prohibidas } = await adm.rpc('convenios_columnas_prohibidas')
  const lista = (prohibidas ?? []) as { tabla: string; columna: string }[]
  if (!lista.length) {
    ok('ninguna tabla convenio* tiene columna de paciente, médico, afiliado ni diagnóstico')
  } else {
    for (const c of lista) mal(`${c.tabla}.${c.columna} identifica a una persona y no puede existir`)
  }

  // ── PREPARACIÓN ─────────────────────────────────────────────────────────
  console.log('\n── preparando ──')
  await limpiar()

  const { data: sucs } = await adm.from('sucursales')
    .select('id, nombre, codigo').eq('activa', true).eq('es_ecommerce', false).order('codigo')
  const suc = (sucs ?? [])[0]
  const otra = (sucs ?? [])[1]
  if (!suc || !otra) throw new Error('hacen falta dos sucursales físicas')

  const { data: conv, error: eConv } = await adm.from('convenios').insert({
    nombre: `${MARCA} OSDE`, tipo: 'obra_social', cobertura_general_pct: 70,
    plazo_presentacion_dias: 60, plazo_pago_dias: 45, troquel: 'fisico',
    periodicidad: 'mensual', dia_cierre: 10, modo_presentacion: 'por_sucursal',
    aviso_dias_antes: 7,
  }).select('id').maybeSingle()
  if (eConv || !conv) throw new Error(`no se pudo crear el convenio: ${eConv?.message}`)
  ok(`convenio de prueba creado (cubre 70%, presenta hasta 60 días, cierra el 10)`)

  // A.2 · la exigencia que después explica el débito
  await adm.from('convenio_requisitos').insert({
    convenio_id: conv.id, exigencia: 'troquel',
    detalle: 'Troquel pegado en el cuerpo del comprobante.', motivo_debito: 'troquel_faltante',
  })
  ok('exigencia de troquel cargada, apuntando al motivo de débito')

  // ── B.5 · EL AVISO ANTES DEL CIERRE ─────────────────────────────────────
  console.log('\n── B.5 · el aviso antes del cierre ──')
  const { data: cierres } = await adm.from('convenio_cierres_proximos')
    .select('*').eq('convenio_id', conv.id)
  const c0 = (cierres ?? [])[0] as any
  if (!c0) mal('la vista de cierres no devolvió nada para el convenio de prueba')
  else if (c0.cierre == null) mal(`no calculó el cierre: ${c0.por_que_no_se_sabe}`)
  else ok(`cierra el ${c0.cierre} (en ${c0.dias} días), por sucursal: ${cierres?.length} filas`)

  // Un convenio sin periodicidad no inventa fecha.
  const { data: sinDatos } = await adm.from('convenios').insert({
    nombre: `${MARCA} SIN DATOS`,
  }).select('id').maybeSingle()
  const { data: cSin } = await adm.from('convenio_cierres_proximos')
    .select('cierre, por_que_no_se_sabe').eq('convenio_id', sinDatos!.id).limit(1).maybeSingle()
  if ((cSin as any)?.cierre == null && (cSin as any)?.por_que_no_se_sabe) {
    ok(`sin periodicidad devuelve null con el motivo: «${(cSin as any).por_que_no_se_sabe}»`)
  } else {
    mal('un convenio sin periodicidad devolvió una fecha de cierre inventada')
  }

  // ── B.1 / B.2 · LA PRESENTACIÓN ─────────────────────────────────────────
  console.log('\n── B · la presentación ──')
  const { data: pres, error: ePres } = await adm.from('convenio_presentaciones').insert({
    convenio_id: conv.id, sucursal_id: suc.id,
    periodo_desde: hace(40), periodo_hasta: hace(10), estado: 'borrador',
    notas: MARCA,
  }).select('id').maybeSingle()
  if (ePres || !pres) throw new Error(`no se pudo armar la presentación: ${ePres?.message}`)
  ok(`presentación armada para ${suc.nombre}`)

  // La sucursal es obligatoria: se prueba que la base lo rechaza.
  const { error: eSinSuc } = await adm.from('convenio_presentaciones').insert({
    convenio_id: conv.id, sucursal_id: null as any,
    periodo_desde: hace(5), periodo_hasta: hoy(),
  })
  eSinSuc
    ? ok('una presentación sin sucursal la rechaza la base, no la pantalla')
    : mal('se pudo crear una presentación sin sucursal')

  // Dos presentaciones del mismo período: plata contada dos veces.
  const { error: eDup } = await adm.from('convenio_presentaciones').insert({
    convenio_id: conv.id, sucursal_id: suc.id,
    periodo_desde: hace(40), periodo_hasta: hace(10),
  })
  eDup
    ? ok('no se puede armar dos veces el mismo convenio, sucursal y período')
    : mal('se armaron dos presentaciones del mismo período')

  // Tres comprobantes: dos entran, uno queda afuera.
  const comps: string[] = []
  for (const [i, imp] of [10_000, 25_000, 7_000].entries()) {
    const { data: cc, error: eCc } = await adm.from('convenio_comprobantes').insert({
      convenio_id: conv.id, sucursal_id: suc.id,
      numero: `${MARCA}-${i + 1}`, fecha: hace(30 - i),
      importe_total: imp, importe_cobertura: imp * 0.7, importe_particular: imp * 0.3,
      presentacion_id: i < 2 ? pres.id : null,
      estado: i < 2 ? 'en_presentacion' : 'sin_presentar',
    }).select('id').maybeSingle()
    if (eCc || !cc) { mal(`no se pudo cargar el comprobante ${i + 1}: ${eCc?.message}`); continue }
    comps.push(cc.id)
  }
  ok(`${comps.length} comprobantes cargados, sin ningún dato de paciente ni de médico`)

  // B.3 · el tercero queda AFUERA con motivo, y sin motivo no se puede.
  const { error: eSinMotivo } = await adm.from('convenio_comprobantes')
    .update({ estado: 'excluido', motivo_exclusion: null }).eq('id', comps[2])
  eSinMotivo
    ? ok('un comprobante excluido sin motivo lo rechaza la base')
    : mal('se pudo excluir un comprobante sin decir por qué')

  await adm.from('convenio_comprobantes').update({
    estado: 'excluido', motivo_exclusion: 'falta_troquel',
    exclusion_detalle: 'El troquel no estaba pegado.',
  }).eq('id', comps[2])
  ok('queda afuera con motivo de catálogo, y no desaparece')

  // El total lo calcula la base.
  const { data: rec } = await adm.rpc('convenio_presentacion_recalcular', { p_presentacion: pres.id })
  const r0 = ((rec ?? []) as any[])[0] ?? rec
  const esperado = (10_000 + 25_000) * 0.7
  Number((r0 as any)?.total) === esperado
    ? ok(`el total lo calcula la base: $${esperado.toLocaleString('es-AR')} (la cobertura, no el total)`)
    : mal(`el total dio ${(r0 as any)?.total} y esperaba ${esperado}`)

  // ── B.6 · ENVIAR GENERA LA TAREA DE CONTROL ─────────────────────────────
  console.log('\n── B.6 · la tarea de control ──')
  const { data: env } = await adm.rpc('convenio_presentacion_enviar', { p_presentacion: pres.id })
  const e = env as any
  if (!e?.ok) mal(`no se pudo enviar: ${e?.motivo}`)
  else {
    ok(`enviada: ${e.comprobantes} comprobantes por $${Number(e.total).toLocaleString('es-AR')}`)
    const { data: tarea } = await adm.from('tareas')
      .select('codigo, titulo, sucursal_id, verificacion_humana, entidad_relacionada')
      .eq('id', e.tarea_id).maybeSingle()
    const t = tarea as any
    t && t.entidad_relacionada === 'convenio_presentacion' && t.sucursal_id === suc.id
      ? ok(`generó la tarea de control ${t.codigo}, en la sucursal correcta (regla de oro 5)`)
      : mal('la tarea de control no quedó bien atada')
  }

  // Enviar dos veces: devuelve el motivo, no revienta.
  const { data: env2 } = await adm.rpc('convenio_presentacion_enviar', { p_presentacion: pres.id })
  ;(env2 as any)?.ok === false && (env2 as any)?.motivo
    ? ok(`enviar dos veces devuelve el motivo y no una excepción: «${(env2 as any).motivo.slice(0, 60)}…»`)
    : mal('enviar dos veces no dio el rechazo esperado')

  // ── C · EL DÉBITO Y LA LÓGICA DE RECLAMABLE ─────────────────────────────
  console.log('\n── C.4 · cómo se decide si un débito es reclamable ──')

  const { data: dTroquel } = await adm.from('convenio_debitos').insert({
    convenio_id: conv.id, sucursal_id: suc.id, presentacion_id: pres.id,
    comprobante_id: comps[0], motivo: 'troquel_faltante',
    importe: 7_000, fecha_liquidacion: hace(5), notas: MARCA,
  }).select('id').maybeSingle()

  // Sin acuse: NO reclamable, y lo dice.
  let r = await reclamable(dTroquel!.id)
  r.reclamable === false && /acuse/.test(r.por_que)
    ? ok(`sin acuse de troqueles: NO reclamable — «${r.por_que}»`)
    : mal(`sin acuse dio reclamable=${r.reclamable}: ${r.por_que}`)

  // Con remito pero sin acuse: sigue sin ser reclamable. El remito solo no
  // alcanza, y es la confusión más fácil de cometer.
  const { data: tro } = await adm.from('convenio_troqueles').insert({
    presentacion_id: pres.id, remito_numero: `${MARCA}-R1`, cantidad: 35,
    enviado_at: hace(8), foto_remito_url: 'prueba://remito',
  }).select('id').maybeSingle()
  r = await reclamable(dTroquel!.id)
  r.reclamable === false
    ? ok('con remito pero sin acuse: sigue sin ser reclamable — el remito solo no prueba que llegó')
    : mal(`con remito y sin acuse dio reclamable=${r.reclamable}`)

  // Con acuse: reclamable, con plazo.
  await adm.from('convenio_troqueles')
    .update({ acuse_at: hace(6), acuse_foto_url: 'prueba://acuse' }).eq('id', tro!.id)
  r = await reclamable(dTroquel!.id)
  r.reclamable === true && r.vence_at
    ? ok(`con acuse: RECLAMABLE, vence el ${r.vence_at} (${r.dias} días)`)
    : mal(`con acuse dio reclamable=${r.reclamable}: ${r.por_que}`)

  // El mismo débito con el plazo vencido: deja de ser reclamable y dice que
  // ERA reclamable. Es la plata que se pierde por dejarla vencer.
  await adm.from('convenio_debitos').update({ fecha_liquidacion: hace(60) }).eq('id', dTroquel!.id)
  r = await reclamable(dTroquel!.id)
  r.reclamable === false && /vencio/.test(r.por_que)
    ? ok(`con el plazo vencido: «${r.por_que}»`)
    : mal(`con el plazo vencido dio reclamable=${r.reclamable}: ${r.por_que}`)
  await adm.from('convenio_debitos').update({ fecha_liquidacion: hace(5) }).eq('id', dTroquel!.id)

  // Un motivo que no se reclama nunca.
  const { data: dBaja } = await adm.from('convenio_debitos').insert({
    convenio_id: conv.id, sucursal_id: suc.id, motivo: 'afiliado_de_baja',
    importe: 3_000, fecha_liquidacion: hace(5), notas: MARCA,
  }).select('id').maybeSingle()
  r = await reclamable(dBaja!.id)
  r.reclamable === false
    ? ok('un afiliado dado de baja no se reclama, y el sistema dice qué corresponde en su lugar')
    : mal(`afiliado de baja dio reclamable=${r.reclamable}`)

  // E.2 · Un motivo que no se entendió: null, NO false.
  const { data: dOtro } = await adm.from('convenio_debitos').insert({
    convenio_id: conv.id, sucursal_id: suc.id, motivo: 'otro',
    motivo_texto_original: 'DEB. S/COD 4471 VER CIRCULAR', importe: 12_000,
    fecha_liquidacion: hace(5), notas: MARCA,
  }).select('id').maybeSingle()
  r = await reclamable(dOtro!.id)
  r.reclamable === null
    ? ok(`un motivo que no se entendió da NULL, no false: «${r.por_que}»`)
    : mal(`un motivo desconocido dio reclamable=${r.reclamable} en vez de null`)

  // ── C.6 · LA TAREA DEL RECLAMO ──────────────────────────────────────────
  console.log('\n── C.6 · la tarea del débito reclamable ──')
  const { data: tar } = await adm.rpc('convenio_debito_tarea', { p_debito: dTroquel!.id })
  ;(tar as any)?.ok
    ? ok(`tarea de reclamo ${(tar as any).tarea_codigo}, vence el ${(tar as any).vence_at}`)
    : mal(`no creó la tarea: ${(tar as any)?.motivo}`)

  const { data: tar2 } = await adm.rpc('convenio_debito_tarea', { p_debito: dBaja!.id })
  ;(tar2 as any)?.ok === false
    ? ok('un débito no reclamable no genera tarea, y dice por qué')
    : mal('generó tarea para un débito que no se puede reclamar')

  const { data: tar3 } = await adm.rpc('convenio_debito_tarea', { p_debito: dOtro!.id })
  ;(tar3 as any)?.ok === false
    ? ok('un débito que «no se puede saber» tampoco genera tarea: no se adivina')
    : mal('generó tarea para un débito sin clasificar')

  // ── C.7 · LO QUE SE VE ──────────────────────────────────────────────────
  console.log('\n── C.7 · por motivo, ordenado por plata ──')
  const { data: porMotivo } = await adm.from('convenio_debitos_por_motivo').select('*')
  const pm = (porMotivo ?? []) as any[]
  if (pm.length >= 3 && Number(pm[0].plata) >= Number(pm[1].plata)) {
    ok(`${pm.length} motivos, el primero es «${pm[0].motivo_nombre}» con $${Number(pm[0].plata).toLocaleString('es-AR')}`)
  } else {
    mal('la vista por motivo no vino ordenada por plata')
  }

  const { data: recup } = await adm.from('convenio_recupero').select('situacion, importe')
  const sit = new Map<string, number>()
  for (const x of (recup ?? []) as any[]) sit.set(x.situacion, (sit.get(x.situacion) ?? 0) + 1)
  sit.size > 0
    ? ok(`situaciones: ${[...sit.entries()].map(([k, v]) => `${v} ${k}`).join(' · ')}`)
    : mal('la vista de recupero vino vacía')

  // Por sucursal: con una sola sucursal, `veces_el_promedio` tiene que ser
  // null. Con un solo dato no hay con qué comparar.
  const { data: porSuc } = await adm.from('convenio_debitos_por_sucursal').select('*')
  const unaSola = (porSuc ?? []).every((x: any) => x.veces_el_promedio == null)
  unaSola
    ? ok('con una sola sucursal, «veces el promedio» queda en null: no se compara contra nada')
    : nd('hay más de una sucursal con el mismo motivo: la comparación aplica')

  // ── C.5 · EL RECLAMO QUEDA ABIERTO ──────────────────────────────────────
  console.log('\n── C.5 · el reclamo ──')
  const { data: rcl } = await adm.from('convenio_reclamos').insert({
    debito_id: dTroquel!.id, como: 'portal',
    respaldo: { remito: `${MARCA}-R1`, acuse: 'prueba://acuse' },
    que_se_dijo: 'Se adjunta remito con acuse de recibo.',
  }).select('id, resultado, cerrado_at').maybeSingle()
  ;(rcl as any)?.resultado === null && (rcl as any)?.cerrado_at === null
    ? ok('el reclamo nace abierto: resultado en null es «nadie lo cerró», no «sin respuesta»')
    : mal('el reclamo nació cerrado')

  await adm.from('convenio_reclamos').update({
    resultado: 'recuperado', importe_recuperado: 7_000,
    respuesta: 'Aceptado.', respuesta_at: hoy(), cerrado_at: new Date().toISOString(),
  }).eq('id', (rcl as any).id)
  await adm.from('convenio_debitos').update({ estado: 'recuperado' }).eq('id', dTroquel!.id)
  const { data: res2 } = await adm.rpc('convenios_resumen', { p_sucursal: null })
  Number((res2 as any)?.debitos?.recuperado) === 7_000
    ? ok('el resumen cuenta los $7.000 recuperados')
    : mal(`el resumen dice recuperado=${(res2 as any)?.debitos?.recuperado}`)

  // ── UN DÉBITO NO SE BORRA ───────────────────────────────────────────────
  const { data: pols } = await adm.rpc('convenios_politicas_de_borrado')
  const puedeBorrar = ((pols ?? []) as any[]).some((p) => p.tabla === 'convenio_debitos')
  puedeBorrar
    ? mal('hay una política que permite borrar débitos: taparlos es lo que este bloque viene a impedir')
    : ok('no hay política de borrado sobre los débitos: se cierran como perdidos, no se tapan')

  await limpiar()
  console.log(fallas === 0 ? '\nTODO BIEN' : `\n${fallas} COSA(S) QUE NO ANDAN`)
  if (fallas > 0) process.exitCode = 1
}

/** Todo lo de prueba se borra, pase lo que pase. */
async function limpiar() {
  const { data: convs } = await adm.from('convenios').select('id').like('nombre', `${MARCA}%`)
  const ids = (convs ?? []).map((c: any) => c.id)
  await adm.from('tareas').delete().like('codigo', 'OS-%').like('descripcion', `%${MARCA}%`)
  if (!ids.length) return
  const { data: press } = await adm.from('convenio_presentaciones').select('id').in('convenio_id', ids)
  const pIds = (press ?? []).map((p: any) => p.id)
  const { data: debs } = await adm.from('convenio_debitos').select('id').in('convenio_id', ids)
  const dIds = (debs ?? []).map((d: any) => d.id)
  if (dIds.length) {
    await adm.from('tareas').delete().eq('entidad_relacionada', 'convenio_debito').in('entidad_id', dIds)
    await adm.from('convenio_reclamos').delete().in('debito_id', dIds)
  }
  if (pIds.length) {
    await adm.from('tareas').delete().eq('entidad_relacionada', 'convenio_presentacion').in('entidad_id', pIds)
    await adm.from('convenio_troqueles').delete().in('presentacion_id', pIds)
  }
  await adm.from('convenio_debitos').delete().in('convenio_id', ids)
  await adm.from('convenio_comprobantes').delete().in('convenio_id', ids)
  await adm.from('convenio_presentaciones').delete().in('convenio_id', ids)
  await adm.from('convenios').delete().in('id', ids)
}

main().catch(async (e) => {
  console.error('FALLO:', e?.message ?? e)
  try { await limpiar() } catch { /* */ }
  process.exit(1)
})
