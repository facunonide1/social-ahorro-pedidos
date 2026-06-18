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
      // v0.18 — /hub/* mudado a /admin/*.
      { source: '/hub/usuarios', destination: '/admin/configuracion/usuarios', permanent: true },
      { source: '/hub', destination: '/admin', permanent: true },
      { source: '/hub/:path*', destination: '/admin/:path*', permanent: true },
      // v0.19 — consolidación de módulos duplicados (un módulo por función).
      { source: '/admin/finanzas/proveedores/:id', destination: '/admin/proveedores/:id', permanent: true },
      { source: '/admin/finanzas/proveedores', destination: '/admin/proveedores', permanent: true },
      // pagos/facturas legacy → nuevos de Finanzas (sin subrutas: colapsan al índice).
      { source: '/admin/pagos/:path*', destination: '/admin/finanzas/pagos', permanent: true },
      { source: '/admin/facturas/:path*', destination: '/admin/finanzas/documentos', permanent: true },
    ]
  },
}

export default nextConfig
