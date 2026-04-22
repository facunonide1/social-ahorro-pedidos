import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Detecta si la request es un prefetch automático del router de Next
 * o del browser, para no desloguear al usuario en background cuando un
 * <Link href="/logout"> queda en viewport. Seguimos soportando GET
 * "real" (clicks en anchors, redirects desde /page.tsx, etc.).
 */
function isPrefetch(req: NextRequest) {
  return (
    req.headers.get('next-router-prefetch') === '1' ||
    req.headers.get('purpose')              === 'prefetch' ||
    req.headers.get('x-purpose')            === 'prefetch' ||
    req.headers.get('sec-purpose')          === 'prefetch'
  )
}

export async function POST(req: NextRequest) {
  const sb = createClient()
  await sb.auth.signOut()
  const reason = req.nextUrl.searchParams.get('reason')
  const target = new URL('/login', req.url)
  if (reason) target.searchParams.set('error', reason)
  return NextResponse.redirect(target, { status: 303 })
}

export async function GET(req: NextRequest) {
  if (isPrefetch(req)) {
    return new NextResponse(null, { status: 204 })
  }
  return POST(req)
}
