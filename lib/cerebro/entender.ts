/**
 * D · QUÉ ENTIENDE LA ENTIDAD.
 *
 * ── POR QUÉ UNA GRAMÁTICA Y NO UN MODELO ────────────────────────────────────
 *
 * Esto podría hacerlo un modelo de lenguaje, y entendería más frases. No se
 * hizo así por tres motivos que son del enunciado, no de gusto:
 *
 *   · «La voz no calcula». Un modelo que arma la respuesta puede poner un
 *     número que suena bien y no existe. Acá el entendimiento sólo devuelve
 *     QUÉ se pidió; los números los pone `responder.ts` leyendo la base.
 *   · «Lo que no entiende, lo dice. No adivina». Una gramática que no encaja
 *     devuelve `no_entendi`. Un modelo siempre devuelve algo plausible.
 *   · «Todo a la bitácora, con el texto original, para ver cuándo entendió
 *     mal». Con reglas, el error se puede reproducir y corregir.
 *
 * El costo es que entiende menos formas de decir lo mismo. El reporte de la
 * versión dice cuáles fallaron.
 *
 * ── EL ORDEN IMPORTA ────────────────────────────────────────────────────────
 *
 * Lo prohibido se mira PRIMERO. «Pagale a Del Sud» no puede caer en
 * «preparar un pago» por una regla más general: tiene que decir que no.
 */

export type Cosa = 'llevame' | 'contame' | 'hace' | 'cambia' | 'verificar' | 'prohibido' | 'control' | 'no_entendi'

export type Intencion =
  | { cosa: 'prohibido'; accion: 'cambiar_precio_venta' | 'pagar_sin_firma' | 'firmar_por_voz' | 'publicar_en_canal' | 'tocar_personal'; que: string }
  | { cosa: 'llevame'; destino: string; href: string }
  | { cosa: 'contame'; sobre: 'general' | 'espera' | 'apagados' | 'sucursal' | 'agente' | 'equipo'; id?: string }
  | { cosa: 'verificar'; que: 'caja' | 'tarea'; quien?: string; quienDicho?: string; sucursal?: string; tema?: string }
  | { cosa: 'hace'; que: 'tarea'; quien: string | null; tarea: string; cuando: 'hoy' | 'manana' }
  | { cosa: 'hace'; que: 'pedido'; cantidad: number; producto: string }
  | { cosa: 'hace'; que: 'transferencia'; desde: string | null; hacia: string | null }
  | { cosa: 'hace'; que: 'pago' }
  | { cosa: 'cambia'; clave: string; valor: number; dicho: string }
  | { cosa: 'cambia'; deshacer: true }
  | { cosa: 'control'; que: 'callate' | 'hablá' }
  | { cosa: 'no_entendi'; por_que: string }

export type Catalogo = {
  sucursales: { id: string; nombre: string; codigo: string }[]
  personas: { nombre: string; user_id: string | null; sucursal_id: string | null }[]
  agentes: { id: string; nombre: string }[]
}

/** Sin acentos, sin signos, en minúscula. «¿Cómo venimos?» → «como venimos». */
export function normalizar(t: string): string {
  return t.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NUMEROS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, doce: 12, quince: 15, veinte: 20, treinta: 30, medio: 0.5,
}
function numero(s: string | undefined): number | null {
  if (!s) return null
  const t = s.replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  return NUMEROS[t] ?? null
}

/** Las pantallas a las que se puede llevar. Todas existen: lo prueba `prueba-cerebro`. */
export const DESTINOS: { palabras: RegExp; destino: string; href: string }[] = [
  { palabras: /\b(bandeja|lo que espera|pendientes)\b/, destino: 'lo que espera', href: '/admin/direccion/bandeja' },
  { palabras: /\b(tablero|direccion)\b/, destino: 'el tablero', href: '/admin/direccion' },
  { palabras: /\bcompar\w* (las )?sucursales\b/, destino: 'comparar sucursales', href: '/admin/direccion/sucursales' },
  { palabras: /\b(plan de compra|compras|pedidos? a (la )?drogueria|ordenes de compra)\b/, destino: 'el plan de compra', href: '/admin/compras/plan' },
  { palabras: /\b(pagos|deuda|proveedores a pagar)\b/, destino: 'la deuda', href: '/admin/finanzas/deuda' },
  { palabras: /\b(caja|cajas|cierres?)\b/, destino: 'la caja', href: '/admin/finanzas/caja' },
  { palabras: /\btareas\b/, destino: 'las tareas', href: '/admin/tareas' },
  { palabras: /\b(canales|catalogo|pedidos ?ya|tienda)\b/, destino: 'los canales', href: '/admin/canales' },
  { palabras: /\b(transferencias|reparto)\b/, destino: 'las transferencias', href: '/admin/operaciones/transferencias' },
  { palabras: /\b(vencimientos)\b/, destino: 'los vencimientos', href: '/admin/operaciones/vencimientos' },
  { palabras: /\b(convenios|obras sociales|debitos)\b/, destino: 'los convenios', href: '/admin/convenios' },
  { palabras: /\b(ofertas)\b/, destino: 'las ofertas', href: '/admin/ofertas' },
  { palabras: /\b(hallazgos|deteccion)\b/, destino: 'los hallazgos', href: '/admin/deteccion' },
  { palabras: /\b(agentes|equipo de agentes)\b/, destino: 'la configuración de agentes', href: '/admin/configuracion/agentes' },
  { palabras: /\b(stock)\b/, destino: 'el stock', href: '/admin/operaciones/stock' },
  { palabras: /\b(recepciones|facturas)\b/, destino: 'las recepciones', href: '/admin/recepciones' },
]

/** Los parámetros que se pueden cambiar hablando. Los demás, en Configuración. */
export const PARAMETROS_POR_VOZ: { palabras: RegExp; clave: string; unidad: string }[] = [
  { palabras: /\b(cobertura|stock objetivo|pedime para|comprame para|pedi para|compra para)\b/, clave: 'cobertura_objetivo_meses', unidad: 'meses' },
  { palabras: /\bsobrestock\b/, clave: 'cobertura_sobrestock_meses', unidad: 'meses' },
  { palabras: /\b(maestro viejo|dias del maestro)\b/, clave: 'dias_maestro_viejo', unidad: 'dias' },
  { palabras: /\b(diferencia minima|diferencia de caja)\b/, clave: 'caja_diferencia_minima', unidad: '$' },
]

function buscar<T extends { nombre: string }>(t: string, lista: T[]): T | null {
  // El nombre más largo primero: «Guzmán» no debe ganarle a un nombre compuesto.
  const orden = [...lista].sort((a, b) => b.nombre.length - a.nombre.length)
  for (const x of orden) {
    const n = normalizar(x.nombre)
    if (!n) continue
    const primero = n.split(' ')[0]
    if (new RegExp(`\\b${n}\\b`).test(t) || (primero.length > 2 && new RegExp(`\\b${primero}\\b`).test(t))) return x
  }
  return null
}

export function entender(texto: string, cat: Catalogo): Intencion {
  const t = normalizar(texto)
  if (!t) return { cosa: 'no_entendi', por_que: 'no dijiste nada' }

  // ── control de la voz ──────────────────────────────────────────────────
  if (/^(callate|silencio|basta|para de hablar|sin voz)\b/.test(t)) return { cosa: 'control', que: 'callate' }
  if (/^(habla|hablame|con voz|activa la voz)\b/.test(t)) return { cosa: 'control', que: 'hablá' }

  // ── F.6 · lo que no puede hacer, PRIMERO ───────────────────────────────
  if (/\bprecio/.test(t) && /\b(cambi|sub|baj|pone|ponele|modific|actualiz|aument|rebaj)\w*/.test(t)) {
    return { cosa: 'prohibido', accion: 'cambiar_precio_venta', que: 'cambiar un precio' }
  }
  const pregunta = /^(cuanto|cuantos|que|cuando|cual|cuales|hay|como|quien)\b/.test(t)
  if (!pregunta && /\b(paga|pagale|pagales|pagalo|pagala|pagar|pague|abona|abonale|cancela la factura|transferile plata|depositale)\b/.test(t)
      && !/\b(prepara|arma|armame|preparame)\b/.test(t)) {
    return { cosa: 'prohibido', accion: 'pagar_sin_firma', que: 'pagar' }
  }
  if (/^firma\b|\b(firmalo|firmala|firmalas|firmalos|firmar|firmame|aproba|aprobalo|aprobala|aprobalas|emiti|emitila)\b/.test(t)) {
    return { cosa: 'prohibido', accion: 'firmar_por_voz', que: 'firmar' }
  }
  if (/\b(publica|publicalo|publicala|publicar|despublica|despublicalo|subilo a|subila a)\b/.test(t)) {
    return { cosa: 'prohibido', accion: 'publicar_en_canal', que: 'publicar en un canal' }
  }
  if (/\b(despedi|despedir|echa a|echalo|echala|contrata|contratar|dale de baja|subile el sueldo|bajale el sueldo|sueldo de|aumentale)\b/.test(t)) {
    return { cosa: 'prohibido', accion: 'tocar_personal', que: 'tocar algo del personal' }
  }

  const suc = buscar(t, cat.sucursales)
  const per = buscar(t, cat.personas)
  const ag = buscar(t, cat.agentes)

  // ── F.4 · cambiar un parámetro, o volverlo atrás ───────────────────────
  if (/\b(volve atras|deshace|deshacelo|revertilo|revertir|como estaba)\b/.test(t)) {
    return { cosa: 'cambia', deshacer: true }
  }
  const m1 = t.match(/\b(?:pedime|pedi|comprame|compra|compremos|pidamos)\s+para\s+(\S+)\s+(mes|meses|semana|semanas|quincena)\b/)
  if (m1) {
    const n = numero(m1[1]) ?? (m1[1] === 'una' || m1[1] === 'un' ? 1 : null)
    if (n == null) return { cosa: 'no_entendi', por_que: `no entendí para cuánto: «${m1[1]}»` }
    const meses = m1[2].startsWith('semana') ? n / 4 : m1[2] === 'quincena' ? n / 2 : n
    return { cosa: 'cambia', clave: 'cobertura_objetivo_meses', valor: Math.round(meses * 100) / 100, dicho: `${m1[1]} ${m1[2]}` }
  }
  const m2 = t.match(/\b(?:cambia|cambiame|pone|ponele|subi|baja|deja)\s+(?:la |el )?(.+?)\s+(?:a|en)\s+(\S+)/)
  if (m2) {
    const p = PARAMETROS_POR_VOZ.find((x) => x.palabras.test(m2[1]))
    const v = numero(m2[2])
    if (p && v != null) return { cosa: 'cambia', clave: p.clave, valor: v, dicho: `${m2[2]} ${p.unidad}` }
    if (p) return { cosa: 'no_entendi', por_que: `entendí que querés cambiar ${p.clave.replace(/_/g, ' ')}, pero no a cuánto` }
  }

  // ── F.2 · verificar si se hizo algo ────────────────────────────────────
  //
  // El nombre como se dijo, aunque no exista: «no encuentro a Javier» es una
  // respuesta, y adivinar a quién se refería no.
  const quienDicho = t.match(/^(?:ya )?(\w+) (?:ya )?(?:cerro|hizo|completo|termino)\b/)?.[1]
  if (/\b(cerro|cerraron|cerro la caja|hizo el cierre|hicieron el cierre)\b/.test(t) && /\bcaja|cierre\b/.test(t)) {
    return { cosa: 'verificar', que: 'caja', quien: per?.nombre, quienDicho, sucursal: suc?.id }
  }
  if (/\b(hizo|hicieron|completo|completaron|termino|terminaron|ya hizo|hizo ya)\b/.test(t) && (per || suc || quienDicho)) {
    const tema = t.replace(/^.*?\b(hizo|hicieron|completo|completaron|termino|terminaron)\b/, '').trim()
    return { cosa: 'verificar', que: 'tarea', quien: per?.nombre, quienDicho, sucursal: suc?.id, tema: tema || undefined }
  }

  // ── F.3 · preparar un pedido ───────────────────────────────────────────
  const m3 = t.match(/\b(?:pedi|pedime|pedime|compra|comprame|encarga|encargame|agrega|agregame|suma)\s+(\d+|\w+)\s+(?:unidades\s+)?(?:de\s+)?(.{3,})$/)
  if (m3 && numero(m3[1]) != null && !suc && !per) {
    return { cosa: 'hace', que: 'pedido', cantidad: numero(m3[1])!, producto: m3[2].trim() }
  }

  // ── F.3 · una transferencia: «pedile a Guzmán para Arabia» ─────────────
  if (/\b(transferi|transferencia|mover|move|pasale|mandale|pedile|traer|trae)\b/.test(t)) {
    const de = t.match(/\b(?:de|desde|a)\s+(\w+)\s+(?:para|a|hacia)\s+(\w+)/)
    const s1 = de ? buscar(de[1], cat.sucursales) : null
    const s2 = de ? buscar(de[2], cat.sucursales) : null
    if (s1 || s2) return { cosa: 'hace', que: 'transferencia', desde: s1?.id ?? null, hacia: s2?.id ?? null }
    if (suc && !per && /\btransfer|mover|move\b/.test(t)) {
      return { cosa: 'hace', que: 'transferencia', desde: null, hacia: suc.id }
    }
  }

  if (/\b(prepara|arma|armame|preparame)\b.*\bpagos?\b/.test(t)) return { cosa: 'hace', que: 'pago' }

  // ── F.1 · asignar una tarea ────────────────────────────────────────────
  const m4 = t.match(/\b(?:decile|pedile|avisale|mandale|asignale|que)\s+a\s+(\w+(?:\s\w+)?)\s+que\s+(.+)$/)
    ?? t.match(/\b(?:tarea|asigna(?:le)?(?: una tarea)?)\s+(?:a|para)\s+(\w+(?:\s\w+)?)[\s:,]+(?:de |que )?(.+)$/)
  if (m4) {
    const p = buscar(normalizar(m4[1]), cat.personas)
    const cuando: 'hoy' | 'manana' = /\bmanana\b/.test(t) ? 'manana' : 'hoy'
    const tarea = m4[2].replace(/\b(hoy|manana|para hoy|para manana)\b/g, '')
      .replace(/^(haga|hagan|hace|hacer|que haga)\s+/, '').trim()
    return { cosa: 'hace', que: 'tarea', quien: p?.nombre ?? m4[1], tarea, cuando }
  }

  // ── D.3 · llevame ──────────────────────────────────────────────────────
  if (/^(llevame|abri|abrime|anda a|ir a|vamos a|mostrame la pantalla|abrime la pantalla)\b/.test(t)) {
    const d = DESTINOS.find((x) => x.palabras.test(t))
    if (d) return { cosa: 'llevame', destino: d.destino, href: d.href }
    if (suc) return { cosa: 'llevame', destino: 'comparar sucursales', href: '/admin/direccion/sucursales' }
    return { cosa: 'no_entendi', por_que: 'entendí que querés ir a una pantalla, pero no a cuál' }
  }

  // ── D.3 · contame ──────────────────────────────────────────────────────
  if (/\bapagad/.test(t)) return { cosa: 'contame', sobre: 'apagados' }
  if (/\b(firma|que tengo que hacer|que hago|que espera|que me espera|pendiente|que hay para decidir|decision)/.test(t)) {
    return { cosa: 'contame', sobre: 'espera' }
  }
  if (suc && /\b(como|mostrame|que pasa|contame|stock|vend|caja|anda|viene|va)\b|^\w+$/.test(t)) {
    return { cosa: 'contame', sobre: 'sucursal', id: suc.id }
  }
  if (ag && /\b(que dice|como|mostrame|contame|que tiene|que pasa|anda|esta)\b|^\w+$/.test(t)) {
    return { cosa: 'contame', sobre: 'agente', id: ag.id }
  }
  if (/\b(cuanto debo|cuanto debemos|para pagar|deuda|que vence)\b/.test(t)) return { cosa: 'contame', sobre: 'agente', id: 'tesoro' }
  if (/\b(equipo|agentes)\b/.test(t)) return { cosa: 'contame', sobre: 'equipo' }
  if (/\b(como venimos|como vamos|como va|como estamos|como anda todo|resumen|novedades|que paso hoy|como viene el dia|hoy)\b/.test(t)) {
    return { cosa: 'contame', sobre: 'general' }
  }

  // ── D.6 · lo que no entiende, lo dice ──────────────────────────────────
  return { cosa: 'no_entendi', por_que: 'no encontré qué me pedís' }
}
