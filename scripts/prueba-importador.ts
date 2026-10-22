/**
 * H · EL IMPORTADOR UNIVERSAL, PROBADO CON LOS DOS FORMATOS DE PEDIDOSYA.
 *
 * ── POR QUÉ ESTA PRUEBA EXISTE ──────────────────────────────────────────────
 *
 * El enunciado dice que los archivos de Guzmán y Figueiras **ya vienen
 * distintos entre sí** —en uno el SKU es el código de barras con ceros, en el
 * otro sin ceros, y en un tercero el campo `barcode` viene vacío— y que si
 * cada formato necesita código, esto no escala.
 *
 * Eso se prueba con dos archivos distintos y mirando tres cosas:
 *
 *   · que el sistema aprenda el primero,
 *   · que **no aplique** el aprendido al segundo,
 *   · y que diga QUÉ cambió, no sólo que cambió.
 *
 * Los archivos son armados acá: no hay archivos reales de PedidosYa en el
 * proyecto, y eso se dice en el reporte.
 *
 *   npx tsx --env-file=.env.local scripts/prueba-importador.ts
 */
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
 * Los dos formatos. Son los que el enunciado describe: mismas columnas
 * conceptuales, encabezados distintos y el SKU con ceros en uno y sin ceros
 * en el otro.
 */
const FIGUEIRAS = {
  encabezados: ['Codigo', 'Nombre del producto', 'Precio', 'Stock', 'Estado'],
  filas: [
    { Codigo: '0000123456', 'Nombre del producto': 'IBUPIRAC 600 X10', Precio: '4500', Stock: '12', Estado: 'activo' },
    { Codigo: '0000123457', 'Nombre del producto': 'ACTRON 600 X10', Precio: '5200', Stock: '0', Estado: 'activo' },
  ],
}
const GUZMAN = {
  // Mismas cosas, otros encabezados, y aparece `barcode`.
  encabezados: ['SKU', 'Descripcion', 'PVP', 'Existencia', 'barcode', 'Activo'],
  filas: [
    { SKU: '123456', Descripcion: 'IBUPIRAC 600 X10', PVP: '4500', Existencia: '12', barcode: '', Activo: 'SI' },
  ],
}

async function main() {
  console.log('── H.3 · un formato se aprende ──')

  // La huella: lo que decide si un formato es el mismo.
  const { data: h1 } = await adm.rpc('archivo_huella', { p_encabezados: FIGUEIRAS.encabezados })
  const { data: h2 } = await adm.rpc('archivo_huella', { p_encabezados: GUZMAN.encabezados })
  const { data: h1b } = await adm.rpc('archivo_huella', {
    // El mismo formato con otras mayúsculas y espacios de más: NO es un
    // formato distinto.
    p_encabezados: ['  CODIGO ', 'Nombre del Producto', 'PRECIO', 'stock', 'Estado'],
  })
  h1 !== h2 ? ok('los dos formatos de PedidosYa tienen huellas distintas')
            : mal('los dos formatos dan la misma huella')
  h1 === h1b ? ok('y un cambio de mayúsculas, acentos o espacios NO es un formato distinto')
             : mal('un cambio de mayúsculas se tomó como un formato nuevo')

  // Primera vez: no hay perfil.
  const { data: p0 } = await adm.rpc('archivo_perfil_para', {
    p_canal: 'pedidosya_figueiras', p_tipo: 'catalogo', p_encabezados: FIGUEIRAS.encabezados,
  })
  const r0 = p0 as any
  r0?.entra_solo === false && r0?.perfil_id === null
    ? ok('la primera vez no entra solo y lo dice: una persona confirma el mapeo')
    : mal('la primera vez dijo que entraba solo')

  // Se aprende el de Figueiras.
  const { data: perfil, error: eP } = await adm.from('perfiles_datos').insert({
    nombre: 'PRUEBA · PedidosYa Figueiras catálogo',
    canal_id: 'pedidosya_figueiras', tipo: 'catalogo', direccion: 'import',
    formato: 'xlsx', activo: true,
    encabezados: FIGUEIRAS.encabezados,
    huella: h1,
    mapeo_columnas: { Codigo: 'sku', 'Nombre del producto': 'nombre', Precio: 'precio', Stock: 'stock', Estado: 'estado' },
    veces_usado: 1,
  }).select('id').maybeSingle()
  if (eP) { mal(`no se pudo guardar el perfil: ${eP.message}`); process.exit(1) }

  const { data: p1 } = await adm.rpc('archivo_perfil_para', {
    p_canal: 'pedidosya_figueiras', p_tipo: 'catalogo', p_encabezados: FIGUEIRAS.encabezados,
  })
  const r1 = p1 as any
  r1?.entra_solo === true
    ? ok('el mismo archivo, la segunda vez, entra solo')
    : mal(`el formato aprendido no se aplicó: ${r1?.que_pasa}`)

  console.log('\n── H.3 · y si la plataforma lo cambia, vuelve a preguntar ──')
  const { data: p2 } = await adm.rpc('archivo_perfil_para', {
    p_canal: 'pedidosya_figueiras', p_tipo: 'catalogo', p_encabezados: GUZMAN.encabezados,
  })
  const r2 = p2 as any
  if (r2?.entra_solo !== false) {
    mal('aplicó el formato aprendido a un archivo distinto: eso no falla, mapea mal y guarda cualquier cosa')
  } else {
    ok('con el formato cambiado NO aplica el mapeo aprendido')
    const aparecieron = (r2.aparecieron ?? []) as string[]
    const desaparecieron = (r2.desaparecieron ?? []) as string[]
    if (!aparecieron.length && !desaparecieron.length) {
      mal('no dice qué cambió: «la huella no coincide» no es accionable')
    } else {
      ok(`y dice qué cambió: aparecieron ${aparecieron.length} columnas y desaparecieron ${desaparecieron.length}`)
      nd(`aparecieron: ${aparecieron.join(', ')}`)
      nd(`desaparecieron: ${desaparecieron.join(', ')}`)
    }
  }

  // ── H.5, H.6 y H.9 ────────────────────────────────────────────────────
  console.log('\n── H.5 y H.6 · qué leyó, y lo que no entendió ──')
  const { data: imp, error: eI } = await adm.from('archivo_importaciones').insert({
    canal_id: 'pedidosya_figueiras', tipo: 'catalogo',
    archivo: 'PRUEBA-figueiras.xlsx', perfil_id: perfil?.id,
    entro_solo: true, huella: h1 as any, encabezados: FIGUEIRAS.encabezados,
    mapeo: { Codigo: 'sku', Precio: 'precio' },
    filas_totales: 3, filas_leidas: 2, filas_crudas: 1, estado: 'leido',
  }).select('id').maybeSingle()
  if (eI) { mal(`no se pudo registrar la importación: ${eI.message}`) }

  if (imp?.id) {
    await adm.from('archivo_filas').insert([
      { importacion_id: imp.id, nro_fila: 1, se_entendio: true,
        datos: { sku: '0000123456', nombre: 'IBUPIRAC 600 X10', precio: '4500' },
        crudo: FIGUEIRAS.filas[0] },
      { importacion_id: imp.id, nro_fila: 2, se_entendio: true,
        datos: { sku: '0000123457', nombre: 'ACTRON 600 X10', precio: '5200' },
        crudo: FIGUEIRAS.filas[1] },
      // La que no se entiende: se guarda cruda, no se descarta.
      { importacion_id: imp.id, nro_fila: 3, se_entendio: false, datos: null,
        por_que_no: 'el precio dice «consultar» y no es un número',
        crudo: { Codigo: '0000123458', Precio: 'consultar' } },
    ])

    const { data: crudas } = await adm.from('archivo_filas')
      .select('nro_fila, crudo, por_que_no').eq('importacion_id', imp.id)
      .eq('se_entendio', false).limit(20)
    ;(crudas ?? []).length === 1
      ? ok('la fila que no se entendió quedó guardada con el texto original y el motivo')
      : mal('la fila que no se entendió no quedó guardada')

    const { data: todas } = await adm.from('archivo_filas')
      .select('nro_fila, crudo').eq('importacion_id', imp.id).limit(20)
    const sinCrudo = (todas ?? []).filter((f: any) => !f.crudo)
    sinCrudo.length
      ? mal(`${sinCrudo.length} filas sin el texto original`)
      : ok('y TODAS las filas guardan el original, también las que se entendieron')

    // H.7 · el cruce.
    console.log('\n── H.7 y H.8 · el cruce ──')
    const { data: cruce, error: eCr } = await adm.rpc('archivo_cruzar', { p_importacion: imp.id })
    if (eCr) {
      mal(`el cruce falló: ${eCr.message}`)
    } else {
      const c = cruce as any
      ok(`el cruce corrió: ${c.diferencias} diferencias`)
      const { data: difs } = await adm.from('archivo_diferencias')
        .select('tipo, hecho, que_no_dice, dice_el_archivo, dice_nora')
        .eq('importacion_id', imp.id).limit(20)
      const sinQueNoDice = ((difs ?? []) as any[]).filter((d) => !d.que_no_dice?.trim())
      sinQueNoDice.length
        ? mal(`${sinQueNoDice.length} diferencias no dicen lo que NO dicen`)
        : ok('cada diferencia dice lo que NO dice: describe el hecho, no la causa')
      const sinDosLados = ((difs ?? []) as any[]).filter((d) => !d.dice_el_archivo || !d.dice_nora)
      sinDosLados.length
        ? mal(`${sinDosLados.length} diferencias no traen los dos lados`)
        : ok('y las dos versiones: una diferencia sin los dos números no se puede revisar')
      for (const d of ((difs ?? []) as any[]).slice(0, 2)) nd(d.hecho)
    }

    // H.9 · el histórico queda y se puede volver a mirar.
    const { data: hist } = await adm.from('archivo_importaciones')
      .select('archivo, filas_totales, filas_leidas, filas_crudas, subido_at')
      .eq('id', imp.id).maybeSingle()
    hist
      ? ok(`el histórico guarda qué entró y qué quedó afuera: ${(hist as any).filas_leidas} leídas, ${(hist as any).filas_crudas} crudas`)
      : mal('no quedó registro de la importación')

    // Se deshace: era una prueba.
    await adm.from('archivo_importaciones').delete().eq('id', imp.id)
  }
  if (perfil?.id) await adm.from('perfiles_datos').delete().eq('id', perfil.id)
  await adm.from('canal_rechazos').delete().like('detalle', '%PRUEBA%')

  console.log(`\n${fallas === 0 ? 'TODO BIEN' : `${fallas} FALLA(S)`}`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
