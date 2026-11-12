import { createHash, randomBytes } from 'node:crypto'

/** Authorization code + PKCE + state. Solo lectura de Drive. */
export const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
export const REDIRECT_PRODUCCION = 'https://social-ahorro-pedidos.vercel.app/api/integraciones/google-drive/callback'

export function redirectDeHost(host: string, proto: string): string {
  const h = host.split(',')[0].trim()
  const p = (proto.split(',')[0].trim() || 'https').replace(/:$/, '')
  return `${p}://${h}/api/integraciones/google-drive/callback`
}

export function parPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(24).toString('base64url')
  return { verifier, challenge, state }
}

export function urlDeAutorizacion(opts: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: 'S256',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

export async function canjearCodigo(opts: {
  code: string
  verifier: string
  redirectUri: string
}): Promise<{ refreshToken: string } | { error: string }> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    code: opts.code,
    code_verifier: opts.verifier,
    grant_type: 'authorization_code',
    redirect_uri: opts.redirectUri,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const data = await res.json() as { refresh_token?: string; error?: string; error_description?: string }
  if (!data.refresh_token) {
    return { error: data.error_description || data.error || 'Google no entregó refresh token' }
  }
  return { refreshToken: data.refresh_token }
}
