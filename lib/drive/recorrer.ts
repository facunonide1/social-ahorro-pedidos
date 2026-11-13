/**
 * Recorrido de carpetas, una página por vez, para poder cortar y seguir en la
 * próxima corrida del cron. Las carpetas compartidas entran igual: quién lista
 * es la API, y esta función no filtra por «Mi unidad».
 */

export const MIME_CARPETA = 'application/vnd.google-apps.folder'

export type NodoDrive = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string | null
  md5Checksum?: string | null
  webViewLink?: string | null
  size?: string | null
}

export type TareaCarpeta = {
  folderId: string
  pageToken: string | null
  depth: number
  ruta: string
  raizId: string
  raizNombre: string
  recurse: boolean
}

export type ArchivoVisto = {
  fileId: string
  nombre: string
  mime: string
  modifiedTime: string | null
  md5: string | null
  webViewLink: string | null
  size: number | null
  carpetaRaizId: string
  carpetaRaizNombre: string
  rutaRelativa: string
}

export type PaginaDrive = { files: NodoDrive[]; nextPageToken?: string | null }

export function tareasIniciales(
  raices: { folderId: string; folderNombre: string; incluirSubcarpetas: boolean }[],
): TareaCarpeta[] {
  return raices.map((r) => ({
    folderId: r.folderId,
    pageToken: null,
    depth: 0,
    ruta: r.folderNombre,
    raizId: r.folderId,
    raizNombre: r.folderNombre,
    recurse: r.incluirSubcarpetas,
  }))
}

function modificadoDespues(nodo: NodoDrive, desde: string | null): boolean {
  if (!desde || !nodo.modifiedTime) return true
  return nodo.modifiedTime > desde
}

/**
 * Saca una página de la cola (BFS). Devuelve la cola que queda y los archivos
 * de esa página. `vistos` evita contar dos veces un archivo que está en las
 * dos carpetas compartidas.
 */
export async function tomarPagina(
  tareas: TareaCarpeta[],
  listar: (folderId: string, pageToken: string | null) => Promise<PaginaDrive>,
  opts: {
    maxProfundidad: number
    /**
     * Desde cuándo traer, POR CARPETA RAÍZ. Antes era una sola fecha para
     * todas (el último listado completo): una carpeta agregada después quedaba
     * con todos sus archivos «viejos» filtrados para siempre. Así no entró
     * nada de «compras farmacias». null = traer todo.
     */
    modificadoDespues: string | null | ((raizId: string) => string | null)
    vistos: Set<string>
  },
): Promise<{ tareas: TareaCarpeta[]; archivos: ArchivoVisto[]; hubo: boolean }> {
  if (!tareas.length) return { tareas, archivos: [], hubo: false }
  const [actual, ...resto] = tareas
  const pagina = await listar(actual.folderId, actual.pageToken)
  const siguientes: TareaCarpeta[] = []
  const archivos: ArchivoVisto[] = []

  for (const nodo of pagina.files) {
    if (nodo.mimeType === MIME_CARPETA) {
      const depth = actual.depth + 1
      if (actual.recurse && depth < opts.maxProfundidad) {
        siguientes.push({
          folderId: nodo.id,
          pageToken: null,
          depth,
          ruta: `${actual.ruta}/${nodo.name}`,
          raizId: actual.raizId,
          raizNombre: actual.raizNombre,
          recurse: true,
        })
      }
      continue
    }
    if (opts.vistos.has(nodo.id)) continue
    const desde = typeof opts.modificadoDespues === 'function'
      ? opts.modificadoDespues(actual.raizId)
      : opts.modificadoDespues
    if (!modificadoDespues(nodo, desde)) continue
    opts.vistos.add(nodo.id)
    archivos.push({
      fileId: nodo.id,
      nombre: nodo.name,
      mime: nodo.mimeType,
      modifiedTime: nodo.modifiedTime ?? null,
      md5: nodo.md5Checksum ?? null,
      webViewLink: nodo.webViewLink ?? null,
      size: nodo.size ? Number(nodo.size) : null,
      carpetaRaizId: actual.raizId,
      carpetaRaizNombre: actual.raizNombre,
      rutaRelativa: `${actual.ruta}/${nodo.name}`,
      })
  }

  const cola = actual && pagina.nextPageToken
    ? [{ ...actual, pageToken: pagina.nextPageToken }, ...siguientes, ...resto]
    : [...resto, ...siguientes]

  return { tareas: cola, archivos, hubo: true }
}
