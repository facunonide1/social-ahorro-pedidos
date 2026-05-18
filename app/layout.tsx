import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/theme-provider'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Social Ahorro · ERP',
  description: 'ERP interno de Social Ahorro Farmacias',
  applicationName: 'SA ERP',
  appleWebApp: {
    capable: true,
    title: 'SA ERP',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <NuqsAdapter>
            {children}
            <Toaster position="top-right" richColors closeButton />
            <PwaRegister />
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  )
}
