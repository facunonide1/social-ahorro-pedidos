'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Send, Loader2, Ticket, Camera, Check, FileDown, Inbox, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { EXCLUSIONES, type MotivoExclusion, ESTADO_LABEL } from '@/lib/convenios/presentaciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Comp = {
  id: string; numero: string; fecha: string
  importe_total: number; importe_cobertura: number | null; importe_particular: number | null
  estado: string; motivo_exclusion: MotivoExclusion | null; exclusion_detalle: string | null
}
type Troquel = {
  id: string; cantidad: number | null; remito_numero: string | null; transporte: string | null
  enviado_at: string | null; foto_remito_url: string | null
  acuse_at: string | null; acuse_foto_url: string | null
}

const BUCKET = 'convenios-troqueles'

async function post(url: string, body: any) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error ?? 'Error')
  return j
}

export function PresentacionClient({
  pres, adentro, sueltos, afuera, truncado, troqueles, puedeEditar,
}: {
  pres: any
  adentro: Comp[]; sueltos: Comp[]; afuera: Comp[]
  truncado: boolean
  troqueles: Troquel[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState<MotivoExclusion>('falta_troquel')
  const [detalle, setDetalle] = useState('')

  const enviada = ['enviada', 'liquidada', 'cerrada'].includes(pres.estado)
  const total = adentro.reduce((a, c) => a + Number(c.importe_cobertura ?? c.importe_total), 0)

  const toggle = (id: string) => setSel((p) => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function hacer(fn: () => Promise<any>, ok: string) {
    setBusy(true)
    try {
      const j = await fn()
      toast.success(ok, { description: j?.aviso ?? j?.control ?? undefined })
      setSel(new Set()); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  // F.3 · Export con todo lo que hace falta para reclamar. Sin paciente ni
  // médico: lo que se reclama es un comprobante, no una persona.
  function exportar() {
    exportExcel(`presentacion-${pres.convenios?.nombre ?? 'os'}-${pres.periodo_desde}`,
      adentro.map((c) => ({
        'Obra social': pres.convenios?.nombre ?? '',
        Sucursal: pres.sucursales?.nombre ?? '',
        Período: `${pres.periodo_desde} a ${pres.periodo_hasta}`,
        'N° comprobante': c.numero,
        Fecha: c.fecha,
        'Importe total': Number(c.importe_total),
        'A cargo de la obra social': c.importe_cobertura == null ? '' : Number(c.importe_cobertura),
        'A cargo particular': c.importe_particular == null ? '' : Number(c.importe_particular),
        Estado: c.estado,
      })), { sheet: 'Presentación' })
  }

  return (
    <div className="space-y-6">
      {/* ── EL ENCABEZADO ───────────────────────────────────────────────── */}
      <section className="space-y-2 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{formatARS(total)}</span>
          <Badge variant={enviada ? 'default' : 'outline'} className="text-[10px]">
            {ESTADO_LABEL[pres.estado as keyof typeof ESTADO_LABEL]}
          </Badge>
          {pres.fecha_envio && (
            <span className="text-xs text-muted-foreground">enviada el {pres.fecha_envio}</span>
          )}
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          Son {adentro.length} comprobante{adentro.length === 1 ? '' : 's'}, sumando lo que cubre la
          obra social. El total lo calcula la base desde los comprobantes: no se tipea, así no puede
          no cuadrar.
        </p>
        {truncado && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            Hay más comprobantes de los que se trajeron: la lista está cortada por el tope de
            seguridad del paginado. El total de esta pantalla no es el total real.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={exportar} disabled={!adentro.length}>
            <FileDown className="size-4" /> Exportar .xlsx
          </Button>
          {puedeEditar && !enviada && (
            <Button size="sm" disabled={busy || !adentro.length}
              onClick={() => hacer(
                () => post('/api/convenios/presentaciones', { accion: 'enviar', presentacion_id: pres.id }),
                'Presentación enviada. Se generó la tarea de control.')}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Marcar como enviada
            </Button>
          )}
          {pres.tarea_control_id && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/admin/tareas?tarea=${pres.tarea_control_id}`}>Ver la tarea de control</Link>
            </Button>
          )}
        </div>

        {!enviada && !adentro.length && (
          <p className="text-xs leading-snug text-muted-foreground">
            No se puede enviar vacía: mandar una presentación sin comprobantes es perder el período
            entero.
          </p>
        )}
      </section>

      {/* ── B.4 · LOS TROQUELES ─────────────────────────────────────────── */}
      <Troqueles presId={pres.id} troqueles={troqueles} convenioTroquel={pres.convenios?.troquel}
        puedeEditar={puedeEditar} onHecho={() => router.refresh()} />

      {/* ── B.2 · LO QUE ENTRA ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <Titulo icono={Check} texto={`Lo que entra (${adentro.length})`}
          bajada="Número, fecha e importes. Sin paciente, sin médico, sin diagnóstico: una presentación es un hecho administrativo." />
        {!adentro.length ? (
          <Vacio texto="Todavía no entró ningún comprobante. Los que estén sueltos aparecen más abajo para agregarlos." />
        ) : (
          <Tabla comps={adentro} sel={sel} toggle={puedeEditar && !enviada ? toggle : undefined} />
        )}

        {puedeEditar && !enviada && sel.size > 0 && adentro.some((c) => sel.has(c.id)) && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Sacar {sel.size} de la presentación, porque…
              </Label>
              <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoExclusion)}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXCLUSIONES.map((e) => <SelectItem key={e.clave} value={e.clave}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input className="flex-1" value={detalle} placeholder="Detalle (opcional)"
              onChange={(e) => setDetalle(e.target.value)} />
            <Button variant="outline" disabled={busy}
              onClick={() => hacer(() => post('/api/convenios/presentaciones', {
                accion: 'excluir', presentacion_id: pres.id,
                comprobante_ids: [...sel], motivo, detalle,
              }), 'Sacados de la presentación, con el motivo.')}>
              <XCircle className="size-4" /> Sacar
            </Button>
            <p className="w-full text-[11px] leading-snug text-muted-foreground">
              {EXCLUSIONES.find((e) => e.clave === motivo)?.que_es} No se borran: quedan en la lista
              de abajo para que se pueda preguntar por qué no se presentaron.
            </p>
          </div>
        )}
      </section>

      {/* ── LO QUE ESTÁ SUELTO ──────────────────────────────────────────── */}
      {!enviada && (
        <section className="space-y-2">
          <Titulo icono={Inbox} texto={`Sin presentar (${sueltos.length})`}
            bajada="Comprobantes de esta obra social y esta sucursal que todavía no entraron a ninguna presentación." />
          {!sueltos.length ? (
            <Vacio texto="No queda ninguno suelto. Los comprobantes entran al sistema con el importador o cargados a mano." />
          ) : (
            <>
              <Tabla comps={sueltos} sel={sel} toggle={puedeEditar ? toggle : undefined} />
              {puedeEditar && sueltos.some((c) => sel.has(c.id)) && (
                <Button disabled={busy}
                  onClick={() => hacer(() => post('/api/convenios/presentaciones', {
                    accion: 'incluir', presentacion_id: pres.id, comprobante_ids: [...sel],
                  }), 'Agregados a la presentación.')}>
                  Agregar {[...sel].length} a la presentación
                </Button>
              )}
            </>
          )}
        </section>
      )}

      {/* ── B.3 · LO QUE QUEDÓ AFUERA ───────────────────────────────────── */}
      <section className="space-y-2">
        <Titulo icono={XCircle} texto={`Quedó afuera (${afuera.length})`}
          bajada="Con el motivo. No desaparecen: si desaparecieran, nadie podría preguntar por qué no se presentaron." />
        {!afuera.length ? (
          <Vacio texto="No quedó ningún comprobante afuera." />
        ) : (
          <div className="divide-y rounded-lg border">
            {afuera.map((c) => {
              const e = EXCLUSIONES.find((x) => x.clave === c.motivo_exclusion)
              return (
                <div key={c.id} className="space-y-0.5 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{c.numero}</code>
                    <span className="text-xs text-muted-foreground">{c.fecha}</span>
                    <Badge variant="outline" className="text-[10px]">{e?.label ?? c.motivo_exclusion}</Badge>
                    <span className="ml-auto tabular-nums">{formatARS(Number(c.importe_total))}</span>
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {c.exclusion_detalle || e?.que_es}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Titulo({ icono: Icono, texto, bajada }: { icono: any; texto: string; bajada: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icono className="size-3.5" /> {texto}
      </h2>
      <p className="text-xs leading-snug text-muted-foreground">{bajada}</p>
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed p-3 text-xs leading-snug text-muted-foreground">
      {texto}
    </p>
  )
}

function Tabla({ comps, sel, toggle }: {
  comps: Comp[]; sel: Set<string>; toggle?: (id: string) => void
}) {
  return (
    <div className="divide-y rounded-lg border">
      {comps.map((c) => (
        <label key={c.id}
          className={`flex items-center gap-3 p-2.5 text-sm ${toggle ? 'cursor-pointer hover:bg-muted/40' : ''}`}>
          {toggle && <Checkbox checked={sel.has(c.id)} onCheckedChange={() => toggle(c.id)} />}
          <code className="text-xs">{c.numero}</code>
          <span className="text-xs text-muted-foreground">{c.fecha}</span>
          <span className="ml-auto tabular-nums">
            {formatARS(Number(c.importe_cobertura ?? c.importe_total))}
          </span>
          {c.importe_cobertura != null && Number(c.importe_cobertura) !== Number(c.importe_total) && (
            <span className="text-[11px] text-muted-foreground">
              de {formatARS(Number(c.importe_total))}
            </span>
          )}
        </label>
      ))}
    </div>
  )
}

/**
 * B.4 · LOS TROQUELES, CON FOTO.
 *
 * El remito y el acuse se cargan de pie, en el mostrador, con el sobre en la
 * mano. Botones de 48px y la cámara directo: `capture="environment"` abre la
 * cámara de atrás en un celular sin pasar por la galería.
 */
function Troqueles({ presId, troqueles, convenioTroquel, puedeEditar, onHecho }: {
  presId: string; troqueles: Troquel[]; convenioTroquel: string | null
  puedeEditar: boolean; onHecho: () => void
}) {
  const sb = createClient()
  const [f, setF] = useState({ cantidad: '', remito_numero: '', transporte: '' })
  const [foto, setFoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function subir(file: File, cual: 'remito' | 'acuse', troquelId?: string) {
    setBusy(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${presId}/${cual}-${Date.now()}.${ext}`
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (error) throw new Error(error.message)
      if (cual === 'remito') { setFoto(path); toast.success('Foto del remito lista.') }
      else {
        await post('/api/convenios/troqueles', { accion: 'acusar', id: troquelId, acuse_foto_url: path })
        toast.success('Acuse guardado con la foto.'); onHecho()
      }
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo subir.') } finally { setBusy(false) }
  }

  const sinAcuse = troqueles.filter((t) => !t.acuse_at)

  return (
    <section className="space-y-2">
      <Titulo icono={Ticket} texto="Troqueles"
        bajada="Lo que define si un débito es reclamable. Un débito por troquel faltante contra un remito con acuse se reclama con una foto; sin acuse, no hay con qué discutir." />

      {convenioTroquel === 'ninguno' && (
        <p className="text-xs text-muted-foreground">
          Este convenio no pide troquel, así que no debería debitar por eso.
        </p>
      )}

      {!troqueles.length ? (
        <Vacio texto="No hay ningún envío de troqueles registrado para esta presentación." />
      ) : (
        <div className="divide-y rounded-lg border">
          {troqueles.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <code className="text-xs">{t.remito_numero ?? 'sin remito'}</code>
              {t.cantidad != null && <span className="text-xs text-muted-foreground">{t.cantidad} troqueles</span>}
              {t.transporte && <span className="text-xs text-muted-foreground">{t.transporte}</span>}
              {t.enviado_at && <span className="text-xs text-muted-foreground">salió el {t.enviado_at}</span>}
              {t.foto_remito_url
                ? <Badge variant="outline" className="text-[10px]">con foto del remito</Badge>
                : <Badge variant="outline" className="text-[10px] text-amber-700">sin foto</Badge>}
              {t.acuse_at
                ? <Badge className="text-[10px]">acuse del {t.acuse_at}</Badge>
                : <Badge variant="outline" className="text-[10px] text-amber-700">sin acuse</Badge>}

              {puedeEditar && !t.acuse_at && (
                <label className="ml-auto">
                  <input type="file" accept="image/*,.pdf" capture="environment" className="hidden"
                    onChange={(e) => { const x = e.target.files?.[0]; if (x) subir(x, 'acuse', t.id) }} />
                  <Button asChild size="sm" variant="outline" className="h-12">
                    <span><Camera className="size-4" /> Cargar el acuse</span>
                  </Button>
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {sinAcuse.length > 0 && (
        <p className="text-xs leading-snug text-amber-700 dark:text-amber-500">
          Hay {sinAcuse.length} envío(s) sin acuse. El acuse se consigue al momento; cuando llegue el
          débito ya no se puede pedir.
        </p>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">N° de remito</Label>
            <Input className="h-12 w-full sm:w-40" value={f.remito_numero}
              onChange={(e) => setF({ ...f, remito_numero: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cantidad</Label>
            <Input className="h-12 w-24" type="number" inputMode="numeric" value={f.cantidad}
              onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Transporte</Label>
            <Input className="h-12 w-full sm:w-40" value={f.transporte}
              onChange={(e) => setF({ ...f, transporte: e.target.value })} />
          </div>
          <label>
            <input type="file" accept="image/*,.pdf" capture="environment" className="hidden"
              onChange={(e) => { const x = e.target.files?.[0]; if (x) subir(x, 'remito') }} />
            <Button asChild size="lg" variant="outline" className="h-12">
              <span><Camera className="size-4" /> {foto ? 'Foto lista' : 'Foto del remito'}</span>
            </Button>
          </label>
          <Button size="lg" className="h-12" disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const j = await post('/api/convenios/troqueles', {
                  accion: 'enviar', presentacion_id: presId, ...f, foto_remito_url: foto,
                })
                toast.success('Envío de troqueles registrado.', { description: j?.aviso ?? undefined })
                setF({ cantidad: '', remito_numero: '', transporte: '' }); setFoto(null); onHecho()
              } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
            }}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Ticket className="size-4" />}
            Registrar envío
          </Button>
        </div>
      )}
    </section>
  )
}
