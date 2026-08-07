import Link from 'next/link'

import { createAdminClient } from '@/lib/supabase/server'
import { dossierProveedor } from '@/lib/documentos/dossier-proveedor'
import { formatARS } from '@/lib/utils/format'

/**
 * Historial de diferencias de un proveedor, en la ficha.
 *
 * Es lo que se lleva a una negociación: "en 90 días te reclamamos $X y
 * acreditaste $Y" pesa distinto que "siempre facturan de más".
 */
export async function DossierConciliaciones({ proveedorId }: { proveedorId: string }) {
  const adm = createAdminClient()
  const d = await dossierProveedor(adm, proveedorId)

  if (!d.conDiferencia && !d.montoReclamado) return null

  const pendiente = d.montoReclamado - d.montoRecuperado

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Conciliaciones · últimos {d.dias} días
      </h2>
      <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4">
        <Dato label="Con diferencia" valor={String(d.conDiferencia)} />
        <Dato label="Reclamado" valor={formatARS(d.montoReclamado)} />
        <Dato label="Recuperado" valor={formatARS(d.montoRecuperado)} />
        <Dato
          label="Sin acreditar"
          valor={formatARS(pendiente)}
          alerta={pendiente > 0}
        />
      </div>
      {d.reclamosAbiertos > 0 && (
        <p className="text-xs text-muted-foreground">
          {d.reclamosAbiertos} reclamo{d.reclamosAbiertos === 1 ? '' : 's'} sin cerrar.{' '}
          <Link href="/admin/compras/conciliaciones" className="text-primary hover:underline">Ver la bandeja →</Link>
        </p>
      )}
    </section>
  )
}

function Dato({ label, valor, alerta = false }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg tabular-nums ${alerta ? 'text-amber-600 dark:text-amber-400' : ''}`}>{valor}</div>
    </div>
  )
}
