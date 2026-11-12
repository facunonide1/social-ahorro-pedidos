import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirDueno } from '@/lib/drive/acceso'
import { cifrarToken, claveDesdeEnv } from '@/lib/drive/crypto'
import { emailDeLaCuenta, refrescarAccessToken } from '@/lib/drive/google'
import { canjearCodigo, redirectDeHost } from '@/lib/drive/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VOLVER = '/admin/configuracion/integraciones/google-drive'

export async function GET(req: NextRequest) {
  const g = await exigirDueno()
  const url = new URL(VOLVER, req.url)
  if ('error' in g) {
    url.searchParams.set('aviso', 'sin_permiso')
    return NextResponse.redirect(url)
  }
  const errorGoogle = req.nextUrl.searchParams.get('error')
  if (errorGoogle) {
    url.searchParams.set('aviso', errorGoogle)
    return NextResponse.redirect(url)
  }
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cruda = req.cookies.get('gd_oauth')?.value
  let guardado: { state?: string; verifier?: string } = {}
  try { guardado = JSON.parse(cruda ?? '{}') } catch { guardado = {} }
  if (!code || !state || state !== guardado.state || !guardado.verifier) {
    url.searchParams.set('aviso', 'state')
    return NextResponse.redirect(url)
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const canje = await canjearCodigo({ code, verifier: guardado.verifier, redirectUri: redirectDeHost(host, proto) })
  if ('error' in canje) {
    url.searchParams.set('aviso', 'token')
    const res = NextResponse.redirect(url)
    res.cookies.delete('gd_oauth')
    return res
  }
  const acceso = await refrescarAccessToken(canje.refreshToken)
  const email = acceso.ok ? await emailDeLaCuenta(acceso.accessToken) : null
  const blob = cifrarToken(canje.refreshToken, claveDesdeEnv())
  const adm = createAdminClient()
  const ahora = new Date().toISOString()
  const { data: previa } = await adm.from('integraciones_google_drive').select('id').eq('owner_admin_id', g.userId).limit(1).maybeSingle()
  const fila = {
    owner_admin_id: g.userId,
    email_cuenta: email,
    refresh_token_cifrado: blob.cifrado,
    iv: blob.iv,
    tag: blob.tag,
    estado: 'conectada',
    connected_at: ahora,
    last_error: null,
    updated_at: ahora,
  }
  const { error } = previa
    ? await adm.from('integraciones_google_drive').update(fila).eq('id', previa.id)
    : await adm.from('integraciones_google_drive').insert(fila)
  url.searchParams.set('aviso', error ? 'guardar' : 'conectada')
  const res = NextResponse.redirect(url)
  res.cookies.delete('gd_oauth')
  return res
}
