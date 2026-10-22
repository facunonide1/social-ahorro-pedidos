import {
  FileSignature, ShieldAlert, Send, Ticket, Megaphone, TrendingDown,
} from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { formatARS } from '@/lib/utils/format'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Obras sociales' }

/**
 * OBRAS SOCIALES · LA ENTRADA DEL SECTOR.
 *
 * ── F.4 · POR QUÉ NINGÚN KPI ARRANCA EN CERO ────────────────────────────────
 *
 * Porque «$0 debitados» se lee como «no te debitaron nada», y lo que pasa es
 * que no entró ninguna liquidación. Los KPI van en null con el motivo
 * (`nota`), que es lo que hace `SectorKpi` desde la v0.85.
 *
 * Es el mismo error que la pantalla de Compliance cometió hasta la v0.86,
 * cuando decía «compliance en orden» con cero documentos cargados. Acá es peor
 * si se repite: la plata debitada que nadie cuenta es plata que se pierde.
 *
 * ── Y POR QUÉ LOS TOTALES DE LA CADENA SON DE LOS DUEÑOS ────────────────────
 *
 * F.2 · Un encargado ve su sucursal —la RLS se encarga— pero el total de la
 * cadena y la comparación entre sucursales son una lectura de dirección. Acá
 * se lee con el cliente de servicio porque es un tablero agregado: por eso el
 * alcance se decide con `getSucursalActiva()` y no se confía en la RLS.
 */
export default async function ConveniosPage() {
  const perfil = await requireAdminHubAccess()
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const esDueño = perfil.rol === 'super_admin' || perfil.rol === 'gerente'
  // Un encargado ve lo suyo, pase lo que pase el selector de sucursal.
  const alcance = perfil.sucursal_id ?? (esTodas || !sucursalId ? null : sucursalId)

  const { data: r } = await adm.rpc('convenios_resumen', { p_sucursal: alcance })
  const d = (r ?? {}) as any

  const convenios = Number(d.padron?.convenios ?? 0)
  const debitos = Number(d.debitos?.cantidad ?? 0)
  const hayPadron = convenios > 0
  const hayDebitos = debitos > 0

  const porVencer = Number(d.cierres?.por_vencer ?? 0)
  const sinAcuse = Number(d.presentaciones?.sin_acuse_troquel ?? 0)
  const reclamable = Number(d.reclamables?.plata ?? 0)
  const perdida = Number(d.reclamables?.plata_perdida ?? 0)
  const trimestre = Number(d.debitos?.ultimo_trimestre ?? 0)

  const kpis: SectorKpi[] = [
    {
      label: 'Debitado, último trimestre',
      value: hayDebitos ? formatARS(trimestre) : null,
      format: 'custom', formattedValue: hayDebitos ? formatARS(trimestre) : undefined,
      icon: TrendingDown,
      href: '/admin/convenios/debitos',
      nota: hayDebitos ? undefined
        : 'No entró ninguna liquidación. Eso NO quiere decir que no te hayan debitado: quiere decir que nadie los sumó. Lo que lo enciende es un archivo de débitos de un trimestre.',
    },
    {
      label: 'Reclamable sin reclamar',
      value: hayDebitos ? formatARS(reclamable) : null,
      format: 'custom', formattedValue: hayDebitos ? formatARS(reclamable) : undefined,
      icon: Megaphone,
      variant: reclamable > 0 ? 'warning' : 'default',
      href: '/admin/convenios/debitos',
      nota: hayDebitos ? undefined : 'Sin débitos cargados no hay nada que reclamar.',
      footer: hayDebitos && Number(d.reclamables?.vencen_en_7 ?? 0) > 0
        ? <>· {d.reclamables.vencen_en_7} vencen en 7 días</> : undefined,
    },
    {
      label: 'Se perdió por dejarlo vencer',
      value: hayDebitos ? formatARS(perdida) : null,
      format: 'custom', formattedValue: hayDebitos ? formatARS(perdida) : undefined,
      icon: TrendingDown,
      variant: perdida > 0 ? 'danger' : 'success',
      href: '/admin/convenios/debitos',
      nota: hayDebitos ? undefined
        : 'Es el número que este sector viene a mantener en cero: plata que era recuperable y venció.',
    },
    {
      label: 'Cierran pronto, sin armar',
      value: hayPadron ? porVencer : null,
      icon: Send,
      variant: porVencer > 0 ? 'warning' : 'default',
      href: '/admin/convenios/presentaciones',
      nota: hayPadron ? undefined : 'Sin padrón no hay cierres que calcular.',
    },
    {
      label: 'Enviadas sin acuse de troquel',
      value: hayPadron ? sinAcuse : null,
      icon: Ticket,
      variant: sinAcuse > 0 ? 'warning' : 'default',
      href: '/admin/convenios/troqueles',
      nota: hayPadron ? undefined : 'Sin presentaciones no hay troqueles que seguir.',
    },
    {
      label: 'Convenios sin saber qué exigen',
      value: hayPadron ? Number(d.padron?.sin_plazo ?? 0) : null,
      icon: ShieldAlert,
      variant: Number(d.padron?.sin_plazo ?? 0) > 0 ? 'warning' : 'default',
      href: '/admin/convenios/padron',
      nota: hayPadron ? undefined : 'No hay ningún convenio cargado.',
    },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Presentaciones', href: '/admin/convenios/presentaciones', icon: Send,
      descripcion: 'Lo que se le manda a cada obra social, por sucursal' },
    { label: 'Débitos', href: '/admin/convenios/debitos', icon: TrendingDown,
      descripcion: 'Lo que no pagaron, por qué, y cuánto se puede recuperar' },
    { label: 'Troqueles', href: '/admin/convenios/troqueles', icon: Ticket,
      descripcion: 'Qué falta mandar y qué falta acusar — desde el celular' },
    { label: 'Liquidaciones', href: '/admin/convenios/liquidaciones', icon: FileSignature,
      descripcion: 'Importar los débitos, por archivo o por foto' },
    { label: 'Padrón', href: '/admin/convenios/padron', icon: ShieldAlert,
      descripcion: 'Qué cubre cada convenio, en qué plazo se presenta y qué exige' },
  ]

  // La frase de NORA: una sola cosa, la que más plata mueve.
  const nora = !hayPadron
    ? <p><b>No puedo decir nada todavía.</b> No hay ningún convenio cargado, así que no puedo
        avisar antes de un cierre ni decir si un débito se puede reclamar. Lo que me enciende es la
        lista de obras sociales con las que trabajan y el plazo de presentación de cada una. Entre
        el 50% y el 70% de lo que se despacha pasa por una obra social.</p>
    : !hayDebitos
    ? <p>El padrón tiene {convenios} convenio(s){porVencer > 0 && <>, y <b>{porVencer}</b> cierran
        dentro de su plazo de aviso sin estar armados</>}. De débitos no puedo decir nada: no entró
        ninguna liquidación, y eso <b>no</b> quiere decir que no te hayan debitado — quiere decir
        que nadie los sumó. Un archivo de un trimestre alcanza para empezar.</p>
    : perdida > 0
    ? <p>🔴 Se perdieron <b>{formatARS(perdida)}</b> en débitos que eran recuperables y a los que se
        les venció el plazo de reclamo. {reclamable > 0 && <>Hay <b>{formatARS(reclamable)}</b> más
        que todavía se pueden reclamar.</>}</p>
    : reclamable > 0
    ? <p>Hay <b>{formatARS(reclamable)}</b> en débitos reclamables sin reclamar
        {Number(d.reclamables?.vencen_en_7 ?? 0) > 0 && <>, y {d.reclamables.vencen_en_7} vencen
        dentro de 7 días</>}. Un débito reclamable que vence no se pierde por no saberlo: se pierde
        por enterarse tarde.</p>
    : sinAcuse > 0
    ? <p>Hay <b>{sinAcuse}</b> presentación(es) enviadas sin el acuse del remito de troqueles
        guardado. Si esas obras sociales debitan por troquel faltante, no va a haber con qué
        reclamar.</p>
    : <p>{debitos} débito(s) cargados y ninguno reclamable sin reclamar.
        {Number(d.reclamables?.no_se_sabe ?? 0) > 0 && <> Quedan {d.reclamables.no_se_sabe} que no
        puedo clasificar: falta un dato y tiene que mirarlos una persona.</>}</p>

  return (
    <SectorDashboard
      title="Obras sociales"
      descripcion={esDueño
        ? 'Presentación y débitos: lo que pasa después de que SIFACO factura.'
        : 'Presentación y débitos de tu sucursal.'}
      breadcrumbs={[{ label: 'Obras sociales' }]}
      kpis={kpis} accesos={accesos} nora={nora}
    />
  )
}
