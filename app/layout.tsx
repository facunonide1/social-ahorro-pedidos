import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Fraunces } from 'next/font/google'
import { Toaster } from 'sonner'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/theme-provider'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'NORA HQ', template: '%s · NORA HQ' },
  description: 'NORA HQ — el centro de mando inteligente de Social Ahorro Farmacias',
  applicationName: 'NORA HQ',
  appleWebApp: {
    capable: true,
    title: 'NORA HQ',
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
    <html
      lang="es"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
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
