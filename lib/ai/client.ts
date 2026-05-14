import Anthropic from '@anthropic-ai/sdk'

/**
 * Cliente Anthropic compartido. Server-only — nunca importar desde
 * componentes cliente (la API key vive solo en el server).
 */
let _client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY no está configurada. Cargala en .env.local y en Vercel.',
    )
  }
  _client = new Anthropic({ apiKey })
  return _client
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}
