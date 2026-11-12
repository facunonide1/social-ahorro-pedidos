import { NextResponse, type NextRequest } from 'next/server'

import { exigirDueno } from '@/lib/drive/acceso'
import { ingestaHabilitada } from '@/lib/drive/flag'
import { parPkce, redirectDeHost, urlDeAutorizacion } from '@/lib/drive/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!ingestaHabilitada()) {
    return NextResponse.redirect(new URL('/admin/configuracion/integraciones/google-drive?aviso=deshabilitado', req.url))
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/admin/configuracion/integraciones/google-drive?aviso=sin_credenciales', req.url))
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3001'
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const redirectUri = redirectDeHost(host, proto)
  const pkce = parPkce()
  const url = urlDeAutorizacion({ clientId, redirectUri, state: pkce.state, challenge: pkce.challenge })
  const res = NextResponse.redirect(url)
  res.cookies.set('gd_oauth', JSON.stringify({ state: pkce.state, verifier: pkce.verifier }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto.includes('https'),
    path: '/',
    maxAge: 600,
  })
  return res
}
