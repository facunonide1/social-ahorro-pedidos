import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * El refresh token no se guarda en claro. AES-256-GCM con la clave de 32 bytes
 * en DRIVE_TOKEN_ENC_KEY (base64). El IV y el tag viajan al lado del texto,
 * nunca la clave. Esto no se importa desde un componente de cliente.
 */

export type TokenCifrado = { cifrado: string; iv: string; tag: string }

export function claveDesdeEnv(valor = process.env.DRIVE_TOKEN_ENC_KEY): Buffer {
  if (!valor) throw new Error('Falta DRIVE_TOKEN_ENC_KEY')
  const key = Buffer.from(valor, 'base64')
  if (key.length !== 32) {
    throw new Error('DRIVE_TOKEN_ENC_KEY tiene que ser 32 bytes en base64')
  }
  return key
}

export function cifrarToken(texto: string, key: Buffer): TokenCifrado {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    cifrado: cifrado.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function descifrarToken(blob: TokenCifrado, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
  const plano = Buffer.concat([
    decipher.update(Buffer.from(blob.cifrado, 'base64')),
    decipher.final(),
  ])
  return plano.toString('utf8')
}
