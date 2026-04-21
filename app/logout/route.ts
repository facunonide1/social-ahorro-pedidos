import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sb = createClient()
  await sb.auth.signOut()
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
