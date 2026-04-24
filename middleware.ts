import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // En Preview deploys de Vercel las env vars pueden no estar
  // configuradas. Antes de hardenear esto, el middleware crasheaba con
  // MIDDLEWARE_INVOCATION_FAILED (500) y no se podía ver nada. Ahora
  // dejamos pasar la request: las páginas igual van a fallar al
  // levantar el cliente, pero al menos se renderiza un error legible.
  if (!SUPA_URL || !SUPA_KEY) {
    console.error('[middleware] Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY. Configurar env vars en Vercel.')
    return supabaseResponse
  }

  let user: { id: string } | null = null
  try {
    const supabase = createServerClient(SUPA_URL, SUPA_KEY, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (err) {
    console.error('[middleware] supabase.auth.getUser falló:', err)
    return supabaseResponse
  }

  const pathname = request.nextUrl.pathname

  const isApiSync = pathname.startsWith('/api/sync')
  const isWooWebhook = pathname.startsWith('/api/woo-webhook')
  const isBootstrap  = pathname === '/bootstrap' || pathname.startsWith('/api/admin/bootstrap')
  const isLogin = pathname === '/login'

  // Copia las cookies ya seteadas por supabase al redirect
  // para que el token refrescado llegue al servidor en la próxima request.
  function redirectWithCookies(url: URL) {
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(c => {
      res.cookies.set(c.name, c.value)
    })
    return res
  }

  if (isApiSync || isWooWebhook || isBootstrap) return supabaseResponse
  if (isLogin) {
    // Si hay user pero la URL trae ?error=..., permito mostrar login
    // (ej: el server redirigió acá por "sin_permiso" y el form se va a
    // encargar de cerrar la sesión huérfana). Sin esto, el middleware
    // rebota /login -> / y se arma un loop cuando el user auth existe
    // pero no tiene fila activa en users_pedidos.
    const hasError = request.nextUrl.searchParams.has('error')
    if (user && !hasError) return redirectWithCookies(new URL('/', request.url))
    return supabaseResponse
  }

  if (!user) return redirectWithCookies(new URL('/login', request.url))

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
