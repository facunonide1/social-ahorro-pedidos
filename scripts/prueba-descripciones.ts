/**
 * F · LAS DESCRIPCIONES, PROBADAS CONTRA LA PARED.
 *
 * ── QUÉ PRUEBA Y QUÉ NO ─────────────────────────────────────────────────────
 *
 * NO prueba al modelo. La cuenta de Anthropic de este proyecto no tiene
 * crédito, así que `proponerUna()` no se puede correr de verdad hoy.
 *
 * Prueba todo lo que rodea al modelo, que es donde está la regla:
 *
 *   · que una descripción que promete algo NO se pueda aprobar, intentándolo
 *     de las dos formas posibles: por la puerta (el lote) y por atrás (un
 *     update directo contra la tabla);
 *   · que la regla valga igual en perfumería, que es la excepción que el
 *     enunciado pidió no hacer;
 *   · que el lote no se caiga entero por una que promete;
 *   · que la exportación saque sólo lo aprobado;
 *   · que lo que no se puede describir quede anotado con el motivo.
 *
 * Las descripciones que inserta son de prueba y se borran al final: una
 * descripción falsa aprobada en producción sale al canal.
 *
 *   npx tsx --env-file=.env.local scripts/prueba-descripciones.ts
 */
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } })

let fallas = 0
const ok = (s: string) => console.log(`  ok    ${s}`)
const mal = (s: string) => { console.log(`  MAL   ${s}`); fallas++ }
const nd = (s: string) => console.log(`  --    ${s}`)

/**
 * Los casos. Cada uno con el motivo por el que está.
 *
 * Los de perfumería están a propósito: el enunciado pidió que la regla sea
 * una sola, «ni siquiera en perfumería», y una regla con excepciones no se
 * cumple.
 */
const CASOS: { texto: string; promete: boolean; por_que: string }[] = [
  { texto: 'Comprimidos de omeprazol 20 mg. Envase con 14 unidades.',
    promete: false, por_que: 'dice qué es: forma, principio activo, concentración y contenido' },
  { texto: 'Jabón líquido con clorhexidina al 4%. Frasco de 110 ml.',
    promete: false, por_que: 'composición y envase, sin para qué sirve' },
  { texto: 'Crema con urea al 10%. Pomo de 100 g. Ideal para pieles secas.',
    promete: true, por_que: '«ideal para» es una indicación' },
  { texto: 'Jarabe de ambroxol 15 mg/5 ml. Alivia la tos y mejora la respiración.',
    promete: true, por_que: 'afirma dos efectos sobre el cuerpo' },
  { texto: 'Perfume femenino, eau de parfum 50 ml. Hidrata la piel hasta 24 horas.',
    promete: true, por_que: 'perfumería: «hidrata» está prohibido igual, la regla es una sola' },
  { texto: 'Sérum facial con vitamina C al 10%. Frasco de 30 ml. Resultados visibles en 7 días.',
    promete: true, por_que: 'cosmética: «resultados visibles» promete velocidad' },
  { texto: 'Shampoo con ketoconazol al 2%. Frasco de 100 ml.',
    promete: false, por_que: 'cosmética bien escrita: composición y envase' },
  { texto: 'El mejor suplemento de magnesio del mercado, 100% natural.',
    promete: true, por_que: 'dos superlativos insostenibles' },
]

async function main() {
  // ── LA PARED, PALABRA POR PALABRA ───────────────────────────────────────
  console.log('── la regla dura · ninguna promesa ──')
  for (const c of CASOS) {
    const { data, error } = await adm.rpc('descripcion_promete', { p_texto: c.texto })
    if (error) { mal(`descripcion_promete falló: ${error.message}`); continue }
    const encontradas = (data ?? []) as { frase: string; familia: string; por_que: string }[]
    if (c.promete && !encontradas.length) {
      mal(`pasó y no debería (${c.por_que}): «${c.texto}»`)
    } else if (!c.promete && encontradas.length) {
      mal(`la frenó y no debería (${c.por_que}): «${c.texto}» → ${encontradas.map((e) => e.frase).join(', ')}`)
    } else if (c.promete) {
      ok(`frenada por ${encontradas.map((e) => e.familia).join('/')} · ${c.por_que}`)
    } else {
      ok(`pasa · ${c.por_que}`)
    }
  }

  // ── LA PARED NO SE PUEDE SALTAR POR ATRÁS ───────────────────────────────
  //
  // La puerta (`descripciones_aprobar_lote`) revisa. Pero un update directo
  // contra la tabla la saltearía, y la base la usan varias cosas. Por eso la
  // regla está además en un trigger, y esto lo verifica.
  console.log('\n── la pared, intentada por atrás ──')
  const { data: cola } = await adm.rpc('descripciones_cola', { p_limite: 3 })
  const victimas = ((cola ?? []) as { producto_id: string; nombre_canal: string }[])
    .filter((p) => p.producto_id)
  if (victimas.length < 2) {
    nd('no hay suficientes productos en la cola para probar el lote')
  } else {
    const lote = randomUUID()
    const MARCA = '__PRUEBA_DESCRIPCIONES__'

    // Una buena y una que promete, en el mismo lote.
    const filas = [
      { producto_id: victimas[0].producto_id, texto: `Comprimidos recubiertos. Envase con 14 unidades. ${MARCA}` },
      { producto_id: victimas[1].producto_id, texto: `Crema humectante. Hidrata la piel y alivia la irritación. ${MARCA}` },
    ]
    const { error: eIns } = await adm.from('producto_descripciones').upsert(
      filas.map((f) => ({ ...f, estado: 'propuesta', lote_id: lote, fuente: 'prueba', modelo: 'prueba' })),
      { onConflict: 'producto_id' })
    if (eIns) { mal(`no se pudieron insertar las propuestas: ${eIns.message}`); return limpiar(MARCA) }

    // 1 · por atrás: un update directo a 'aprobada' sobre la que promete.
    const { error: ePared } = await adm.from('producto_descripciones')
      .update({ estado: 'aprobada' }).eq('producto_id', victimas[1].producto_id)
    if (!ePared) {
      mal('un update directo aprobó una descripción que promete: la pared no está')
    } else if (!/promete/i.test(ePared.message)) {
      mal(`la pared frenó pero con otro motivo: ${ePared.message}`)
    } else {
      ok('un update directo a «aprobada» se frena, y el error dice qué frase fue')
    }

    // 2 · por la puerta, y con una sesión de verdad.
    //
    // `descripciones_aprobar_lote` guarda `auth.uid()` y mira el rol: lo que
    // se aprueba sale a los canales. Con el cliente de servicio se niega, y
    // eso es lo correcto — una descripción publicada sin dueño es una que
    // nadie confirmó.
    const { data: sinSesion } = await adm.rpc('descripciones_aprobar_lote', { p_lote: lote })
    const ss = sinSesion as any
    ss?.ok === false
      ? ok('el cliente de servicio no puede aprobar un lote: lo aprobado sale a los canales')
      : mal('el cliente de servicio aprobó un lote sin dueño')

    const email = 'prueba.descripciones@social-ahorro.test'
    const pass = 'Prueba-desc-12!'
    const { data: previos } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of previos?.users ?? []) if (u.email === email) await adm.auth.admin.deleteUser(u.id)
    const { data: nuevo } = await adm.auth.admin.createUser({ email, password: pass, email_confirm: true })
    if (!nuevo?.user) {
      mal('no se pudo crear el usuario de prueba')
      return limpiar(MARCA)
    }
    await adm.from('users_admin').upsert(
      { id: nuevo.user.id, rol: 'marketing', activo: true }, { onConflict: 'id' })
    const suyo = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      { auth: { persistSession: false } })
    const { error: eLogin } = await suyo.auth.signInWithPassword({ email, password: pass })
    if (eLogin) {
      mal(`el usuario de prueba no pudo entrar: ${eLogin.message}`)
      await adm.from('users_admin').delete().eq('id', nuevo.user.id)
      await adm.auth.admin.deleteUser(nuevo.user.id)
      return limpiar(MARCA)
    }

    // Un rol que no aprueba, no aprueba.
    await adm.from('users_admin').update({ rol: 'cajero' }).eq('id', nuevo.user.id)
    const { data: negado } = await suyo.rpc('descripciones_aprobar_lote', { p_lote: lote })
    const ng = negado as any
    ng?.ok === false && /no aprueba descripciones/.test(String(ng?.por_que ?? ''))
      ? ok('un cajero no puede aprobar un lote, y la función dice por qué')
      : mal('un cajero pudo aprobar un lote de descripciones')

    await adm.from('users_admin').update({ rol: 'marketing' }).eq('id', nuevo.user.id)
    const { data: res, error: eLote } = await suyo.rpc('descripciones_aprobar_lote', { p_lote: lote })
    if (eLote) {
      mal(`el lote se cayó entero: ${eLote.message}`)
    } else {
      const r = res as any
      if (r.aprobadas === 1 && r.frenadas === 1) {
        ok(`el lote aprobó ${r.aprobadas} y dejó ${r.frenadas} afuera, sin caerse`)
      } else {
        mal(`el lote aprobó ${r.aprobadas} y frenó ${r.frenadas}: se esperaba 1 y 1`)
      }
      if (!r.detalle_frenadas?.[0]?.por_que) {
        mal('el lote no dice por qué quedó afuera la que frenó')
      } else {
        ok('y dice cuál quedó afuera y con qué frase')
      }
    }
    await adm.from('users_admin').delete().eq('id', nuevo.user.id)
    await adm.auth.admin.deleteUser(nuevo.user.id)

    // ── F.5 · LA EXPORTACIÓN SACA SÓLO LO APROBADO ────────────────────────
    const { data: exp, error: eExp } = await adm.rpc('descripciones_exportar', { p_canal: null })
    if (eExp) {
      mal(`la exportación falló: ${eExp.message}`)
    } else {
      const filasExp = (exp ?? []) as { descripcion: string }[]
      const salioLaMala = filasExp.some((f) => /hidrata la piel/i.test(f.descripcion ?? ''))
      const salioLaBuena = filasExp.some((f) => (f.descripcion ?? '').includes(MARCA))
      if (salioLaMala) mal('la exportación sacó una descripción que promete')
      else if (!salioLaBuena) mal('la exportación no sacó la aprobada')
      else ok(`la exportación sacó ${filasExp.length} aprobada(s) y ninguna rechazada`)
    }

    await limpiar(MARCA)
  }

  // ── F.4 · LO QUE NO SE PUEDE DESCRIBIR ──────────────────────────────────
  console.log('\n── F.4 · lo que no se puede describir ──')
  const { data: sinPoder, error: eSP } = await adm.rpc('descripciones_sin_poder')
  if (eSP) {
    mal(`descripciones_sin_poder falló: ${eSP.message}`)
  } else {
    const l = (sinPoder ?? []) as { por_que_no: string | null; nombre_canal: string }[]
    const sinMotivo = l.filter((x) => !x.por_que_no?.trim())
    if (sinMotivo.length) mal(`${sinMotivo.length} quedaron sin describir y sin decir por qué`)
    else ok(l.length === 0
      ? 'todavía no hay ninguna marcada como «no se puede describir»'
      : `las ${l.length} que no se pudieron describir dicen por qué`)
  }

  // ── F.3 · LA COLA, Y EL PROXY DECLARADO ─────────────────────────────────
  console.log('\n── F.3 · el orden de la cola ──')
  const { data: c2 } = await adm.rpc('descripciones_cola', { p_limite: 20 })
  const lista = (c2 ?? []) as { unidades_3m: number; por_que_este: string; nombre_canal: string }[]
  const ordenada = lista.every((x, i) => i === 0 || Number(lista[i - 1].unidades_3m) >= Number(x.unidades_3m))
  ordenada ? ok('la cola viene de mayor a menor venta') : mal('la cola no está ordenada por venta')
  if (lista[0] && !/no hay registro de vistas/i.test(lista[0].por_que_este)) {
    mal('la cola no declara que el orden por venta es un proxy de «los más vistos»')
  } else if (lista[0]) {
    ok('y declara que el orden es por venta porque no hay registro de vistas')
  }
  // «ENVIO ZONA 1» no es un producto y no tiene que estar.
  const noProducto = lista.filter((x) => /^env[íi]o/i.test(x.nombre_canal ?? ''))
  noProducto.length
    ? mal(`la cola trae ${noProducto.length} que no son productos: ${noProducto.map((x) => x.nombre_canal).join(', ')}`)
    : ok('la cola no trae cargos de envío ni conceptos internos de SIFACO')

  const { data: resumen } = await adm.rpc('descripciones_resumen')
  nd(`resumen: ${JSON.stringify(resumen)}`)

  console.log(`\n${fallas === 0 ? 'TODO BIEN' : `${fallas} FALLA(S)`}`)
  process.exit(fallas === 0 ? 0 : 1)
}

/** Las descripciones de prueba no se quedan: una aprobada sale al canal. */
async function limpiar(marca: string) {
  await adm.from('producto_descripciones').delete().like('texto', `%${marca}%`)
  await adm.from('producto_descripciones').delete().eq('fuente', 'prueba')
}

main().catch((e) => { console.error(e); process.exit(1) })
