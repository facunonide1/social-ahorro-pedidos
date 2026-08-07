import {
  DOC_MAX_CANDIDATOS,
  DOC_UMBRAL_AUTO,
  DOC_UMBRAL_SUGERENCIA,
  DOC_USOS_MIN_AUTO,
  TENANT_ACTUAL,
} from '@/lib/documentos/config'

type Adm = any

export type Candidato = {
  itemId: string
  sku: string
  nombre: string
  score: number
  /** De dónde salió: sirve para explicarle a la persona por qué se lo ofrecemos. */
  via: 'codigo' | 'alias_exacto' | 'alias_similar' | 'catalogo_similar'
}

export type MatchLinea = {
  nroLinea: number
  descripcionLeida: string
  descripcionNorm: string | null
  codigoTercero: string | null
  /** Se aplica solo; el resto va a revisión. */
  itemId: string | null
  matchEstado: 'automatico' | 'sugerido' | 'sin_match'
  confianza: number | null
  candidatos: Candidato[]
}

/**
 * Matchea las líneas de un documento contra el catálogo propio.
 *
 * Cinco niveles, del más confiable al menos. Los dos primeros son identidad
 * (este proveedor ya nos dijo antes que su código X es nuestro SKU Y); los dos
 * siguientes son parecido, y van a revisión.
 *
 * La normalización SIEMPRE sale de doc_normalizar_texto por RPC. Reimplementarla
 * acá es el bug que ya apareció una vez en el importador de listas: la clave
 * guardada y la clave buscada dejan de coincidir y el matching falla en
 * silencio, sin error.
 */
export async function matchearLineas(
  adm: Adm,
  lineas: Array<{ nro_linea?: number; codigo?: string | null; descripcion?: string | null }>,
  terceroId: string | null,
): Promise<MatchLinea[]> {
  if (!lineas.length) return []

  const descripciones = lineas.map((l) => l.descripcion ?? '')
  const { data: normalizadas } = await adm.rpc('doc_normalizar_lote', { txts: descripciones })
  const norms: (string | null)[] = Array.isArray(normalizadas) ? normalizadas : descripciones.map(() => null)

  // Alias de este proveedor, en memoria: una factura tiene decenas de líneas y
  // no vale la pena una consulta por cada una.
  const aliasPorCodigo = new Map<string, { itemId: string; usos: number }>()
  const aliasPorNorm = new Map<string, { itemId: string; usos: number }>()
  if (terceroId) {
    const { data: alias } = await adm
      .from('doc_items_alias')
      .select('codigo_tercero, descripcion_norm, item_id, veces_usado')
      .eq('tenant_id', TENANT_ACTUAL)
      .eq('tercero_id', terceroId)
      .eq('activo', true)
      .limit(20000)

    for (const a of (alias ?? []) as any[]) {
      const entrada = { itemId: a.item_id, usos: a.veces_usado ?? 1 }
      if (a.codigo_tercero) aliasPorCodigo.set(String(a.codigo_tercero).trim().toLowerCase(), entrada)
      if (a.descripcion_norm) aliasPorNorm.set(a.descripcion_norm, entrada)
    }
  }

  const catalogo = await cargarCatalogo(adm)

  const out: MatchLinea[] = []
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const norm = norms[i] ?? null
    const codigo = l.codigo ? String(l.codigo).trim() : null
    const base = {
      nroLinea: l.nro_linea ?? i + 1,
      descripcionLeida: l.descripcion ?? '',
      descripcionNorm: norm,
      codigoTercero: codigo,
    }

    // 1 · Código exacto del proveedor. Es identidad, no parecido: confianza 1.
    const porCodigo = codigo ? aliasPorCodigo.get(codigo.toLowerCase()) : undefined
    if (porCodigo) {
      out.push({ ...base, itemId: porCodigo.itemId, matchEstado: 'automatico', confianza: 1, candidatos: [] })
      continue
    }

    // 2 · Descripción normalizada exacta, del mismo proveedor.
    const porNorm = norm ? aliasPorNorm.get(norm) : undefined
    if (porNorm) {
      const auto = porNorm.usos >= DOC_USOS_MIN_AUTO
      out.push({
        ...base,
        itemId: porNorm.itemId,
        matchEstado: auto ? 'automatico' : 'sugerido',
        confianza: 0.95,
        candidatos: auto ? [] : await candidatoUnico(adm, catalogo, porNorm.itemId, 0.95, 'alias_exacto'),
      })
      continue
    }

    // 3 · Similitud contra los alias del mismo proveedor (trigram, por RPC).
    const candidatos: Candidato[] = []
    let autoPorSimilitud: { itemId: string; score: number } | null = null
    if (norm && terceroId) {
      const { data: sim } = await adm.rpc('doc_buscar_alias', {
        p_texto: l.descripcion ?? '',
        p_tercero_id: terceroId,
        p_limite: DOC_MAX_CANDIDATOS,
        p_min_sim: DOC_UMBRAL_SUGERENCIA,
      })
      for (const s of (sim ?? []) as any[]) {
        const prod = catalogo.porId.get(s.item_id)
        if (!prod) continue
        const score = Number(s.similitud)
        candidatos.push({ itemId: s.item_id, sku: prod.sku, nombre: prod.nombre, score, via: 'alias_similar' })

        // Se aplica solo únicamente si además es un alias ya rodado: parecido
        // alto sobre un alias nuevo sigue yendo a revisión.
        const usos = aliasPorNorm.get(s.descripcion_norm)?.usos ?? 0
        if (!autoPorSimilitud && score >= DOC_UMBRAL_AUTO && usos >= DOC_USOS_MIN_AUTO) {
          autoPorSimilitud = { itemId: s.item_id, score }
        }
      }
    }

    if (autoPorSimilitud) {
      out.push({ ...base, itemId: autoPorSimilitud.itemId, matchEstado: 'automatico', confianza: autoPorSimilitud.score, candidatos: [] })
      continue
    }

    // 4 · Similitud contra el catálogo propio. Score más bajo a propósito: el
    //     catálogo no sabe cómo escribe este proveedor.
    if (norm && candidatos.length < DOC_MAX_CANDIDATOS) {
      for (const c of similitudCatalogo(catalogo, norm, DOC_MAX_CANDIDATOS)) {
        if (candidatos.some((x) => x.itemId === c.itemId)) continue
        candidatos.push(c)
      }
    }

    candidatos.sort((a, b) => b.score - a.score)
    const top = candidatos.slice(0, DOC_MAX_CANDIDATOS)

    // 5 · Sin candidatos.
    if (!top.length) {
      out.push({ ...base, itemId: null, matchEstado: 'sin_match', confianza: null, candidatos: [] })
      continue
    }

    out.push({ ...base, itemId: null, matchEstado: 'sugerido', confianza: top[0].score, candidatos: top })
  }

  return out
}

type Catalogo = {
  porId: Map<string, { sku: string; nombre: string; norm: string }>
  lista: Array<{ itemId: string; sku: string; nombre: string; norm: string }>
}

/** El catálogo entero normalizado por la MISMA función que los alias. */
async function cargarCatalogo(adm: Adm): Promise<Catalogo> {
  const { data } = await adm
    .from('productos_catalogo')
    .select('id, sku, nombre')
    .eq('activo', true)
    .limit(20000)

  const filas = (data ?? []) as any[]
  const { data: norms } = await adm.rpc('doc_normalizar_lote', { txts: filas.map((p) => p.nombre ?? '') })
  const arr: string[] = Array.isArray(norms) ? norms : filas.map(() => '')

  const porId = new Map<string, { sku: string; nombre: string; norm: string }>()
  const lista: Catalogo['lista'] = []
  filas.forEach((p, i) => {
    const norm = arr[i] ?? ''
    porId.set(p.id, { sku: p.sku, nombre: p.nombre, norm })
    lista.push({ itemId: p.id, sku: p.sku, nombre: p.nombre, norm })
  })
  return { porId, lista }
}

/**
 * Similitud por trigramas, calculada en el cliente contra el catálogo ya
 * cargado. Es el mismo criterio que usa pg_trgm (coeficiente de Jaccard sobre
 * trigramas), aplicado a texto que ya normalizó la base.
 */
function similitudCatalogo(cat: Catalogo, norm: string, limite: number): Candidato[] {
  const a = trigramas(norm)
  if (!a.size) return []
  const out: Candidato[] = []
  for (const p of cat.lista) {
    if (!p.norm) continue
    const s = jaccard(a, trigramas(p.norm))
    if (s >= DOC_UMBRAL_SUGERENCIA) {
      out.push({ itemId: p.itemId, sku: p.sku, nombre: p.nombre, score: +s.toFixed(3), via: 'catalogo_similar' })
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limite)
}

function trigramas(s: string): Set<string> {
  const t = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3))
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

async function candidatoUnico(
  _adm: Adm,
  cat: Catalogo,
  itemId: string,
  score: number,
  via: Candidato['via'],
): Promise<Candidato[]> {
  const p = cat.porId.get(itemId)
  return p ? [{ itemId, sku: p.sku, nombre: p.nombre, score, via }] : []
}

/**
 * Aprende de un match confirmado por una persona. ESTO es lo que hace que el
 * motor mejore: la próxima factura de este proveedor ya reconoce el renglón.
 */
export async function aprenderAliasItem(
  adm: Adm,
  datos: {
    terceroId: string | null
    identFiscal: string | null
    codigoTercero: string | null
    descripcionTercero: string
    itemId: string
    userId: string | null
  },
): Promise<void> {
  const desc = (datos.descripcionTercero ?? '').trim()
  if (!desc || !datos.itemId) return

  // descripcion_norm lo llena el trigger con doc_normalizar_texto: no se manda.
  const buscar = adm
    .from('doc_items_alias')
    .select('id, veces_usado')
    .eq('tenant_id', TENANT_ACTUAL)
    .eq('descripcion_tercero', desc)
    .eq('item_id', datos.itemId)

  const { data: ya } = datos.terceroId
    ? await buscar.eq('tercero_id', datos.terceroId).maybeSingle()
    : await buscar.is('tercero_id', null).maybeSingle()

  if (ya) {
    await adm
      .from('doc_items_alias')
      .update({
        veces_usado: (ya.veces_usado ?? 1) + 1,
        ultima_vez: new Date().toISOString(),
        codigo_tercero: datos.codigoTercero ?? undefined,
        activo: true,
      })
      .eq('id', ya.id)
    return
  }

  await adm.from('doc_items_alias').insert({
    tercero_id: datos.terceroId,
    ident_fiscal: datos.identFiscal,
    codigo_tercero: datos.codigoTercero,
    descripcion_tercero: desc,
    descripcion_norm: desc, // el trigger lo pisa con la normalización real
    item_id: datos.itemId,
    origen: 'manual',
    confianza: 1,
    veces_usado: 1,
    ultima_vez: new Date().toISOString(),
    activo: true,
    created_by: datos.userId,
  })
}

/** Para exponer el umbral efectivo en la UI sin duplicar los defaults. */
export const UMBRALES = {
  auto: DOC_UMBRAL_AUTO,
  usosMinimos: DOC_USOS_MIN_AUTO,
  sugerencia: DOC_UMBRAL_SUGERENCIA,
  maxCandidatos: DOC_MAX_CANDIDATOS,
}
