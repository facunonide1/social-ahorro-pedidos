import Link from 'next/link'
import { SearchX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Cuando una página de /admin llama a `notFound()` (un pedido, un proveedor,
 * un producto que no está), adentro del shell de NORA. Las URLs que no
 * existen las atiende `app/not-found.tsx`: en Next 14 un not-found anidado
 * sólo recibe los `notFound()`.
 */
export default function AdminNotFound() {
  return (
    <div className="container mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <SearchX className="size-4" />
            No está
          </div>
          <CardTitle className="text-xl tracking-tight">Esta pantalla no existe, o lo que buscabas ya no está</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Si llegaste por un link guardado, puede que la pantalla se haya mudado. Si es un registro, puede que se haya borrado o que no sea de tu sucursal.</p>
          <Button asChild>
            <Link href="/admin">Ir al inicio de NORA</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
