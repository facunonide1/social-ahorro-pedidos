import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sb = createClient()
  await sb.auth.signOut()
  const reason = req.nextUrl.searchParams.get('reason')
  const target = new URL('/login', req.url)
  if (reason) target.searchParams.set('error', reason)
  return NextResponse.redirect(target, { status: 303 })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
