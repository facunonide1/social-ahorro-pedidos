'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, ExternalLink, History, ShieldAlert, Percent, MapPin } from 'lucide-react'
import { toast } from 'sonner'

import { EXIGENCIAS, type Exigencia } from '@/lib/convenios/padron'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type Cobertura = { id: string; categoria: string | null; condicion_venta: string | null; cobertura_pct: number; notas: string | null }
type Requisito = { id: string; exigencia: Exigencia; detalle: string | null; obligatorio: boolean; motivo_debito: string | null }
type Contacto = { id: string; nombre: string | null; rol: string | null; telefono: string | null; email: string | null; portal_url: string | null; direccion: string | null; principal: boolean }
type Hist = { id: string; campo: string; valor_anterior: string | null; valor_nuevo: string | null; desde: string; registrado_at: string }

const CAMPO_LABEL: Record<string, string> = {
  cobertura_general_pct: 'el porcentaje de cobertura',
  plazo_presentacion_dias: 'el plazo de presentación',
  plazo_pago_dias: 'el plazo de pago',
  troquel: 'el troquel que exige',
  periodicidad: 'cada cuánto se presenta',
  modo_presentacion: 'si se presenta por sucursal o consolidada',
  dia_cierre: 'el día de cierre',
  activo: 'si está activo',
}

async function post(body: any) {
  const r = await fetch('/api/convenios', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error ?? 'Error')
  return j
}

export function FichaClient({ convenio, cobertura, requisitos, contactos, historico, puedeEditar, puedeBorrar }: {
  convenio: any
  cobertura: Cobertura[]
  requisitos: Requisito[]
  contactos: Contacto[]
  historico: Hist[]
  puedeEditar: boolean
  puedeBorrar: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function hacer(body: any, ok: string) {
    setBusy(true)
    try { await post(body); toast.success(ok); router.refresh() }
    catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      {/* ── A.2 · QUÉ EXIGE ─────────────────────────────────────────────── */}
      <section className="space-y-2">
        <Encabezado icono={ShieldAlert} titulo="Qué exige"
          bajada="Son las reglas que después explican los débitos. Un débito con la regla al lado deja de ser una sorpresa." />

        {!requisitos.length ? (
          <Vacio texto="No hay ninguna exigencia cargada. Cuando llegue un débito de este convenio, el sistema va a poder decir cuánto y por qué, pero no contra qué regla se incumplió." />
        ) : (
          <div className="divide-y rounded-lg border">
            {requisitos.map((r) => {
              const e = EXIGENCIAS.find((x) => x.clave === r.exigencia)
              return (
                <div key={r.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{e?.label ?? r.exigencia}</span>
                      {!r.obligatorio && <Badge variant="secondary" className="text-[10px]">no obligatorio</Badge>}
                      {r.motivo_debito && (
                        <Badge variant="outline" className="text-[10px]">
                          debita como «{r.motivo_debito.replace(/_/g, ' ')}»
                        </Badge>
                      )}
                    </div>
                    {r.detalle && <p className="text-xs text-muted-foreground">{r.detalle}</p>}
                    {!r.detalle && e && <p className="text-xs text-muted-foreground">{e.que_es}</p>}
                  </div>
                  {puedeBorrar && (
                    <Button size="icon" variant="ghost" className="size-7" disabled={busy}
                      onClick={() => hacer({ accion: 'baja_requisito', id: r.id }, 'Exigencia borrada.')}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {puedeEditar && <AltaRequisito convenioId={convenio.id} onHecho={() => router.refresh()} />}
      </section>

      {/* ── A.1 · LA COBERTURA CUANDO VARÍA ─────────────────────────────── */}
      <section className="space-y-2">
        <Encabezado icono={Percent} titulo="Cobertura por tipo de producto"
          bajada={convenio.cobertura_general_pct != null
            ? `En general cubre el ${convenio.cobertura_general_pct}%. Acá van las excepciones.`
            : 'No está cargado el porcentaje general: lo que haya acá es lo único que se sabe.'} />

        {!cobertura.length ? (
          <Vacio texto={convenio.cobertura_general_pct != null
            ? 'Sin excepciones cargadas: se asume que cubre igual todo.'
            : 'No hay ningún porcentaje cargado, ni general ni por tipo. El sistema no puede calcular cuánto tendría que pagar este convenio.'} />
        ) : (
          <div className="divide-y rounded-lg border">
            {cobertura.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="font-medium tabular-nums">{Number(c.cobertura_pct)}%</span>
                <span className="text-muted-foreground">
                  {[c.categoria, c.condicion_venta].filter(Boolean).join(' · ') || 'todo'}
                </span>
                {c.notas && <span className="text-xs text-muted-foreground">{c.notas}</span>}
                {puedeBorrar && (
                  <Button size="icon" variant="ghost" className="ml-auto size-7" disabled={busy}
                    onClick={() => hacer({ accion: 'baja_cobertura', id: c.id }, 'Cobertura borrada.')}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {puedeEditar && <AltaCobertura convenioId={convenio.id} onHecho={() => router.refresh()} />}
      </section>

      {/* ── A.3 · DÓNDE SE PRESENTA ─────────────────────────────────────── */}
      <section className="space-y-2">
        <Encabezado icono={MapPin} titulo="Dónde se presenta y quién atiende"
          bajada="El portal es un link para abrir a mano. No hay integración con ningún portal de obra social." />

        {!contactos.length ? (
          <Vacio texto="No está cargado dónde se presenta. Es el dato que necesita el que arma la presentación por primera vez." />
        ) : (
          <div className="divide-y rounded-lg border">
            {contactos.map((k) => (
              <div key={k.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{k.nombre ?? 'Sin nombre'}</span>
                    {k.rol && <span className="text-xs text-muted-foreground">{k.rol}</span>}
                    {k.principal && <Badge variant="outline" className="text-[10px]">principal</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {k.telefono && <span>{k.telefono}</span>}
                    {k.email && <span>{k.email}</span>}
                    {k.direccion && <span>{k.direccion}</span>}
                  </div>
                  {k.portal_url && (
                    <a href={k.portal_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs hover:underline">
                      Abrir el portal <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                {puedeBorrar && (
                  <Button size="icon" variant="ghost" className="size-7" disabled={busy}
                    onClick={() => hacer({ accion: 'baja_contacto', id: k.id }, 'Contacto borrado.')}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {puedeEditar && <AltaContacto convenioId={convenio.id} onHecho={() => router.refresh()} />}
      </section>

      {/* ── A.4 · EL HISTÓRICO ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <Encabezado icono={History} titulo="Qué cambió"
          bajada="Un débito de hace cuatro meses se evalúa con la cobertura que estaba vigente entonces. Sin esto, cambiar un porcentaje reescribe el pasado." />

        {!historico.length ? (
          <Vacio texto={convenio.firmado_at
            ? `Firmado el ${convenio.firmado_at}. No cambió nada desde que se cargó.`
            : 'No cambió nada desde que se cargó, y no está cargada la fecha de firma.'} />
        ) : (
          <div className="space-y-1.5">
            {historico.map((h) => (
              <div key={h.id} className="text-xs leading-snug">
                <span className="text-muted-foreground">
                  {new Date(h.registrado_at).toLocaleDateString('es-AR')}
                </span>{' '}
                cambió <b>{CAMPO_LABEL[h.campo] ?? h.campo}</b>:{' '}
                <span className="text-muted-foreground">{h.valor_anterior ?? 'vacío'}</span>
                {' → '}
                <span>{h.valor_nuevo ?? 'vacío'}</span>
                {h.desde !== h.registrado_at.slice(0, 10) && (
                  <span className="text-muted-foreground"> (vigente desde {h.desde})</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Encabezado({ icono: Icono, titulo, bajada }: { icono: any; titulo: string; bajada: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icono className="size-3.5" /> {titulo}
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

function AltaRequisito({ convenioId, onHecho }: { convenioId: string; onHecho: () => void }) {
  const [exigencia, setExigencia] = useState<Exigencia>('troquel')
  const [detalle, setDetalle] = useState('')
  const [busy, setBusy] = useState(false)
  const e = EXIGENCIAS.find((x) => x.clave === exigencia)!

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap gap-2">
        <Select value={exigencia} onValueChange={(v) => setExigencia(v as Exigencia)}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EXIGENCIAS.map((x) => <SelectItem key={x.clave} value={x.clave}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="flex-1" value={detalle} onChange={(ev) => setDetalle(ev.target.value)}
          placeholder="Qué pide exactamente, en palabras del convenio" />
        <Button disabled={busy} onClick={async () => {
          setBusy(true)
          try {
            await post({ accion: 'alta_requisito', convenio_id: convenioId, exigencia, detalle, motivo_debito: e.motivo })
            toast.success('Exigencia cargada.'); setDetalle(''); onHecho()
          } catch (err: any) { toast.error(err?.message ?? 'Falló.') } finally { setBusy(false) }
        }}>
          <Plus className="size-4" /> Agregar
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {e.que_es} Cuando no se cumple, el débito entra como <b>«{e.motivo.replace(/_/g, ' ')}»</b>.
      </p>
    </div>
  )
}

function AltaCobertura({ convenioId, onHecho }: { convenioId: string; onHecho: () => void }) {
  const [f, setF] = useState({ categoria: '', condicion_venta: '', cobertura_pct: '' })
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-3">
      <Input className="w-full sm:w-40" value={f.categoria} placeholder="Categoría"
        onChange={(e) => setF({ ...f, categoria: e.target.value })} />
      <Input className="w-full sm:w-44" value={f.condicion_venta} placeholder="Condición de venta"
        onChange={(e) => setF({ ...f, condicion_venta: e.target.value })} />
      <Input className="w-24" type="number" value={f.cobertura_pct} placeholder="%"
        onChange={(e) => setF({ ...f, cobertura_pct: e.target.value })} />
      <Button disabled={busy} onClick={async () => {
        setBusy(true)
        try {
          await post({ accion: 'alta_cobertura', convenio_id: convenioId, ...f })
          toast.success('Cobertura cargada.'); setF({ categoria: '', condicion_venta: '', cobertura_pct: '' }); onHecho()
        } catch (err: any) { toast.error(err?.message ?? 'Falló.') } finally { setBusy(false) }
      }}>
        <Plus className="size-4" /> Agregar
      </Button>
    </div>
  )
}

function AltaContacto({ convenioId, onHecho }: { convenioId: string; onHecho: () => void }) {
  const [f, setF] = useState({ nombre_contacto: '', rol: '', telefono: '', email: '', portal_url: '', direccion: '' })
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-3">
      <Input className="w-full sm:w-40" value={f.nombre_contacto} placeholder="Nombre"
        onChange={(e) => setF({ ...f, nombre_contacto: e.target.value })} />
      <Input className="w-full sm:w-32" value={f.rol} placeholder="Rol"
        onChange={(e) => setF({ ...f, rol: e.target.value })} />
      <Input className="w-full sm:w-36" value={f.telefono} placeholder="Teléfono"
        onChange={(e) => setF({ ...f, telefono: e.target.value })} />
      <Input className="w-full sm:w-44" value={f.email} placeholder="Email"
        onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Input className="flex-1" value={f.portal_url} placeholder="URL del portal o dirección"
        onChange={(e) => setF({ ...f, portal_url: e.target.value })} />
      <Button disabled={busy} onClick={async () => {
        setBusy(true)
        try {
          await post({ accion: 'alta_contacto', convenio_id: convenioId, ...f })
          toast.success('Contacto cargado.')
          setF({ nombre_contacto: '', rol: '', telefono: '', email: '', portal_url: '', direccion: '' }); onHecho()
        } catch (err: any) { toast.error(err?.message ?? 'Falló.') } finally { setBusy(false) }
      }}>
        <Plus className="size-4" /> Agregar
      </Button>
    </div>
  )
}
