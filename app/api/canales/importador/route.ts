import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * H · EL IMPORTADOR UNIVERSAL, DESDE LA PANTALLA.
 *
 * ── LAS DOS LLAMADAS ────────────────────────────────────────────────────────
 *
 * `leer`      → calcula la huella de los encabezados, pregunta si ese formato
 *               ya se aprendió para ese canal, guarda **todas** las filas con
 *               su texto original y devuelve qué leyó. No cruza nada todavía.
 * `confirmar` → aplica el mapeo que confirmó la persona, aprende el formato
 *               para la próxima y recién ahí corre el cruce.
 *
 * ── LAS CUATRO REGLAS QUE EL CÓDIGO TIENE QUE SOSTENER ──────────────────────
 *
 * 1. **No adivinar una columna que no se entiende: se pregunta.** Si la huella
 *    no coincide, el mapeo anterior no se aplica. Aplicarlo no fallaría —
 *    mapearía mal y guardaría cualquier cosa, que es peor que fallar.
 * 2. **No descartar una fila que no se interpreta: se guarda cruda.** Toda
 *    fila entra a `archivo_filas`; las que no se entienden entran con
 *    `se_entendio = false` y el motivo.
 * 3. **No guardar nada sin que alguien vea qué se leyó.** `leer` deja la
 *    importación en `leido` y no cruza. El cruce lo dispara `confirmar`.
 * 4. **Todas las filas guardan el original**, también las que se entendieron:
 *    sin eso no se puede volver a mapear un archivo viejo con el mapeo nuevo.
 */

/** Los campos del sistema a los que se puede mapear una columna. */
const CAMPOS = [
  'sku', 'barras', 'nombre', 'precio', 'stock', 'estado',
  'monto', 'comision', 'fecha', 'id_externo', 'motivo',
] as const

const TIPOS = ['catalogo', 'liquidacion', 'errores', 'ventas'] as const

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'sin sesión', status: 401 as const }
  const { data: me } = await sb.from('users_admin').select('rol, activo')
    .eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !['super_admin', 'gerente', 'comprador', 'administrativo'].includes(me.rol)) {
    return { error: 'sin permiso', status: 403 as const }
  }
  return { ok: true as const, userId: user.id }
}

/** Mapea una fila cruda a campos del sistema. Lo que no se puede, lo dice. */
function mapear(cruda: Record<string, string>, mapeo: Record<string, string>) {
  const datos: Record<string, string> = {}
  const problemas: string[] = []

  for (const [columna, campo] of Object.entries(mapeo)) {
    if (!campo || !(CAMPOS as readonly string[]).includes(campo)) continue
    const valor = (cruda[columna] ?? '').toString().trim()
    if (!valor) continue
    // Un precio que dice «consultar» no es un precio. No se fuerza a 0: se
    // declara, porque un 0 inventado se publica y un problema declarado no.
    if ((campo === 'precio' || campo === 'monto' || campo === 'comision' || campo === 'stock')
      && !/^-?[0-9]+([.,][0-9]+)?$/.test(valor.replace(/\./g, ''))) {
      problemas.push(`${columna} dice «${valor}» y tendría que ser un número`)
      continue
    }
    datos[campo] = valor
  }

  // Sin clave no hay con qué cruzar. Es el único motivo que descalifica la fila
  // entera: todo lo demás se guarda incompleto antes que tirarse.
  if (!datos.sku && !datos.barras && !datos.id_externo && !datos.fecha) {
    problemas.push('no trae ninguna columna que sirva de clave (sku, barras, id externo o fecha)')
  }

  return problemas.length
    ? { se_entendio: false, datos: null, por_que_no: problemas.join(' · ') }
    : { se_entendio: true, datos, por_que_no: null }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: {
    accion?: 'leer' | 'confirmar'
    canal?: string; tipo?: string; archivo?: string
    encabezados?: string[]; filas?: Record<string, string>[]
    importacion?: string; mapeo?: Record<string, string>; aprender?: boolean
  }
  try { b = await req.json() } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }
  const adm = createAdminClient()

  /* ── LEER ──────────────────────────────────────────────────────────────── */
  if (b.accion === 'leer') {
    const { canal, tipo, encabezados, filas, archivo } = b
    if (!canal || !tipo || !Array.isArray(encabezados) || !encabezados.length) {
      return NextResponse.json({ error: 'faltan el canal, el tipo o los encabezados' }, { status: 400 })
    }
    if (!(TIPOS as readonly string[]).includes(tipo)) {
      return NextResponse.json({ error: `tipo desconocido: ${tipo}` }, { status: 400 })
    }
    if (!Array.isArray(filas) || !filas.length) {
      return NextResponse.json({ error: 'el archivo no trae filas' }, { status: 400 })
    }

    const [{ data: huella }, { data: perfil, error: eP }] = await Promise.all([
      adm.rpc('archivo_huella', { p_encabezados: encabezados }),
      adm.rpc('archivo_perfil_para', { p_canal: canal, p_tipo: tipo, p_encabezados: encabezados }),
    ])
    if (eP) return NextResponse.json({ error: eP.message }, { status: 500 })
    const p = perfil as {
      entra_solo: boolean; perfil_id: string | null; perfil?: string
      mapeo?: Record<string, string>; mapeo_anterior?: Record<string, string>
      aparecieron?: string[]; desaparecieron?: string[]
      veces_usado?: number; que_pasa: string
    }

    // REGLA 1 · el mapeo aprendido se aplica **sólo** si la huella coincide.
    const mapeo = p.entra_solo ? (p.mapeo ?? {}) : {}
    const mapeadas = filas.map((f) => mapear(f, mapeo))
    const leidas = mapeadas.filter((m) => m.se_entendio).length

    const { data: imp, error: eI } = await adm.from('archivo_importaciones').insert({
      canal_id: canal, tipo, archivo: archivo ?? 'sin nombre',
      perfil_id: p.entra_solo ? p.perfil_id : null,
      entro_solo: p.entra_solo,
      huella: huella as string, encabezados, mapeo,
      filas_totales: filas.length,
      filas_leidas: leidas,
      filas_crudas: filas.length - leidas,
      estado: 'leido',
      subido_por: g.userId,
    }).select('id').maybeSingle<{ id: string }>()
    if (eI) return NextResponse.json({ error: eI.message }, { status: 500 })

    // REGLA 2 y 4 · todas las filas, con el original. En tandas porque un
    // catálogo de PedidosYa son miles y un insert único se corta.
    const todas = filas.map((cruda, i) => ({
      importacion_id: imp!.id, nro_fila: i + 1,
      datos: mapeadas[i].datos, crudo: cruda as unknown as Record<string, string>,
      se_entendio: mapeadas[i].se_entendio, por_que_no: mapeadas[i].por_que_no,
    }))
    for (let i = 0; i < todas.length; i += 500) {
      const { error } = await adm.from('archivo_filas').insert(todas.slice(i, i + 500))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      importacion: imp!.id,
      entra_solo: p.entra_solo,
      que_pasa: p.que_pasa,
      mapeo_propuesto: p.entra_solo ? (p.mapeo ?? {}) : (p.mapeo_anterior ?? {}),
      aparecieron: p.aparecieron ?? [],
      desaparecieron: p.desaparecieron ?? [],
      campos: CAMPOS,
      filas_totales: filas.length,
      filas_leidas: leidas,
      filas_crudas: filas.length - leidas,
      // REGLA 3 · todavía no se cruzó nada.
      que_falta: p.entra_solo
        ? 'Revisá qué leyó y confirmá para que corra el cruce.'
        : 'Hay que confirmar el mapeo: el formato no coincide con ninguno aprendido.',
    })
  }

  /* ── CONFIRMAR ─────────────────────────────────────────────────────────── */
  if (b.accion === 'confirmar') {
    if (!b.importacion) return NextResponse.json({ error: 'falta la importación' }, { status: 400 })

    const { data: imp, error: eImp } = await adm.from('archivo_importaciones')
      .select('id, canal_id, tipo, archivo, encabezados, huella, mapeo, estado')
      .eq('id', b.importacion).maybeSingle<{
        id: string; canal_id: string; tipo: string; archivo: string
        encabezados: string[]; huella: string; mapeo: Record<string, string>; estado: string
      }>()
    if (eImp) return NextResponse.json({ error: eImp.message }, { status: 500 })
    if (!imp) return NextResponse.json({ error: 'esa importación no existe' }, { status: 404 })

    const mapeo = b.mapeo && Object.keys(b.mapeo).length ? b.mapeo : imp.mapeo
    if (!mapeo || !Object.keys(mapeo).length) {
      return NextResponse.json({ error: 'falta el mapeo de columnas' }, { status: 400 })
    }

    // Se re-mapea desde el original, que por eso se guarda siempre.
    const { data: filas, error: eF } = await adm.from('archivo_filas')
      .select('id, nro_fila, crudo').eq('importacion_id', imp.id).order('nro_fila').limit(20_000)
    if (eF) return NextResponse.json({ error: eF.message }, { status: 500 })

    let leidas = 0
    for (const f of (filas ?? []) as { id: string; crudo: Record<string, string> }[]) {
      const m = mapear(f.crudo ?? {}, mapeo)
      if (m.se_entendio) leidas++
      const { error } = await adm.from('archivo_filas').update({
        datos: m.datos, se_entendio: m.se_entendio, por_que_no: m.por_que_no,
      }).eq('id', f.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // H.3 · el formato queda aprendido. Si ya había uno con esta huella se le
    // suma un uso en vez de crear otro: dos perfiles con la misma huella hacen
    // que `archivo_perfil_para` elija uno al azar.
    let perfilId: string | null = null
    if (b.aprender !== false) {
      const { data: ya } = await adm.from('perfiles_datos')
        .select('id, veces_usado').eq('canal_id', imp.canal_id)
        .eq('tipo', imp.tipo).eq('huella', imp.huella).maybeSingle<{ id: string; veces_usado: number | null }>()
      if (ya) {
        perfilId = ya.id
        await adm.from('perfiles_datos').update({
          veces_usado: (ya.veces_usado ?? 0) + 1, mapeo_columnas: mapeo, ultima_carga: new Date().toISOString(),
        }).eq('id', ya.id)
      } else {
        const { data: nuevo, error: eN } = await adm.from('perfiles_datos').insert({
          nombre: `${imp.canal_id} · ${imp.tipo}`,
          canal_id: imp.canal_id, tipo: imp.tipo, direccion: 'import',
          formato: 'xlsx', activo: true,
          encabezados: imp.encabezados, huella: imp.huella,
          mapeo_columnas: mapeo, veces_usado: 1,
          ultima_carga: new Date().toISOString(),
          created_by: g.userId,
        }).select('id').maybeSingle<{ id: string }>()
        if (eN) return NextResponse.json({ error: eN.message }, { status: 500 })
        perfilId = nuevo?.id ?? null
      }
    }

    await adm.from('archivo_importaciones').update({
      mapeo, perfil_id: perfilId, estado: 'confirmado',
      filas_leidas: leidas,
      filas_crudas: ((filas ?? []).length) - leidas,
      confirmado_por: g.userId, confirmado_at: new Date().toISOString(),
    }).eq('id', imp.id)

    // H.7 · recién acá se cruza.
    const { data: cruce, error: eC } = await adm.rpc('archivo_cruzar', { p_importacion: imp.id })
    if (eC) return NextResponse.json({ error: eC.message }, { status: 500 })

    return NextResponse.json({
      ok: true, importacion: imp.id, filas_leidas: leidas,
      filas_crudas: ((filas ?? []).length) - leidas,
      aprendido: !!perfilId,
      cruce,
    })
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
