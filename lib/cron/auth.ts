import type { NextRequest } from 'next/server'

/**
 * Auth helper para cron endpoints. Acepta:
 *  - Authorization: Bearer ${CRON_SECRET} (Vercel cron default)
 *  - Authorization: Bearer ${SYNC_CRON_SECRET} (legacy)
 *  - x-sync-secret header (legacy)
 */
export function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.SYNC_CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  return (
    auth === `Bearer ${secret}` || req.headers.get('x-sync-secret') === secret
  )
}
