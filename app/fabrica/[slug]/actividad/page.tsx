import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import {
  listarInstalaciones,
  listarVerificaciones,
  traerProyecto,
} from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Actividad' }

const VARIANTE: Record<string, 'success' | 'warning' | 'destructive'> = {
  coincide: 'success',
  difiere: 'warning',
  error: 'destructive',
}

export default async function ActividadPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const [verificaciones, instalaciones] = await Promise.all([
    listarVerificaciones(proyecto.id),
    listarInstalaciones(proyecto.id),
  ])
  const nombrePool = new Map(
    instalaciones.map((i) => [i.id, i.pool?.nombre ?? i.pool?.clave ?? '—']),
  )

  return (
    <div className="p-4 md:p-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Cada vez que la fábrica compara una declaración contra el código real,
        queda una fila acá. Una declaración que nadie verifica se pudre sola.
      </p>

      {verificaciones.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Sin verificaciones todavía.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cuándo</th>
                <th className="px-3 py-2">Pool</th>
                <th className="px-3 py-2">Resultado</th>
                <th className="px-3 py-2 text-right">Falta en código</th>
                <th className="px-3 py-2 text-right">Falta en declaración</th>
                <th className="px-3 py-2">Resumen</th>
              </tr>
            </thead>
            <tbody>
              {verificaciones.map((v) => (
                <tr key={v.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {String(v.verificado_at).slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {nombrePool.get(v.instalacion_id) ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={VARIANTE[v.resultado] ?? 'outline'} className="font-normal">
                      {v.resultado}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.faltan_en_codigo}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {v.faltan_en_declaracion}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{v.resumen ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
