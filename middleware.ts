import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  const isApiSync = pathname.startsWith('/api/sync')
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

  if (isApiSync) return supabaseResponse
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
