import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { ImportarSifacoClient } from './importar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Maestro de SIFACO' }

/**
 * LA CARGA DEL MAESTRO DE SIFACO.
 *
 * Es distinta de «Importaciones»: aquella sube el Excel diario por sucursal y
 * deduce ventas por diferencia de stock. Ésta trae el maestro completo de
 * productos —46.000 filas, 41 MB— que es de donde sale el catálogo.
 *
 * Dos pantallas y no una porque son dos frecuencias y dos dueños: el diario lo
 * sube alguien de la sucursal todos los días; el maestro lo trae quien puede
 * pedirle a SIFACO una exportación completa, y cuando cambia el catálogo.
 */
export default async function SifacoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'] })
  const sb = createClient()

  // ── LOS NÚMEROS PROPIOS ───────────────────────────────────────────────────
  //
  // Es la primera vez que el sistema tiene datos reales de los que hablar. Van
  // arriba de todo, y con la misma regla del aviso de demostración: hechos, no
  // adjetivos. «46.009 productos» se puede verificar; «catálogo completo» no.
  const [
    { count: productos }, { count: conStock }, { count: conCosto },
    { count: controlados }, { count: proveedores }, { count: barras },
    { count: demo },
  ] = await Promise.all([
    sb.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_demo', false),
    sb.from('producto_stock_sifaco').select('producto_id', { count: 'exact', head: true }).is('sucursal_id', null).gt('stock', 0),
    sb.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_demo', false).gt('precio_costo_promedio', 0),
    sb.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_controlado', true),
    sb.from('proveedores').select('id', { count: 'exact', head: true }).eq('es_drogueria', true),
    sb.from('producto_codigos_barras').select('codigo', { count: 'exact', head: true }),
    sb.from('productos_catalogo').select('id', { count: 'exact', head: true }).eq('es_demo', true),
  ])

  // Por la vista y no por la tabla: PostgREST devuelve 1000 filas y la tabla
  // tiene 598.117. Pedirle «los periodos distintos» leyendo filas devolvia uno
  // o dos, y la pantalla habria dicho «2 meses de ventas cargados» sin mentir a
  // proposito y sin que nadie lo pudiera notar.
  const { data: meses } = await sb
    .from('producto_ventas_periodos').select('periodo, parcial').order('periodo')
  const periodos = new Set((meses ?? []).map((m: any) => m.periodo))
  const parciales = new Set((meses ?? []).filter((m: any) => m.parcial).map((m: any) => m.periodo))

  const { data: previas } = await sb
    .from('sifaco_importaciones')
    .select('id, tipo, archivo_nombre, bytes, estado, codificacion, filas_cargadas, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <>
      <PageHeader
        title="Maestro de SIFACO"
        description="El archivo completo de productos. De acá sale el catálogo: descripción, código, barras, laboratorio, precio, costo y stock."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Maestro de SIFACO' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {(productos ?? 0) > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Lo que hay cargado</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Numero n={productos} t="productos" />
              <Numero n={conStock} t="con stock" />
              <Numero n={conCosto} t="con costo" />
              <Numero n={controlados} t="controlados" acento />
              <Numero n={proveedores} t="droguerías" />
              <Numero n={barras} t="códigos de barras" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {periodos.size} meses de ventas cargados
              {parciales.size > 0 && (
                <> — {[...parciales].sort().join(' y ')} {parciales.size === 1 ? 'está' : 'están'} marcado
                  {parciales.size === 1 ? '' : 's'} como parcial{parciales.size === 1 ? '' : 'es'} y no
                  {parciales.size === 1 ? ' entra' : ' entran'} en los promedios</>
              )}.
              {(demo ?? 0) > 0 && <> Quedan {demo} productos de demostración, dados de baja salvo los que
                usa alguna oferta real.</>}
            </p>
          </div>
        )}

        <ImportarSifacoClient />

        <div>
          <h2 className="mb-2 text-sm font-semibold">Importaciones anteriores</h2>
          {!previas?.length ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Todavía no se importó ningún maestro. Hasta que entre uno, el catálogo son los
              productos que haya cargados a mano.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Archivo</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-right">Filas</th>
                    <th className="px-3 py-2 text-left">Codificación</th>
                    <th className="px-3 py-2 text-left">Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {previas.map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{p.archivo_nombre}</td>
                      <td className="px-3 py-2">{p.estado}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(p.filas_cargadas ?? 0).toLocaleString('es-AR')}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.codificacion ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Numero({ n, t, acento }: { n: number | null; t: string; acento?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-xl font-semibold tabular-nums ${acento ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {(n ?? 0).toLocaleString('es-AR')}
      </div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </div>
  )
}
