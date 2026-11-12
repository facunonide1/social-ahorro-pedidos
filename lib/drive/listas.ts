/**
 * Precio argentino: 16.173,03 y también el número que ya parseó Excel.
 * Una fila sin precio no es un producto: en Ceos y Distrifarm es el título
 * de la categoría.
 */

export function parsearPrecio(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!s || !/\d/.test(s)) return null
  if (/,\d{1,4}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

export type FilaLista = {
  nombre: string
  precio: number
  categoria: string | null
  sku: string | null
  droga: string | null
  concentracion: string | null
  unidades: string | null
  descuento: number | null
  condiciones: string | null
  codigoBarras: string | null
}

export type ListaParseada = {
  formato: 'norma' | 'ceos' | 'distrifarm' | 'vannier' | 'mayorsur' | 'planilla' | 'generica'
  proveedorPista: string | null
  vigenteDesde: string | null
  ivaIncluido: boolean | null
  filas: FilaLista[]
  titulosCategoria: number
}

function txt(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

function filaVacia(celdas: unknown[]): boolean {
  return celdas.every((c) => txt(c) === '')
}

/** Título de rubro: hay texto y no hay precio. No es un teléfono ni un mail. */
export function esTituloCategoria(texto: string): boolean {
  const t = texto.trim()
  if (t.length < 3 || t.length > 90) return false
  if (/@|https?:|whatsapp|tel[eé]fono|p[aá]gina|lista de precios|lista n|horario|cómo leer/i.test(t)) {
    return false
  }
  return /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(t)
}

function armar(parcial: Partial<FilaLista> & { nombre: string; precio: number }): FilaLista {
  return {
    nombre: parcial.nombre,
    precio: parcial.precio,
    categoria: parcial.categoria ?? null,
    sku: parcial.sku ?? null,
    droga: parcial.droga ?? null,
    concentracion: parcial.concentracion ?? null,
    unidades: parcial.unidades ?? null,
    descuento: parcial.descuento ?? null,
    condiciones: parcial.condiciones ?? null,
    codigoBarras: parcial.codigoBarras ?? null,
  }
}

/** Norma: encabezado Grupo / Ítem / Descripción / Precio. Una fila, un producto. */
export function parsearNorma(filas: unknown[][]): ListaParseada | null {
  const header = filas.findIndex((f) => f.some((c) => /descripci[oó]n/i.test(txt(c))) && f.some((c) => /precio/i.test(txt(c))))
  if (header < 0) return null
  const h = filas[header].map((c) => txt(c).toLowerCase())
  const col = (re: RegExp) => h.findIndex((x) => re.test(x))
  const iNom = col(/descripci/)
  const iPrecio = col(/precio/)
  const iSku = col(/[ií]tem|codigo|sku/)
  const iGrupo = col(/grupo|rubro|categor/)
  if (iNom < 0 || iPrecio < 0) return null
  const out: FilaLista[] = []
  for (const f of filas.slice(header + 1)) {
    const precio = parsearPrecio(f[iPrecio])
    const nombre = txt(f[iNom])
    if (!nombre || precio == null) continue
    out.push(armar({
      nombre,
      precio,
      sku: iSku >= 0 ? txt(f[iSku]) || null : null,
      categoria: iGrupo >= 0 ? txt(f[iGrupo]) || null : null,
    }))
  }
  if (!out.length) return null
  return { formato: 'norma', proveedorPista: 'Norma', vigenteDesde: null, ivaIncluido: null, filas: out, titulosCategoria: 0 }
}

/**
 * Ceos: el nombre está en una columna y el precio en otra, con títulos de
 * categoría (sin precio) intercalados. La fila de la empresa no es un producto.
 */
export function parsearCeos(filas: unknown[][]): ListaParseada | null {
  const pista = filas.slice(0, 12).map((f) => txt(f[1] ?? f[0])).find((t) => /ceos/i.test(t))
  if (!pista && !filas.some((f) => /ceos/i.test(txt(f.join?.(' ') ?? '')))) return null
  let categoria: string | null = null
  let titulos = 0
  const out: FilaLista[] = []
  for (const f of filas) {
    const nombre = txt(f[1] || f[0])
    const precio = parsearPrecio(f[3] ?? f[2] ?? f[1])
    if (!nombre) continue
    if (/ceos|remedios de escalada|whatsapp|p[aá]gina web|e-mail|email/i.test(nombre)) continue
    if (precio == null) {
      if (esTituloCategoria(nombre)) { categoria = nombre; titulos++ }
      continue
    }
    // El precio de Ceos cae en la columna 3. Si el número está en el nombre, no.
    if (parsearPrecio(f[3]) == null && parsearPrecio(f[2]) == null) continue
    out.push(armar({ nombre, precio: parsearPrecio(f[3]) ?? precio, categoria }))
  }
  if (out.length < 1) return null
  return { formato: 'ceos', proveedorPista: 'Ceos Médica', vigenteDesde: null, ivaIncluido: false, filas: out, titulosCategoria: titulos }
}

/** Distrifarm: «PRODUCTO / PRECIO UNITARIO» se repite bajo cada rubro. */
export function parsearDistrifarm(filas: unknown[][]): ListaParseada | null {
  const parece = filas.some((f) => /^producto$/i.test(txt(f[0])) && /precio/i.test(txt(f[1])))
  if (!parece) return null
  let categoria: string | null = null
  let titulos = 0
  const out: FilaLista[] = []
  for (const f of filas) {
    const a = txt(f[0])
    const b = txt(f[1])
    if (!a) continue
    if (/^producto$/i.test(a) && /precio/i.test(b)) continue
    if (/lista n|lista de precios/i.test(a)) continue
    const precio = parsearPrecio(f[1])
    if (precio == null) {
      if (esTituloCategoria(a)) { categoria = a; titulos++ }
      continue
    }
    out.push(armar({ nombre: a, precio, categoria }))
  }
  if (!out.length) return null
  return { formato: 'distrifarm', proveedorPista: 'Distrifarm', vigenteDesde: null, ivaIncluido: false, filas: out, titulosCategoria: titulos }
}

/** Vannier hospitalario: ARTICULO, principio activo, producto, presentación, precio. */
export function parsearVannier(filas: unknown[][]): ListaParseada | null {
  const header = filas.findIndex((f) => f.some((c) => /principio activo/i.test(txt(c))) && f.some((c) => /precio/i.test(txt(c))))
  if (header < 0) return null
  const h = filas[header].map((c) => txt(c).toLowerCase())
  const col = (re: RegExp) => h.findIndex((x) => re.test(x))
  const iSku = col(/art[ií]culo/)
  const iDroga = col(/principio/)
  const iNom = col(/^producto$|producto/)
  const iPres = col(/present/)
  const iPrecio = col(/precio/)
  const fecha = filas.slice(0, header).map((f) => f.map(txt).find((c) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c))).find(Boolean) ?? null
  let categoria: string | null = null
  let titulos = 0
  const out: FilaLista[] = []
  for (const f of filas.slice(header + 1)) {
    const precio = iPrecio >= 0 ? parsearPrecio(f[iPrecio]) : null
    const producto = txt(f[iNom])
    const pres = iPres >= 0 ? txt(f[iPres]) : ''
    if (precio == null) {
      const suelto = f.map(txt).filter(Boolean).join(' ')
      if (suelto && esTituloCategoria(suelto) && f.filter((c) => txt(c)).length <= 2) {
        categoria = suelto
        titulos++
      }
      continue
    }
    const nombre = [producto, pres].filter(Boolean).join(' ')
    if (!nombre) continue
    out.push(armar({
      nombre,
      precio,
      categoria,
      sku: iSku >= 0 ? txt(f[iSku]) || null : null,
      droga: iDroga >= 0 ? txt(f[iDroga]) || null : null,
      unidades: pres || null,
    }))
  }
  if (!out.length) return null
  return {
    formato: 'vannier',
    proveedorPista: 'Vannier',
    vigenteDesde: fecha,
    ivaIncluido: null,
    filas: out,
    titulosCategoria: titulos,
  }
}

const PRECIO_TXT = /\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g

/** Mayorsur: texto de un PDF en dos columnas, un precio por producto. */
export function parsearMayorsur(texto: string): ListaParseada {
  let categoria: string | null = null
  let titulos = 0
  const out: FilaLista[] = []
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.replace(/\s+/g, ' ').trim()
    if (!linea) continue
    if (/c[oó]mo leer|horario de atenci|los precios est|visite nuestro|el primer n[uú]mero/i.test(linea)) continue
    const precios = [...linea.matchAll(PRECIO_TXT)]
    if (!precios.length) {
      if (esTituloCategoria(linea) && linea.length < 60 && !/descripci[oó]n/i.test(linea)) {
        categoria = linea
        titulos++
      }
      continue
    }
    let desde = 0
    for (const m of precios) {
      const nombre = linea.slice(desde, m.index).replace(/\|/g, ' ').trim()
      const precio = parsearPrecio(m[1])
      if (nombre && precio != null && !/descripci[oó]n/i.test(nombre)) {
        out.push(armar({ nombre, precio, categoria, condiciones: 'Precio por paquete, IVA incluido' }))
      }
      desde = (m.index ?? 0) + m[0].length
    }
  }
  const fecha = texto.match(/lista de precios:\s*(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[1] ?? null
  return {
    formato: 'mayorsur',
    proveedorPista: 'Mayorsur',
    vigenteDesde: fecha,
    ivaIncluido: true,
    filas: out,
    titulosCategoria: titulos,
  }
}

export function parsearGrilla(filas: unknown[][], nombreArchivo = ''): ListaParseada | null {
  const n = nombreArchivo.toLowerCase()
  if (/vannier/.test(n)) return parsearVannier(filas)
  if (/distrifarm/.test(n)) return parsearDistrifarm(filas)
  if (/ceos/.test(n)) return parsearCeos(filas)
  if (/norma/.test(n)) return parsearNorma(filas)
  return parsearVannier(filas) ?? parsearDistrifarm(filas) ?? parsearNorma(filas) ?? parsearCeos(filas)
}
