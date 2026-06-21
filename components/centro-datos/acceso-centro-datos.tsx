import Link from 'next/link'
import { Upload, Download, Database } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Botón de acceso al Centro de Datos con el perfil/acción precargado.
 * Se inserta en los headers de cada sector (Ofertas, Stock, CRM, Operaciones).
 */
export function AccesoCentroDatos({ accion }: {
  accion:
    | { tipo: 'exportar-ofertas' }
    | { tipo: 'importar-stock' }
    | { tipo: 'exportar-dif-stock'; accionId?: string }
    | { tipo: 'importar-clientes' }
    | { tipo: 'cargar-ventas' }
}) {
  switch (accion.tipo) {
    case 'exportar-ofertas':
      return <Button asChild variant="outline" size="sm"><Link href="/admin/centro-datos/exportar"><Download className="size-4" /> Exportar a SIFACO</Link></Button>
    case 'importar-stock':
      return <Button asChild variant="outline" size="sm"><Link href="/admin/centro-datos/importar?tipo=stock"><Upload className="size-4" /> Importar stock</Link></Button>
    case 'exportar-dif-stock':
      return <Button asChild variant="outline" size="sm"><Link href="/admin/centro-datos/exportar"><Download className="size-4" /> Exportar diferencias</Link></Button>
    case 'importar-clientes':
      return <Button asChild variant="outline" size="sm"><Link href="/admin/centro-datos/importar?tipo=clientes"><Upload className="size-4" /> Importar clientes</Link></Button>
    case 'cargar-ventas':
      return <Button asChild variant="outline" size="sm"><Link href="/admin/centro-datos/ventas-diarias"><Database className="size-4" /> Cargar ventas del día</Link></Button>
  }
}
