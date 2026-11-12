import { NextResponse, type NextRequest } from 'next/server'

import { isCronRequest } from '@/lib/cron/auth'
import { conRegistro } from '@/lib/cron/corrida'
import { correrIngesta } from '@/lib/drive/correr'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function get(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  const r = await correrIngesta()
  return NextResponse.json(r)
}

export const GET = conRegistro('drive-ingesta', get)
