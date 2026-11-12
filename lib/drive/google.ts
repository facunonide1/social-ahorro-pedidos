/**
 * Drive API v3 con fetch. Carpetas compartidas con el dueño (no son de su
 * «Mi unidad»): supportsAllDrives, includeItemsFromAllDrives y, en la
 * búsqueda, sharedWithMe.
 */

const DRIVE = 'https://www.googleapis.com/drive/v3'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type ArchivoDrive = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  md5Checksum?: string
  webViewLink?: string
  size?: string
}

function q(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

async function driveGet(token: string, path: string, params: Record<string, string>): Promise<Response> {
  const url = `${DRIVE}${path}?${q({
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    ...params,
  })}`
  return fetch(url, { headers: { authorization: `Bearer ${token}` } })
}

export async function listarPagina(
  token: string,
  folderId: string,
  pageToken: string | null,
): Promise<{ files: ArchivoDrive[]; nextPageToken: string | null }> {
  const params: Record<string, string> = {
    q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
    pageSize: '100',
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,webViewLink,size)',
    orderBy: 'modifiedTime desc',
  }
  if (pageToken) params.pageToken = pageToken
  const res = await driveGet(token, '/files', params)
  if (!res.ok) throw new Error(`Drive listó ${res.status}`)
  const data = await res.json() as { files?: ArchivoDrive[]; nextPageToken?: string }
  return { files: data.files ?? [], nextPageToken: data.nextPageToken ?? null }
}

/** Carpetas por nombre, en Mi unidad y en lo compartido conmigo. */
export async function buscarCarpetas(token: string, texto: string): Promise<ArchivoDrive[]> {
  const nombre = texto.replace(/'/g, "\\'")
  const base = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '${nombre}'`
  const campos = 'files(id,name,mimeType,modifiedTime,webViewLink)'
  const [propias, compartidas] = await Promise.all([
    driveGet(token, '/files', { q: base, pageSize: '25', fields: campos }),
    driveGet(token, '/files', { q: `sharedWithMe = true and ${base}`, pageSize: '25', fields: campos }),
  ])
  const juntar = async (res: Response) => {
    if (!res.ok) return [] as ArchivoDrive[]
    const data = await res.json() as { files?: ArchivoDrive[] }
    return data.files ?? []
  }
  const todas = [...await juntar(propias), ...await juntar(compartidas)]
  const vistos = new Set<string>()
  return todas.filter((f) => (vistos.has(f.id) ? false : (vistos.add(f.id), true)))
}

export async function descargar(token: string, archivo: { id: string; mimeType: string }): Promise<Buffer> {
  const esNativo = archivo.mimeType === 'application/vnd.google-apps.spreadsheet'
  const url = esNativo
    ? `${DRIVE}/files/${archivo.id}/export?${q({ mimeType: XLSX_MIME, supportsAllDrives: 'true' })}`
    : `${DRIVE}/files/${archivo.id}?${q({ alt: 'media', supportsAllDrives: 'true' })}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Drive no entregó el archivo (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function emailDeLaCuenta(token: string): Promise<string | null> {
  const res = await driveGet(token, '/about', { fields: 'user(emailAddress)' })
  if (!res.ok) return null
  const data = await res.json() as { user?: { emailAddress?: string } }
  return data.user?.emailAddress ?? null
}

export async function refrescarAccessToken(refresh: string): Promise<
  { ok: true; accessToken: string } | { ok: false; error: string; invalidGrant: boolean }
> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    refresh_token: refresh,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const data = await res.json() as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) {
    return { ok: false, error: data.error ?? `token ${res.status}`, invalidGrant: data.error === 'invalid_grant' }
  }
  return { ok: true, accessToken: data.access_token }
}

export async function revocarToken(token: string): Promise<boolean> {
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  })
  return res.ok
}
