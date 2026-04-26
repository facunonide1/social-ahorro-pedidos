import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Social Ahorro · Admin',
  description: 'ERP interno de Social Ahorro Farmacias',
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
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  )
}
