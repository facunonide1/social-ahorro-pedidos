import Link from 'next/link'
import { Upload, Download, ShoppingBag, Layers, History, AlertCircle, ArrowRight, Database, Clock } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { FRECUENCIA_HORAS, FRECUENCIA_LABEL, type FrecuenciaDatos } from '@/lib/types/centro-datos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Centro de Datos' }

const SECCIONES = [
  { href: '/admin/centro-datos/importar', icon: Upload, title: 'Importar', desc: 'Subí archivos de SIFACO: productos, stock, ventas, clientes.', color: 'text-primary' },
  { href: '/admin/centro-datos/exportar', icon: Download, title: 'Exportar', desc: 'Generá archivos en el formato exacto que SIFACO espera.', color: 'text-mint-foreground' },
  { href: '/admin/centro-datos/ventas-diarias', icon: ShoppingBag, title: 'Ventas diarias', desc: 'Cargá las ventas del día por sucursal (fuente fina).', color: 'text-primary' },
  { href: '/admin/centro-datos/perfiles', icon: Layers, title: 'Perfiles', desc: 'Configurá el mapeo de columnas una vez y reusalo.', color: 'text-mint-foreground' },
  { href: '/admin/centro-datos/historial', icon: History, title: 'Historial', desc: 'Cada importación/exportación, con rollback.', color: 'text-primary' },
  { href: '/admin/centro-datos/sin-matchear', icon: AlertCircle, title: 'Sin matchear', desc: 'Cola de productos sin match: crear o vincular.', color: 'text-amber-500' },
]

function horasDesde(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

export default async function CentroDatosPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()

  const [{ data: ultimo }, { count: sinMatch }, { data: perfiles }] = await Promise.all([
    sb.from('import_jobs').select('archivo_nombre, created_at, filas_ok, estado, por_usuario_nombre').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('items_sin_match').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    sb.from('perfiles_datos').select('nombre, frecuencia, ultima_carga, direccion').eq('activo', true).eq('direccion', 'import').neq('frecuencia', 'manual'),
  ])

  // mejora 5: recordatorios de carga (perfiles con frecuencia vencida)
  const atrasados = ((perfiles ?? []) as any[]).filter((p) => {
    const limite = FRECUENCIA_HORAS[p.frecuencia as FrecuenciaDatos]
    if (limite == null) return false
    const h = horasDesde(p.ultima_carga)
    return h == null || h > limite
  })

  return (
    <>
      <PageHeader title="Centro de Datos" description="El puente bidireccional con SIFACO: importá y exportá por archivos."
        breadcrumbs={[{ label: 'Centro de Datos' }]} />
      <div className="space-y-5 p-4 md:p-6">
        {/* Estado / recordatorios */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="size-3.5" /> Última carga</div>
            {ultimo ? (
              <div className="mt-1">
                <div className="truncate text-sm font-medium">{ultimo.archivo_nombre ?? 'Importación'}</div>
                <div className="text-xs text-muted-foreground">{ultimo.filas_ok} filas · {new Date(ultimo.created_at).toLocaleString('es-AR')}</div>
              </div>
            ) : <div className="mt-1 text-sm text-muted-foreground">Sin cargas todavía</div>}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertCircle className="size-3.5" /> Sin matchear</div>
            <div className="mt-1 text-2xl font-semibold">{sinMatch ?? 0}</div>
            {(sinMatch ?? 0) > 0 && <Link href="/admin/centro-datos/sin-matchear" className="text-xs text-primary hover:underline">Resolver cola →</Link>}
          </div>
          <div className={`rounded-lg border p-4 ${atrasados.length ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card'}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-3.5" /> Recordatorios</div>
            {atrasados.length ? (
              <div className="mt-1 space-y-0.5">
                {atrasados.slice(0, 3).map((p, i) => (
                  <div key={i} className="text-xs"><span className="font-medium text-amber-600">{p.nombre}</span> · {FRECUENCIA_LABEL[p.frecuencia as FrecuenciaDatos].toLowerCase()} sin cargar</div>
                ))}
              </div>
            ) : <div className="mt-1 text-sm text-muted-foreground">Todo al día ✓</div>}
          </div>
        </div>

        {/* Secciones */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECCIONES.map((s) => {
            const SIcon = s.icon
            return (
              <Link key={s.href} href={s.href}
                className="group rounded-lg border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div className={`rounded-lg bg-muted/50 p-2 ${s.color}`}><SIcon className="size-5" /></div>
                  {s.title === 'Sin matchear' && (sinMatch ?? 0) > 0 && <Badge variant="secondary">{sinMatch}</Badge>}
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="mt-3 font-medium">{s.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
