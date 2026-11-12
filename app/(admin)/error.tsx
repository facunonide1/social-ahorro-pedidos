'use client'

import { useEffect } from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Error de una página bajo el layout de NORA. El shell (dock, header) sigue
 * visible: este archivo no reemplaza `app/(admin)/layout.tsx`.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin error]', error)
  }, [error])

  return (
    <div className="container mx-auto max-w-lg px-4 py-10">
      <Card>
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
              <a href="/admin">Ir a /admin</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
