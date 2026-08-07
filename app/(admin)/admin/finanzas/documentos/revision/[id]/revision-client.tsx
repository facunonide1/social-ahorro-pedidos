'use client'

import { FileText, Loader2 } from 'lucide-react'

import { VisorDocumento } from '@/components/documentos/visor-documento'

/**
 * Revisión de un documento capturado.
 *
 * En esta versión muestra el original y el estado de la lectura. La extracción
 * con el modelo y la edición de campos llegan en los bloques siguientes.
 */
export function RevisionClient({
  estado,
  error,
  imagenUrl,
  esPdf,
}: {
  extraccionId: string
  estado: string
  error: string | null
  imagenUrl: string | null
  esPdf: boolean
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VisorDocumento url={imagenUrl} esPdf={esPdf} />

      <div className="rounded-lg border border-border p-6">
        {estado === 'pendiente' && (
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">Documento guardado</div>
              <p className="mt-1 text-sm text-muted-foreground">
                El archivo quedó guardado. La lectura automática todavía no está disponible.
              </p>
            </div>
          </div>
        )}

        {estado === 'procesando' && (
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
            <div>
              <div className="font-medium">Leyendo el documento…</div>
              <p className="mt-1 text-sm text-muted-foreground">Puede tardar unos segundos.</p>
            </div>
          </div>
        )}

        {estado === 'error' && (
          <div>
            <div className="font-medium">No pude leer este documento</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {error ?? 'Probá con una foto más nítida, derecha y con buena luz.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
