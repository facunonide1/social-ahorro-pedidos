/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Unificación de shells (v0.18): /hub/* quedó mudado a /admin/*.
  // Redirige permanente para links/favoritos viejos. El orden importa:
  // las reglas específicas van antes del wildcard.
  async redirects() {
    return [
      // /hub/usuarios era duplicado legacy → canónico en configuración.
      { source: '/hub/usuarios', destination: '/admin/configuracion/usuarios', permanent: true },
      { source: '/hub', destination: '/admin', permanent: true },
      { source: '/hub/:path*', destination: '/admin/:path*', permanent: true },
    ]
  },
}

export default nextConfig
