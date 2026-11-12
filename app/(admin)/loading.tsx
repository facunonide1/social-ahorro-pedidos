/**
 * Mientras carga una página de NORA. El shell (dock, header) sigue visible:
 * esto ocupa sólo el contenido. Sin texto que prometa nada: bloques grises
 * con la forma de una página, para que no parezca que se colgó.
 */
export default function AdminLoading() {
  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-2">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/50" />
    </div>
  )
}
