'use client'

/**
 * F.5 · EL MODO SIN CONEXIÓN.
 *
 * «Una farmacia que se queda sin internet sigue vendiendo.»
 *
 * ── QUÉ QUEDA EN EL DISPOSITIVO ─────────────────────────────────────────────
 *
 * El catálogo **de la propia sucursal**: los productos que tienen stock acá,
 * con nombre, marca, droga, presentación, código de barras, precio y cuántas
 * hay. Son unos pocos miles de filas, no las 48.217.
 *
 * ── Y QUÉ NO ────────────────────────────────────────────────────────────────
 *
 * El stock de las otras sucursales, la cobertura de los convenios, los
 * clientes y el circuito de «lo traigo de la otra sucursal». Nada de eso se
 * puede resolver sin preguntarle al servidor, y guardar una copia vieja de un
 * stock ajeno sería prometer algo que capaz ya se vendió.
 *
 * La pantalla dice las dos cosas: lo que puede hacer y lo que no.
 *
 * ── LA FECHA ES PARTE DEL DATO ──────────────────────────────────────────────
 *
 * Cada snapshot se guarda con la hora en que se bajó, y la pantalla la
 * muestra. Un catálogo sin fecha es un catálogo que miente por omisión: el
 * precio de hace tres días se lee igual que el de ahora.
 *
 * ── LO QUE SE REGISTRA SIN CONEXIÓN ─────────────────────────────────────────
 *
 * El faltante. Es lo único que se puede registrar sin servidor sin prometerle
 * nada a nadie: queda en una cola y se sincroniza cuando vuelve la conexión.
 * Si se perdiera, se perdería un dato; si se perdiera un pedido, se perdería
 * un cliente.
 */

const DB = 'nora-mostrador'
const VERSION = 1
const T_CATALOGO = 'catalogo'
const T_META = 'meta'
const T_COLA = 'cola'

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(T_CATALOGO)) {
        const s = db.createObjectStore(T_CATALOGO, { keyPath: 'producto_id' })
        s.createIndex('busqueda', 'busqueda')
        s.createIndex('codigo_barras', 'codigo_barras')
      }
      if (!db.objectStoreNames.contains(T_META)) db.createObjectStore(T_META, { keyPath: 'clave' })
      if (!db.objectStoreNames.contains(T_COLA)) {
        db.createObjectStore(T_COLA, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => ok(req.result)
    req.onerror = () => mal(req.error)
  })
}

function tx<T>(db: IDBDatabase, store: string, modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((ok, mal) => {
    const t = db.transaction(store, modo)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => ok(req.result as T)
    req.onerror = () => mal(req.error)
  })
}

export interface FilaLocal {
  producto_id: string
  sku: string
  codigo_barras: string | null
  nombre: string
  presentacion: string | null
  laboratorio: string | null
  droga_principal: string | null
  precio: number | null
  stock: number
  requiere_receta: boolean
  /** El texto normalizado, igual que en la base: se busca contra esto. */
  busqueda: string
}

export interface Meta {
  sincronizado_at: string
  sucursal_id: string
  sucursal_nombre: string
  productos: number
  /** De cuándo es la foto de stock de SIFACO que se bajó. */
  stock_leido_at: string | null
}

export async function guardarSnapshot(
  filas: FilaLocal[], meta: Omit<Meta, 'sincronizado_at'>,
): Promise<void> {
  const db = await abrir()
  await new Promise<void>((ok, mal) => {
    const t = db.transaction([T_CATALOGO, T_META], 'readwrite')
    const cat = t.objectStore(T_CATALOGO)
    cat.clear()
    for (const f of filas) cat.put(f)
    t.objectStore(T_META).put({
      clave: 'ultimo', ...meta, sincronizado_at: new Date().toISOString(),
    })
    t.oncomplete = () => ok()
    t.onerror = () => mal(t.error)
  })
  db.close()
}

export async function leerMeta(): Promise<Meta | null> {
  try {
    const db = await abrir()
    const r = await tx<any>(db, T_META, 'readonly', (s) => s.get('ultimo'))
    db.close()
    return r ?? null
  } catch { return null }
}

/**
 * La búsqueda local. Es la misma idea que la del servidor —texto normalizado,
 * prefijo para lo corto, contiene para lo largo, y el número tiene que estar—
 * pero sin el orden de A.2: sin fecha de vencimiento ni margen ni ventas
 * guardadas, ordenar por eso sería inventar un orden.
 *
 * Ordena por: lo que más se parece, y lo que hay antes de lo que no.
 * **Y la pantalla dice que el orden es más pobre que el de siempre.**
 */
export async function buscarLocal(q: string, limite = 20): Promise<FilaLocal[]> {
  const txt = normalizar(q)
  if (!txt) return []
  const palabras = txt.split(' ').filter((w) => /[a-z]/.test(w) && w.length >= 2)
  const numeros = txt.split(' ').filter((w) => /^[0-9]+$/.test(w))

  const db = await abrir()
  const todas = await tx<FilaLocal[]>(db, T_CATALOGO, 'readonly', (s) => s.getAll())
  db.close()

  const pega = (f: FilaLocal) => {
    if (numeros.length && !numeros.every((n) => f.busqueda.includes(n))) return false
    if (txt.length <= 4) {
      return f.busqueda.startsWith(txt) || f.busqueda.includes(' ' + txt)
    }
    if (f.busqueda.includes(txt)) return true
    return palabras.length > 1 && palabras.every((w) => f.busqueda.includes(w))
  }

  return todas
    .filter(pega)
    .sort((a, b) => {
      const ea = a.busqueda.startsWith(txt) ? 1 : 0
      const eb = b.busqueda.startsWith(txt) ? 1 : 0
      if (ea !== eb) return eb - ea
      const ha = a.stock > 0 ? 1 : 0
      const hb = b.stock > 0 ? 1 : 0
      if (ha !== hb) return hb - ha
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    .slice(0, limite)
}

export async function porCodigoLocal(codigo: string): Promise<FilaLocal | null> {
  const c = codigo.trim()
  if (!c) return null
  const db = await abrir()
  const r = await tx<FilaLocal | undefined>(db, T_CATALOGO, 'readonly',
    (s) => s.index('codigo_barras').get(c))
  db.close()
  return r ?? null
}

// ── LA COLA ─────────────────────────────────────────────────────────────────

export interface Pendiente {
  id?: number
  tipo: 'faltante'
  cuerpo: Record<string, unknown>
  creado_at: string
}

export async function encolar(p: Omit<Pendiente, 'id' | 'creado_at'>): Promise<void> {
  const db = await abrir()
  await tx(db, T_COLA, 'readwrite',
    (s) => s.add({ ...p, creado_at: new Date().toISOString() }))
  db.close()
}

export async function cuantosPendientes(): Promise<number> {
  try {
    const db = await abrir()
    const r = await tx<number>(db, T_COLA, 'readonly', (s) => s.count())
    db.close()
    return r
  } catch { return 0 }
}

/**
 * Manda lo que quedó pendiente. Lo que falla se queda en la cola: no se
 * descarta. Un faltante perdido es una venta perdida que nadie va a contar.
 */
export async function sincronizarCola(): Promise<{ enviados: number; quedan: number }> {
  const db = await abrir()
  const todos = await tx<Pendiente[]>(db, T_COLA, 'readonly', (s) => s.getAll())
  db.close()

  let enviados = 0
  for (const p of todos) {
    try {
      const r = await fetch('/api/mostrador/faltante', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p.cuerpo),
      })
      if (!r.ok) continue
      const db2 = await abrir()
      await tx(db2, T_COLA, 'readwrite', (s) => s.delete(p.id!))
      db2.close()
      enviados++
    } catch { /* se queda en la cola */ }
  }
  return { enviados, quedan: todos.length - enviados }
}

/** Al cerrar sesión no queda nada del local en el dispositivo. */
export async function borrarTodo(): Promise<void> {
  try {
    const db = await abrir()
    db.close()
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase(DB)
      r.onsuccess = () => ok(); r.onerror = () => ok(); r.onblocked = () => ok()
    })
  } catch { /* */ }
}

/** La misma normalización que `convenio_normalizar` en la base. */
function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
