'use client'

import { useEffect } from 'react'
import { AlertOctagon, RotateCcw, LogIn } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-destructive">
            <AlertOctagon className="size-4" />
            Error
          </div>
          <CardTitle className="text-xl tracking-tight">Algo salió mal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
            {error?.message || 'Error desconocido'}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => reset()}>
              <RotateCcw className="size-4" />
              Reintentar
            </Button>
            <Button asChild variant="outline">
              <a href="/login">
                <LogIn className="size-4" />
                Ir al login
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
