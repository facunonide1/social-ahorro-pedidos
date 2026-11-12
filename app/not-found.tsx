import Link from 'next/link'

/** Cualquier ruta que no existe fuera de /admin (login, pedidos, mostrador). */
export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Esta página no existe</h1>
      <p className="max-w-sm text-sm text-muted-foreground">Puede que el link esté mal o que la página se haya mudado.</p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">Volver al inicio</Link>
    </main>
  )
}
