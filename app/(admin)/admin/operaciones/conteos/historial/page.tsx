import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { itemsQueRepiten, zonasEnElTiempo } from '@/lib/conteo/historial'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import HistorialClient from './historial-client'

export const dynamic = 'force-dynamic'

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

/**
 * Cómo viene cada zona, y qué items repiten.
 *
 * La pantalla existe para una sola pregunta: ¿esto mejora? Y para poder
 * contestarla sin mentir, tiene que distinguir la zona que se contó y dio bien
 * de la que nadie contó nunca. Son los dos ceros que no son el mismo cero.
 */
export default async function HistorialPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'comprador', 'auditor'],
  })

  const [zonas, items] = await Promise.all([zonasEnElTiempo(), itemsQueRepiten(2)])
  const nuncaContadas = zonas.filter((z) => z.estado === 'nunca_contada')
  const conConteos = zonas.filter((z) => z.estado !== 'nunca_contada')

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Historial de conteos"
        description="Una diferencia aislada es ruido. La misma tres veces es un dato."
      />

      {zonas.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No hay zonas cargadas todavía.
        </Card>
      ) : null}

      {nuncaContadas.length > 0 ? (
        <Alert>
          <AlertDescription className="text-sm">
            <b>{nuncaContadas.length} zona(s) sin contar nunca</b>: {nuncaContadas.map((z) => z.zona).join(', ')}.
            No aparecen abajo con cero diferencias porque no tienen cero diferencias —
            no se sabe cuántas tienen. Es la distinción que hace que este tablero sirva.
          </AlertDescription>
        </Alert>
      ) : null}

      {conConteos.length === 0 && zonas.length > 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Ninguna zona se contó todavía, así que no hay nada que comparar. Este panel se
          llena con el primer cierre.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {conConteos.map((z) => (
            <Card key={z.listaId} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{z.zona}</p>
                  <p className="text-xs text-muted-foreground">
                    {z.items} item(s){z.punto ? ` · ${z.punto}` : ''} · {z.conteos} conteo(s)
                  </p>
                </div>
                <Badge
                  variant={
                    z.tendencia === 'mejora' ? 'secondary' : z.tendencia === 'empeora' ? 'destructive' : 'outline'
                  }
                >
                  {z.tendencia === 'sin_datos' ? 'un solo conteo' : z.tendencia}
                </Badge>
              </div>
              <p className="text-sm">
                Último: {z.ultimoConDiferencia} con diferencia
                {z.ultimoValor ? `, por ${pesos(Math.abs(z.ultimoValor))}` : ''}.
              </p>
              {z.ultimosValores.length >= 2 ? (
                <p className="text-xs text-muted-foreground">
                  Últimos {z.ultimosValores.length}: {z.ultimosValores.map((v) => pesos(v)).join(' → ')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Con un solo conteo no hay tendencia: hace falta otro para saber si mejora.
                </p>
              )}
              {z.frecuencia ? (
                <p className="text-xs text-muted-foreground">
                  Frecuencia declarada: {z.frecuencia} ·{' '}
                  {z.programada ? 'programada' : 'la programación está apagada'}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <HistorialClient zonas={zonas} items={items} />
    </div>
  )
}
