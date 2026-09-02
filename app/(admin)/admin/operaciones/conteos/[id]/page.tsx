import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { AMBITO_TEXTO, type Ambito } from '@/lib/conteo/ambito'

import ResultadoClient from './resultado-client'

export const dynamic = 'force-dynamic'

const pesos = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

/**
 * El resultado de un conteo cerrado.
 *
 * Con hechos y montos, no adjetivos: nada de "buen resultado" ni semáforos. Y
 * ordenado por lo que cuesta la diferencia, no por SKU — lo que más pesa se lee
 * primero, que es para lo que sirve la pantalla.
 */
export default async function ConteoPage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'comprador', 'auditor'],
  })
  const sb = createClient()

  const { data: conteo } = await sb
    .from('cnt_conteos')
    .select(
      'id, estado, iniciado_at, cerrado_at, total_items, items_coinciden, items_diferencia, valor_diferencia, lista_id, punto_id',
    )
    .eq('id', params.id)
    .maybeSingle<{
      id: string
      estado: string
      iniciado_at: string
      cerrado_at: string | null
      total_items: number | null
      items_coinciden: number | null
      items_diferencia: number | null
      valor_diferencia: number | null
      lista_id: string
      punto_id: string | null
    }>()
  if (!conteo) redirect('/admin/operaciones/conteos')
  if (conteo.estado !== 'cerrado') redirect(`/admin/operaciones/conteos/${params.id}/contar`)

  const [{ data: lista }, { data: renglones }, { data: tareas }] = await Promise.all([
    sb
      .from('cnt_listas')
      .select('zona, ambito')
      .eq('id', conteo.lista_id)
      .maybeSingle<{ zona: string; ambito: Ambito }>(),
    sb
      .from('cnt_renglones')
      .select(
        'cantidad_contada, cantidad_esperada, diferencia, valor_diferencia, salteado, motivo_salteo, nota, cnt_lista_items(sku, descripcion)',
      )
      .eq('conteo_id', params.id),
    // Las tareas se leen de la base, no del resultado que devolvió el cierre:
    // así la pantalla dice lo que HAY, no lo que se pidió que hubiera.
    sb
      .from('tareas')
      .select('id, titulo, estado, tipos_tareas(codigo)')
      .eq('entidad_relacionada', 'conteo')
      .eq('entidad_id', params.id),
  ])

  type Fila = {
    cantidad_contada: number | null
    cantidad_esperada: number | null
    diferencia: number | null
    valor_diferencia: number | null
    salteado: boolean
    motivo_salteo: string | null
    nota: string | null
    cnt_lista_items: { sku: string | null; descripcion: string } | null
  }
  const filas = ((renglones ?? []) as unknown as Fila[]).sort(
    (a, b) => Math.abs(Number(b.valor_diferencia ?? 0)) - Math.abs(Number(a.valor_diferencia ?? 0)),
  )

  const ambito: Ambito = lista?.ambito ?? 'total'
  const conDif = filas.filter((f) => f.diferencia !== null && Number(f.diferencia) !== 0)
  const sinComparar = filas.filter((f) => f.diferencia === null)
  const mayor = conDif[0]

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title={`Conteo de ${lista?.zona ?? 'la zona'}`}
        description={
          conteo.cerrado_at
            ? `Cerrado el ${new Date(conteo.cerrado_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
            : undefined
        }
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/operaciones/conteos">Volver</Link>
          </Button>
        }
      />

      <Card className="space-y-2 p-4">
        <p className="text-base leading-relaxed">
          Contaste <b>{conteo.total_items ?? 0}</b> items.{' '}
          <b>{conteo.items_coinciden ?? 0}</b>{' '}
          {conteo.items_coinciden === 1 ? 'coincide' : 'coinciden'}.{' '}
          <b>{conteo.items_diferencia ?? 0}</b>{' '}
          {conteo.items_diferencia === 1 ? 'tiene diferencia' : 'tienen diferencia'}
          {Number(conteo.valor_diferencia ?? 0) !== 0
            ? `, por ${pesos(Math.abs(Number(conteo.valor_diferencia)))} en total`
            : ''}
          .
          {mayor ? (
            <>
              {' '}
              La más grande es <b>{mayor.cnt_lista_items?.descripcion}</b>: contaste{' '}
              {Number(mayor.cantidad_contada ?? 0)}, el sistema dice{' '}
              {Number(mayor.cantidad_esperada ?? 0)}.
            </>
          ) : null}
        </p>

        {/* CONTRA QUÉ SE MIDIÓ. Es lo primero que hay que saber para leer un
            faltante: los mismos items contados igual dan tres números distintos
            según el ámbito, y sin esta línea nadie sabe cuál está mirando. */}
        <p className="text-sm text-muted-foreground">
          Contaste <b>{AMBITO_TEXTO[ambito].corto}</b>. {AMBITO_TEXTO[ambito].consecuencia}
        </p>

        {sinComparar.length > 0 ? (
          <Alert>
            <AlertDescription className="text-sm">
              <b>{sinComparar.length} no se pudieron comparar</b> y no cuentan ni como
              coincidencia ni como diferencia: sin SKU en el catálogo o sin stock cargado
              en este punto, no hay contra qué comparar. Meterlos en «coinciden» sería
              decir que están bien sin haberlos mirado.
            </AlertDescription>
          </Alert>
        ) : null}
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Qué se abrió con esto</h2>
        {(tareas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna tarea: o no hubo diferencias que superaran el umbral, o el conteo se
            cerró antes de que existieran estas tareas.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {((tareas ?? []) as unknown as {
              id: string
              titulo: string
              estado: string
              tipos_tareas: { codigo: string } | null
            }[]).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 truncate">{t.titulo}</span>
                <Badge variant="outline">{t.estado}</Badge>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          NORA no ajusta stock: la corrección se hace en el sistema que manda, y que esté
          hecha lo confirma quien la hizo cerrando la tarea. Acá no se cierra solo.
        </p>
      </section>

      <ResultadoClient
        zona={lista?.zona ?? 'zona'}
        ambito={ambito}
        filas={filas.map((f) => ({
          sku: f.cnt_lista_items?.sku ?? null,
          descripcion: f.cnt_lista_items?.descripcion ?? '',
          contada: f.cantidad_contada,
          esperada: f.cantidad_esperada,
          diferencia: f.diferencia,
          valor: f.valor_diferencia,
          salteado: f.salteado,
          motivo: f.motivo_salteo,
          nota: f.nota,
        }))}
      />
    </div>
  )
}
