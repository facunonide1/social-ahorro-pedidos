/**
 * Detección automática de columnas (NORA): al subir un archivo, propone el mapeo
 * columna→campo del sistema usando (1) sinónimos en español, (2) análisis del
 * contenido de una muestra, (3) el LLM como refuerzo para los casos dudosos.
 * Pensado para archivos con muchas columnas (50+); ignora las que no mapean.
 */
import { CAMPOS_SISTEMA, type CampoSistema, type TipoPerfilDatos } from '@/lib/types/centro-datos'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL } from '@/lib/ai/config'

export type Confianza = 'alta' | 'media' | 'baja'
export type CampoPropuesto = {
  campo: CampoSistema
  label: string
  header: string | null
  score: number
  confianza: Confianza
  razon: string
}
export type PropuestaMapeo = {
  campos: CampoPropuesto[]
  /** header → campo, listo para mapearFilas */
  mapeo: Record<string, CampoSistema>
  sin_usar: string[]
  falta_sku: boolean
}

// ---------- sinónimos ES por campo ----------
const SINONIMOS: Partial<Record<CampoSistema, string[]>> = {
  sku: ['sku', 'codigo', 'cod', 'cod prod', 'cod producto', 'codprod', 'codigo interno', 'cod interno', 'articulo', 'art', 'plu', 'id producto', 'codigo articulo', 'cod art', 'interno'],
  codigo_barras: ['barras', 'codigo barras', 'cod barra', 'cod barras', 'ean', 'ean13', 'gtin', 'codbar', 'barcode', 'codigo de barras'],
  nombre: ['descripcion', 'descrip', 'detalle', 'nombre', 'producto', 'denominacion', 'desc', 'articulo nombre', 'nombre producto'],
  precio: ['precio', 'pventa', 'pvp', 'pvta', 'p venta', 'precio venta', 'precio lista', 'lista', 'plista', 'pubvta', 'precio publico', 'pventa', 'precio unitario'],
  precio_oferta: ['precio oferta', 'p oferta', 'precio desc', 'precio promo', 'preciooferta', 'oferta precio', 'pofer', 'precio con descuento', 'precio especial', 'precio promo'],
  stock: ['stock', 'existencia', 'exist', 'saldo', 'deposito', 'gondola', 'disponible', 'disp', 'cantidad stock', 'existencias', 'inventario'],
  rubro: ['rubro', 'categoria', 'familia', 'seccion', 'grupo', 'linea'],
  laboratorio: ['laboratorio', 'lab', 'marca', 'fabricante', 'nom lab'],
  droga: ['droga', 'principio', 'principio activo', 'monodroga', 'droga principal'],
  estado: ['estado', 'activo', 'status', 'habilitado'],
  tipo: ['tipo', 'tipo producto'],
  venta_mes: ['mes act', 'venta mes', 'mesactual', 'vta mes', 'ventames', 'mes actual'],
  ant_1: ['ant 1', 'ant1', 'mes 1'], ant_2: ['ant 2', 'ant2', 'mes 2'], ant_3: ['ant 3', 'ant3', 'mes 3'],
  ant_4: ['ant 4', 'ant4', 'mes 4'], ant_5: ['ant 5', 'ant5', 'mes 5'], ant_6: ['ant 6', 'ant6', 'mes 6'],
  descuento: ['descu', 'descuento', 'dto', 'desc pct', 'descuento pct', 'porc desc'],
  recargo: ['recar', 'recargo', 'recargo pct'],
  oferta_tipo: ['tipo oferta', 'tipo promo', 'tipopromo', 'oferta tipo', 'clase promo'],
  oferta_vigencia: ['vigencia', 'vence', 'fecha fin', 'valido hasta', 'hasta', 'fin oferta', 'vencimiento oferta'],
  nom_promo: ['nom promo', 'nombre promo', 'promo nombre', 'promocion', 'nombre oferta', 'oferta'],
  def_promo: ['def promo', 'detalle promo', 'descripcion promo', 'definicion promo'],
  cantidad: ['cantidad', 'cant', 'unidades', 'qty', 'cantidad vendida', 'uni'],
  monto: ['monto', 'importe', 'total', 'subtotal', 'monto vendido', 'venta total', 'importe vendido'],
  cliente_nombre: ['nombre', 'cliente', 'razon social', 'apellido y nombre', 'nombre cliente', 'apellido'],
  cliente_doc: ['dni', 'cuit', 'documento', 'doc', 'cuil', 'nro doc', 'cuit dni'],
  cliente_tel: ['tel', 'telefono', 'celular', 'cel', 'movil', 'contacto', 'whatsapp'],
  cliente_email: ['email', 'mail', 'correo', 'e mail', 'correo electronico'],
}

// confiabilidad del análisis de contenido por campo (0-1): ean/email/doc son fuertes.
const PESO_CONTENIDO: Partial<Record<CampoSistema, number>> = {
  codigo_barras: 0.95, cliente_email: 0.97, cliente_doc: 0.8, nombre: 0.7, cliente_nombre: 0.65,
  precio: 0.55, precio_oferta: 0.45, monto: 0.5, stock: 0.45, cantidad: 0.45, sku: 0.6, cliente_tel: 0.7,
}

const PRIORIDAD: CampoSistema[] = [
  'cliente_email', 'codigo_barras', 'sku', 'cliente_doc', 'cliente_tel', 'cliente_nombre',
  'nombre', 'precio', 'precio_oferta', 'descuento', 'oferta_vigencia', 'oferta_tipo', 'nom_promo', 'def_promo',
  'stock', 'cantidad', 'monto', 'rubro', 'laboratorio', 'droga', 'estado', 'tipo', 'recargo',
  'venta_mes', 'ant_1', 'ant_2', 'ant_3', 'ant_4', 'ant_5', 'ant_6',
]

function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}
const sinEsp = (s: string) => norm(s).replace(/ /g, '')

function scoreNombre(header: string, syns: string[]): number {
  const h = norm(header), hns = sinEsp(header)
  const tokens = h.split(' ').filter(Boolean)
  let best = 0
  for (const raw of syns) {
    const s = norm(raw), sns = sinEsp(raw)
    if (!sns) continue
    if (hns === sns) { best = Math.max(best, 1); continue }
    if (tokens.includes(s)) { best = Math.max(best, 0.92); continue }
    if (sns.length >= 3 && hns.includes(sns)) { best = Math.max(best, 0.82); continue }
    if (hns.length >= 3 && sns.includes(hns)) { best = Math.max(best, 0.72); continue }
    // overlap de tokens
    const st = s.split(' ').filter(Boolean)
    const inter = st.filter((x) => tokens.includes(x)).length
    if (inter) best = Math.max(best, 0.5 * (inter / Math.max(st.length, tokens.length)))
  }
  return best
}

// ---------- análisis de contenido ----------
function muestraCol(muestra: string[][], idx: number): string[] {
  return muestra.map((r) => (r[idx] ?? '').toString().trim()).filter((v) => v !== '')
}
const fracDigitos = (vals: string[], lo: number, hi: number) =>
  vals.length ? vals.filter((v) => /^\d+$/.test(v.replace(/\s/g, '')) && v.replace(/\s/g, '').length >= lo && v.replace(/\s/g, '').length <= hi).length / vals.length : 0
function numerico(v: string): number | null {
  const s = v.replace(/[$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s); return Number.isFinite(n) ? n : null
}

function scoreContenido(campo: CampoSistema, vals: string[]): number {
  if (!vals.length) return 0
  const nums = vals.map(numerico).filter((n): n is number => n != null)
  const fracNum = nums.length / vals.length
  const distintos = new Set(vals).size / vals.length
  const avgLen = vals.reduce((a, v) => a + v.length, 0) / vals.length
  switch (campo) {
    case 'codigo_barras': return fracDigitos(vals, 12, 14)
    case 'cliente_email': return vals.filter((v) => v.includes('@')).length / vals.length
    case 'cliente_doc': return Math.max(fracDigitos(vals, 7, 11) - 0.05, 0)
    case 'cliente_tel': return fracDigitos(vals, 8, 13)
    case 'sku': {
      const cortoAlnum = vals.filter((v) => v.length <= 14 && /^[a-z0-9._-]+$/i.test(v)).length / vals.length
      const noEan = fracDigitos(vals, 12, 14) < 0.4
      return cortoAlnum > 0.7 && distintos > 0.8 && noEan ? 0.6 : 0
    }
    case 'nombre': case 'cliente_nombre':
      return avgLen > 8 && fracNum < 0.3 ? Math.min(0.85, avgLen / 25) : 0
    case 'precio': case 'precio_oferta': case 'monto': {
      if (fracNum < 0.7) return 0
      const conDecimalesOAlto = nums.filter((n) => n % 1 !== 0 || n > 50).length / nums.length
      return conDecimalesOAlto > 0.5 ? 0.7 : 0.3
    }
    case 'stock': case 'cantidad': {
      if (fracNum < 0.7) return 0
      const entChico = nums.filter((n) => Number.isInteger(n) && n >= 0 && n < 100000).length / nums.length
      return entChico > 0.8 ? 0.5 : 0
    }
    case 'descuento': case 'recargo': {
      if (fracNum < 0.6) return 0
      return nums.filter((n) => n >= 0 && n <= 100).length / nums.length > 0.8 ? 0.45 : 0
    }
    default: return 0
  }
}

function nivel(score: number): Confianza {
  if (score >= 0.78) return 'alta'
  if (score >= 0.52) return 'media'
  return 'baja'
}

/**
 * Detección heurística (sin LLM). `base` = mapeo ya conocido (perfil guardado)
 * que se respeta para los headers presentes en el archivo.
 */
export function detectarMapeoHeuristico(
  headers: string[], muestra: string[][], tipo: TipoPerfilDatos, base?: Record<string, string>,
): PropuestaMapeo {
  const campos = CAMPOS_SISTEMA.filter((c) => c.tipos.includes(tipo) && c.value !== 'ignorar').map((c) => c.value)
  const labelDe = (c: CampoSistema) => CAMPOS_SISTEMA.find((x) => x.value === c)?.label ?? c
  const headerUsado = new Set<string>()
  const asign = new Map<CampoSistema, CampoPropuesto>()

  // 1) respetar el perfil guardado (alta confianza)
  if (base) {
    for (const [h, campo] of Object.entries(base)) {
      if (campo === 'ignorar' || !campos.includes(campo as CampoSistema)) continue
      const real = headers.find((x) => x === h || norm(x) === norm(h))
      if (real && !headerUsado.has(real) && !asign.has(campo as CampoSistema)) {
        headerUsado.add(real)
        asign.set(campo as CampoSistema, { campo: campo as CampoSistema, label: labelDe(campo as CampoSistema), header: real, score: 1, confianza: 'alta', razon: 'perfil guardado' })
      }
    }
  }

  // 2) matriz de scores (campo × header) para los que falten
  type Par = { campo: CampoSistema; header: string; score: number; porContenido: boolean }
  const pares: Par[] = []
  for (const campo of campos) {
    if (asign.has(campo)) continue
    const syns = SINONIMOS[campo] ?? [norm(campo)]
    const pesoC = PESO_CONTENIDO[campo] ?? 0.4
    headers.forEach((h, idx) => {
      const sN = scoreNombre(h, syns)
      const sC = scoreContenido(campo, muestraCol(muestra, idx)) * pesoC
      let score = sN
      let porContenido = false
      if (sC > 0) {
        if (sN >= 0.5) score = Math.min(1, sN + 0.18 * (sC / pesoC))
        else if (sC * 1.1 > sN) { score = sC * 1.05; porContenido = true }
      }
      if (score >= 0.4) pares.push({ campo, header: h, score, porContenido })
    })
  }
  // 3) asignación greedy global (mejor par primero)
  pares.sort((a, b) => b.score - a.score)
  for (const p of pares) {
    if (asign.has(p.campo) || headerUsado.has(p.header)) continue
    headerUsado.add(p.header)
    asign.set(p.campo, {
      campo: p.campo, label: labelDe(p.campo), header: p.header, score: Math.round(p.score * 100) / 100,
      confianza: nivel(p.score), razon: p.porContenido ? 'por el contenido' : 'por el nombre',
    })
  }

  // 4) armar resultado en orden de prioridad
  const ordenados = campos.slice().sort((a, b) => (PRIORIDAD.indexOf(a) + 1 || 99) - (PRIORIDAD.indexOf(b) + 1 || 99))
  const camposProp: CampoPropuesto[] = ordenados.map((c) =>
    asign.get(c) ?? { campo: c, label: labelDe(c), header: null, score: 0, confianza: 'baja', razon: '' })
  const mapeo: Record<string, CampoSistema> = {}
  for (const c of camposProp) if (c.header) mapeo[c.header] = c.campo
  const sinUsar = headers.filter((h) => !headerUsado.has(h))
  const necesitaSku = tipo === 'productos' || tipo === 'stock' || tipo === 'ventas' || tipo === 'dif_stock'
  const skuProp = asign.get('sku')
  const faltaSku = necesitaSku && (!skuProp || skuProp.score < 0.6)
  return { campos: camposProp, mapeo, sin_usar: sinUsar, falta_sku: faltaSku }
}

// ---------- refuerzo con LLM (1 sola llamada, con fallback) ----------
const CORE: Record<TipoPerfilDatos, CampoSistema[]> = {
  productos: ['sku', 'nombre', 'precio'], stock: ['sku', 'stock'], dif_stock: ['sku', 'stock'],
  ventas: ['sku', 'cantidad', 'monto'], clientes: ['cliente_nombre', 'cliente_doc'],
  ofertas: ['sku', 'precio'], custom: [],
}

async function mapeoLLM(headers: string[], muestra: string[][], tipo: TipoPerfilDatos, faltantes: CampoSistema[]): Promise<Record<string, string>> {
  const labelDe = (c: CampoSistema) => CAMPOS_SISTEMA.find((x) => x.value === c)?.label ?? c
  const cols = headers.map((h, i) => `- "${h}": ${muestraCol(muestra, i).slice(0, 4).join(' | ') || '(vacío)'}`).join('\n')
  const objetivos = faltantes.map((c) => `- ${c}: ${labelDe(c)}`).join('\n')
  const prompt = `Sos NORA, asistente de Social Ahorro Farmacias. Mapeá columnas de un archivo (estilo SIFACO) a campos del sistema.

CAMPOS A IDENTIFICAR (clave: descripción):
${objetivos}

COLUMNAS DEL ARCHIVO (nombre: muestra de valores):
${cols}

Devolvé SOLO un objeto JSON {"<clave_campo>": "<nombre EXACTO de la columna>"} para los campos que reconozcas con confianza. Usá el nombre de columna tal cual aparece. Si no hay columna clara para un campo, omitilo. No inventes columnas ni claves.`
  const anthropic = getAnthropic()
  const res = await anthropic.messages.create({ model: CHAT_MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
  const txt = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('')
  const m = txt.match(/\{[\s\S]*\}/)
  if (!m) return {}
  const obj = JSON.parse(m[0]) as Record<string, string>
  const out: Record<string, string> = {}
  for (const [campo, header] of Object.entries(obj)) {
    if (faltantes.includes(campo as CampoSistema) && typeof header === 'string' && headers.includes(header)) out[campo] = header
  }
  return out
}

/**
 * Detección completa: heurística + (si hace falta y hay API key) refuerzo del LLM
 * para los campos core que quedaron sin asignar o con baja confianza.
 */
export async function detectarMapeo(
  headers: string[], muestra: string[][], tipo: TipoPerfilDatos,
  opts?: { base?: Record<string, string>; usarLLM?: boolean },
): Promise<PropuestaMapeo & { uso_llm: boolean }> {
  const heur = detectarMapeoHeuristico(headers, muestra, tipo, opts?.base)
  const core = CORE[tipo] ?? []
  const faltantes = heur.campos.filter((c) => core.includes(c.campo) && (!c.header || c.score < 0.6)).map((c) => c.campo)
  if (opts?.usarLLM === false || !hasAnthropicKey() || (!heur.falta_sku && faltantes.length === 0)) {
    return { ...heur, uso_llm: false }
  }
  try {
    const sug = await mapeoLLM(headers, muestra, tipo, faltantes.length ? faltantes : core)
    if (!Object.keys(sug).length) return { ...heur, uso_llm: false }
    const usados = new Set(heur.campos.filter((c) => c.header).map((c) => c.header as string))
    const campos = heur.campos.map((c) => {
      if (c.header && c.score >= 0.6) return c
      const h = sug[c.campo]
      if (h && !usados.has(h)) { usados.add(h); return { ...c, header: h, score: 0.66, confianza: 'media' as Confianza, razon: 'NORA (IA)' } }
      return c
    })
    const mapeo: Record<string, CampoSistema> = {}
    for (const c of campos) if (c.header) mapeo[c.header] = c.campo
    const sin_usar = headers.filter((h) => !usados.has(h))
    const skuC = campos.find((c) => c.campo === 'sku')
    const necesitaSku = ['productos', 'stock', 'ventas', 'dif_stock'].includes(tipo)
    return { campos, mapeo, sin_usar, falta_sku: necesitaSku && (!skuC?.header || skuC.score < 0.6), uso_llm: true }
  } catch {
    return { ...heur, uso_llm: false }
  }
}
