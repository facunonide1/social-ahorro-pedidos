'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VisorDocumento } from '@/components/documentos/visor-documento'
import { desglosarDiferencia, ivaDiscriminado, type TotalesDoc } from '@/lib/documentos/precios'
import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

type Prov = { id: string; razon_social: string; cuit: string }
type Suc = { id: string; nombre: string }
type Prod = { id: string; sku: string; nombre: string }
type Candidato = { itemId: string; sku: string; nombre: string; score: number; via: string }

type Linea = {
  nroLinea: number
  descripcionLeida: string
  codigoTercero: string | null
  itemId: string | null
  matchEstado: 'automatico' | 'sugerido' | 'sin_match' | 'manual' | 'ignorado'
  confianza: number | null
  candidatos: Candidato[]
  cantidad: number | null
  precioUnitario: number | null
  totalLinea: number | null
  unidad: string | null
  descuentoPct: number | null
  alicuotaIva: number | null
}

type Cabecera = {
  tipo: string
  letra: string
  numero: string
  punto_venta: string
  fecha_emision: string
  fecha_vencimiento: string
  tercero_id: string
  tercero_ident_fiscal: string
  tercero_nombre_leido: string
  unidad_negocio_id: string
  subtotal: string
  impuestos: string
  percepciones: string
  total: string
}

/** Cuán seguro estaba el modelo de cada campo. Baja o nula = hay que mirarla. */
function nivelConfianza(v: number | undefined | null): 'alta' | 'media' | 'baja' {
  if (v == null) return 'alta'
  if (v >= 0.85) return 'alta'
  if (v >= 0.6) return 'media'
  return 'baja'
}

export function RevisionClient({
  extraccionId,
  estadoInicial,
  errorInicial,
  imagenUrl,
  esPdf,
  proveedores,
  sucursales,
  productos,
  loteId = null,
  siguienteId = null,
  progreso = null,
}: {
  extraccionId: string
  estadoInicial: string
  errorInicial: string | null
  imagenUrl: string | null
  esPdf: boolean
  proveedores: Prov[]
  sucursales: Suc[]
  productos: Prod[]
  loteId?: string | null
  siguienteId?: string | null
  progreso?: { hechas: number; total: number } | null
}) {
  const router = useRouter()
  const [fase, setFase] = useState<'leyendo' | 'error' | 'revisando' | 'guardando'>(
    estadoInicial === 'error' ? 'error' : 'leyendo',
  )
  const [error, setError] = useState<string | null>(errorInicial)
  const [cab, setCab] = useState<Cabecera | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [dudosos, setDudosos] = useState<Record<string, number>>({})
  const [terceroSinMatch, setTerceroSinMatch] = useState(false)
  /** El cuadro de totales del pie, tal como lo leyó el modelo. */
  const [totales, setTotales] = useState<TotalesDoc>({})
  /** Local: crece si se da de alta un proveedor sin salir de la pantalla. */
  const [provs, setProvs] = useState<Prov[]>(proveedores)

  const leer = useCallback(async () => {
    setFase('leyendo')
    setError(null)
    try {
      const r = await fetch(`/api/documentos/${extraccionId}/extraer`, { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (!r.ok) { setFase('error'); setError(j?.error ?? 'No pude leer el documento.'); return }

      const d = j.datos
      const t = d.totales ?? {}
      setTotales(t)
      setDudosos(j.camposDudosos ?? {})
      setTerceroSinMatch(j.tercero?.estado !== 'encontrado')
      setCab({
        tipo: d.tipo ?? 'factura',
        letra: d.letra ?? 'A',
        numero: d.numero ?? '',
        punto_venta: d.punto_venta ?? '',
        fecha_emision: d.fecha_emision ?? '',
        fecha_vencimiento: d.fecha_vencimiento ?? '',
        tercero_id: j.tercero?.estado === 'encontrado' ? j.tercero.terceroId : '',
        tercero_ident_fiscal: d.emisor?.identificacion_fiscal ?? '',
        tercero_nombre_leido: d.emisor?.nombre ?? '',
        unidad_negocio_id: '',
        subtotal: t.subtotal != null ? String(t.subtotal) : '',
        impuestos: t.impuestos != null ? String(t.impuestos) : '',
        percepciones: t.percepciones != null ? String(t.percepciones) : '',
        total: t.total != null ? String(t.total) : '',
      })
      setLineas(
        (j.lineas ?? []).map((l: any, i: number) => {
          const src = d.lineas?.[i] ?? {}
          return {
            nroLinea: l.nroLinea,
            descripcionLeida: l.descripcionLeida,
            codigoTercero: l.codigoTercero,
            itemId: l.itemId,
            matchEstado: l.matchEstado,
            confianza: l.confianza,
            candidatos: l.candidatos ?? [],
            cantidad: src.cantidad ?? null,
            precioUnitario: src.precio_unitario ?? null,
            totalLinea: src.total_linea ?? null,
            unidad: src.unidad ?? null,
            descuentoPct: src.descuento_pct ?? null,
            alicuotaIva: src.alicuota_iva ?? null,
          }
        }),
      )
      setFase('revisando')
    } catch {
      setFase('error')
      setError('Se cortó la conexión mientras leía el documento.')
    }
  }, [extraccionId])

  useEffect(() => {
    if (estadoInicial !== 'error') void leer()
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendientes = lineas.filter((l) => !l.itemId && l.matchEstado !== 'ignorado').length
  const sumaLineas = lineas
    .filter((l) => l.matchEstado !== 'ignorado')
    .reduce((a, l) => a + (l.totalLinea ?? 0), 0)

  // El total editable de la cabecera manda: si alguien lo corrigió mirando el
  // papel, el desglose tiene que usar ese, no el que leyó el modelo.
  const desglose = useMemo(
    () => desglosarDiferencia(sumaLineas, { ...totales, total: Number(cab?.total ?? 0) || null }),
    [sumaLineas, totales, cab?.total],
  )

  const faltantes = useMemo(() => {
    if (!cab) return []
    const f: string[] = []
    if (!cab.tercero_id) f.push('el proveedor')
    if (!cab.unidad_negocio_id) f.push('la sucursal compradora')
    if (!cab.numero) f.push('el número')
    if (!cab.fecha_emision) f.push('la fecha de emisión')
    return f
  }, [cab])

  const puedeConfirmar = fase === 'revisando' && !faltantes.length && pendientes === 0

  async function confirmar() {
    if (!cab) return
    setFase('guardando')
    try {
      const r = await fetch(`/api/documentos/${extraccionId}/confirmar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cabecera: { ...cab, iva_discriminado: ivaDiscriminado(cab.letra) },
          // El cuadro del pie va entero: el servidor lo necesita para resolver
          // la alícuota de los renglones que no la traen y derivar los dos precios.
          totales: { ...totales, total: Number(cab.total) || null },
          lineas: lineas.map((l) => ({
            nro_linea: l.nroLinea,
            codigo_tercero: l.codigoTercero,
            descripcion_leida: l.descripcionLeida,
            cantidad: l.cantidad,
            unidad: l.unidad,
            precio_unitario: l.precioUnitario,
            descuento_pct: l.descuentoPct,
            alicuota_iva: l.alicuotaIva,
            total_linea: l.totalLinea,
            item_id: l.itemId,
            match_estado: l.matchEstado,
            match_confianza: l.confianza,
          })),
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { toast.error(j?.error ?? 'No pude guardar el documento.'); setFase('revisando'); return }
      toast.success(j?.vinculada_existente ? 'Documento vinculado a la factura que ya existía.' : 'Documento confirmado y cargado a pagar.')

      // En un lote se encadena: revisar 18 facturas volviendo al listado entre
      // cada una es lo que hace que nadie las cargue.
      if (siguienteId) {
        router.push(`/admin/finanzas/documentos/revision/${siguienteId}?lote=${loteId}`)
        return
      }
      if (loteId) {
        toast.success('Terminaste el lote.')
        router.push('/admin/finanzas/documentos')
        return
      }
      router.push('/admin/finanzas/documentos')
    } catch {
      toast.error('Se cortó la conexión al guardar.')
      setFase('revisando')
    }
  }

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <VisorDocumento url={imagenUrl} esPdf={esPdf} />
      </div>

      <div className="space-y-4">
        {fase === 'leyendo' && (
          <div className="flex items-start gap-3 rounded-lg border border-border p-6">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
            <div>
              <div className="font-medium">Leyendo el documento…</div>
              <p className="mt-1 text-sm text-muted-foreground">Puede tardar hasta un minuto si la factura es larga.</p>
            </div>
          </div>
        )}

        {fase === 'error' && (
          <div className="rounded-lg border border-border p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
              <div>
                <div className="font-medium">No pude leer este documento</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error ?? 'Probá con una foto más nítida, derecha y con buena luz.'}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-4" onClick={leer}><RefreshCw className="size-4" /> Intentar de nuevo</Button>
          </div>
        )}

        {cab && (fase === 'revisando' || fase === 'guardando') && (
          <>
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Encabezado</div>

              {terceroSinMatch && !cab.tercero_id && (
                <AltaProveedor
                  extraccionId={extraccionId}
                  cuitLeido={cab.tercero_ident_fiscal}
                  nombreLeido={cab.tercero_nombre_leido}
                  onListo={(p) => {
                    setProvs((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p]))
                    setCab((c) => (c ? { ...c, tercero_id: p.id } : c))
                    setTerceroSinMatch(false)
                  }}
                />
              )}

              <Campo label="Proveedor *" alerta={!cab.tercero_id}>
                <Select value={cab.tercero_id} onValueChange={(v) => setCab({ ...cab, tercero_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Elegí el proveedor" /></SelectTrigger>
                  <SelectContent>
                    {provs.map((p) => <SelectItem key={p.id} value={p.id}>{p.razon_social} · {p.cuit}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo label="Sucursal compradora *" alerta={!cab.unidad_negocio_id} ayuda="Define a qué sucursal se le imputa la compra.">
                <Select value={cab.unidad_negocio_id} onValueChange={(v) => setCab({ ...cab, unidad_negocio_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Elegí la sucursal" /></SelectTrigger>
                  <SelectContent>
                    {sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Tipo">
                  <Select value={cab.tipo} onValueChange={(v) => setCab({ ...cab, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['factura', 'remito', 'nota_credito', 'nota_debito'].map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo
                  label="Letra"
                  ayuda={ivaDiscriminado(cab.letra)
                    ? 'A/M: los precios de los renglones son sin IVA.'
                    : 'B/C: los precios de los renglones ya traen el IVA adentro.'}
                >
                  <Input value={cab.letra} onChange={(e) => setCab({ ...cab, letra: e.target.value.toUpperCase() })} maxLength={1} />
                </Campo>
                <Campo label="Punto de venta" conf={nivelConfianza(dudosos['punto_venta'])}><Input value={cab.punto_venta} onChange={(e) => setCab({ ...cab, punto_venta: e.target.value })} /></Campo>
                <Campo label="Número *" alerta={!cab.numero} conf={nivelConfianza(dudosos['numero'])}><Input value={cab.numero} onChange={(e) => setCab({ ...cab, numero: e.target.value })} /></Campo>
                <Campo label="Emisión *" alerta={!cab.fecha_emision} conf={nivelConfianza(dudosos['fecha_emision'])}><Input type="date" value={cab.fecha_emision} onChange={(e) => setCab({ ...cab, fecha_emision: e.target.value })} /></Campo>
                <Campo label="Vencimiento"><Input type="date" value={cab.fecha_vencimiento} onChange={(e) => setCab({ ...cab, fecha_vencimiento: e.target.value })} /></Campo>
                <Campo label="Subtotal"><Input value={cab.subtotal} onChange={(e) => setCab({ ...cab, subtotal: e.target.value })} /></Campo>
                <Campo label="IVA"><Input value={cab.impuestos} onChange={(e) => setCab({ ...cab, impuestos: e.target.value })} /></Campo>
                <Campo label="Percepciones"><Input value={cab.percepciones} onChange={(e) => setCab({ ...cab, percepciones: e.target.value })} /></Campo>
                <Campo label="Total" conf={nivelConfianza(dudosos['total'])}><Input value={cab.total} onChange={(e) => setCab({ ...cab, total: e.target.value })} /></Campo>
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Renglones ({lineas.length})</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {lineas.filter((l) => l.matchEstado === 'automatico').length} automáticos ·{' '}
                  {lineas.filter((l) => l.matchEstado === 'sugerido').length} sugeridos ·{' '}
                  {lineas.filter((l) => l.matchEstado === 'sin_match').length} sin match
                </span>
              </div>
              <div className="divide-y divide-border">
                {lineas.map((l, i) => (
                  <LineaFila key={i} linea={l} productos={productos} onChange={(p) => setLinea(i, p)} />
                ))}
              </div>
            </div>

            {!!desglose.total && <Cuadre desglose={desglose} />}

            {(!!faltantes.length || pendientes > 0) && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Para confirmar falta: {[
                  faltantes.length ? faltantes.join(', ') : null,
                  pendientes ? `resolver ${pendientes} renglón${pendientes === 1 ? '' : 'es'}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            )}

            {/* `puedeConfirmar` ya exige fase 'revisando', así que cubre el guardando. */}
            <Button size="lg" className="w-full" disabled={!puedeConfirmar} onClick={confirmar}>
              {fase === 'guardando'
                ? <><Loader2 className="size-4 animate-spin" /> Guardando…</>
                : <><Check className="size-4" /> {siguienteId ? 'Confirmar y pasar a la siguiente' : 'Confirmar y cargar a pagar'}</>}
            </Button>

            {progreso && progreso.total > 1 && (
              <p className="text-center text-[11px] text-muted-foreground">
                {progreso.hechas} de {progreso.total} confirmadas
                {siguienteId ? ' · al confirmar seguís con la próxima' : ' · esta es la última'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Alta de proveedor sin salir de la revisión, precargada con lo que se leyó.
 *
 * Antes, si el CUIT no matcheaba, la pantalla quedaba trabada: no dejaba
 * confirmar y no ofrecía salida. Mandar a la persona a Compras a dar de alta el
 * proveedor y volver es perder la carga a mitad de camino.
 *
 * Requiere confirmación explícita — nunca se crea solo. Y el servidor vuelve a
 * chequear el CUIT: si ya existe con otro nombre, lo vincula en vez de duplicar.
 */
function AltaProveedor({
  extraccionId,
  cuitLeido,
  nombreLeido,
  onListo,
}: {
  extraccionId: string
  cuitLeido: string
  nombreLeido: string
  onListo: (p: Prov) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    razon_social: nombreLeido ?? '',
    cuit: cuitLeido ?? '',
    condicion_iva: 'responsable_inscripto',
    domicilio_fiscal: '',
  })

  async function crear() {
    setBusy(true)
    try {
      const r = await fetch('/api/documentos/proveedor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, extraccion_id: extraccionId }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) { toast.error(j?.error ?? 'No pude crear el proveedor.'); return }
      // Si el CUIT ya existía con otro nombre, el servidor vincula en vez de duplicar.
      toast[j.estado === 'vinculado' ? 'info' : 'success'](j.mensaje)
      onListo(j.proveedor)
      setAbierto(false)
    } catch {
      toast.error('Se cortó la conexión al crear el proveedor.')
    } finally {
      setBusy(false)
    }
  }

  if (!abierto) {
    return (
      <div className="rounded-md bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-300">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            No reconocí el CUIT {cuitLeido || '(no se leyó)'} — en el papel dice “{nombreLeido || 'sin nombre'}”.
            Elegilo de la lista si ya está cargado con otro nombre.
          </span>
        </div>
        <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={() => setAbierto(true)}>
          <Plus className="size-3.5" /> Crear proveedor nuevo
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nuevo proveedor</div>
      <p className="text-[11px] text-muted-foreground">
        Precargado con lo que dice la factura. Verificá el CUIT antes de crear.
      </p>
      <Campo label="Razón social *"><Input value={f.razon_social} onChange={(e) => setF({ ...f, razon_social: e.target.value })} /></Campo>
      <Campo label="CUIT *"><Input value={f.cuit} onChange={(e) => setF({ ...f, cuit: e.target.value })} placeholder="30-12345678-9" /></Campo>
      <Campo label="Condición frente al IVA">
        <Select value={f.condicion_iva} onValueChange={(v) => setF({ ...f, condicion_iva: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {['responsable_inscripto', 'monotributo', 'exento', 'consumidor_final'].map((c) => (
              <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Domicilio fiscal"><Input value={f.domicilio_fiscal} onChange={(e) => setF({ ...f, domicilio_fiscal: e.target.value })} /></Campo>
      <p className="text-[10px] text-muted-foreground">
        Se crea con lo mínimo. El resto (contactos, banco, plazos) se completa en Compras.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !f.razon_social.trim() || !f.cuit.trim()} onClick={crear}>
          {busy ? <><Loader2 className="size-3.5 animate-spin" /> Creando…</> : <><Check className="size-3.5" /> Crear y usar</>}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  )
}

/**
 * Por qué los renglones no suman el total.
 *
 * Decir "hay $261.232 de diferencia" asusta y no ayuda. Decir "el IVA explica
 * $228.578, la percepción IIBB $32.654, no queda nada sin explicar" convierte
 * el susto en la confirmación de que la lectura estuvo bien.
 */
function Cuadre({ desglose }: { desglose: ReturnType<typeof desglosarDiferencia> }) {
  const ok = desglose.cuadra
  return (
    <div className={cn(
      'rounded-md px-3 py-2.5 text-xs',
      ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
    )}>
      <div className="flex items-center gap-1.5 font-medium">
        {ok ? <Check className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
        {ok ? 'Los números cierran' : 'Hay una diferencia sin explicar'}
      </div>

      <dl className="mt-2 space-y-0.5 tabular-nums">
        <Fila label="Renglones" monto={desglose.sumaLineas} />
        {desglose.partes.map((p, i) => <Fila key={i} label={p.concepto} monto={p.monto} signo />)}
        <div className="!mt-1.5 flex justify-between border-t border-current/20 pt-1.5 font-medium">
          <dt>Total de la factura</dt>
          <dd>{formatARS(desglose.total)}</dd>
        </div>
        {!ok && (
          <div className="flex justify-between font-medium">
            <dt>Sin explicar</dt>
            <dd>{formatARS(desglose.sinExplicar)}</dd>
          </div>
        )}
      </dl>

      {!ok && (
        <p className="mt-2 border-t border-current/20 pt-2">
          Puede ser una bonificación al pie, un renglón que no se leyó o un IVA que
          quedó afuera. Revisá contra el papel — podés confirmar igual si el total
          es el correcto.
        </p>
      )}
    </div>
  )
}

function Fila({ label, monto, signo = false }: { label: string; monto: number; signo?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="truncate opacity-80">{label}</dt>
      <dd className="shrink-0">{signo && monto > 0 ? '+ ' : ''}{formatARS(monto)}</dd>
    </div>
  )
}

function LineaFila({ linea, productos, onChange }: { linea: Linea; productos: Prod[]; onChange: (p: Partial<Linea>) => void }) {
  const [buscando, setBuscando] = useState(false)
  const [q, setQ] = useState('')
  const prod = linea.itemId ? productos.find((p) => p.id === linea.itemId) : null
  const ignorada = linea.matchEstado === 'ignorado'

  const resultados = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return productos.filter((p) => `${p.sku} ${p.nombre}`.toLowerCase().includes(t)).slice(0, 8)
  }, [q, productos])

  return (
    <div className={cn('space-y-2 p-3', ignorada && 'opacity-50')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{linea.descripcionLeida}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {linea.codigoTercero && <span className="font-mono">{linea.codigoTercero} · </span>}
            {linea.cantidad ?? '—'} × {linea.precioUnitario != null ? formatARS(linea.precioUnitario) : '—'}
            {linea.totalLinea != null && <> = <b>{formatARS(linea.totalLinea)}</b></>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(ignorada ? { matchEstado: 'sin_match' } : { matchEstado: 'ignorado', itemId: null })}
          className="shrink-0 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent"
          title={ignorada ? 'Volver a incluir' : 'Ignorar este renglón (flete, envase, redondeo)'}
        >
          {ignorada ? 'Incluir' : <X className="size-3.5" />}
        </button>
      </div>

      {!ignorada && (
        <>
          {prod ? (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs">
              <Check className="size-3.5 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-[10px] text-muted-foreground">{prod.sku}</span> {prod.nombre}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {linea.matchEstado === 'automatico' ? 'automático' : 'elegido'}
              </span>
              <button type="button" onClick={() => onChange({ itemId: null, matchEstado: 'sin_match' })} className="shrink-0 text-[10px] underline">cambiar</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {!!linea.candidatos.length && (
                <div className="flex flex-wrap gap-1.5">
                  {linea.candidatos.map((c) => (
                    <button
                      key={c.itemId}
                      type="button"
                      onClick={() => onChange({ itemId: c.itemId, matchEstado: 'manual', confianza: c.score })}
                      className="rounded-full border border-border px-2.5 py-1 text-left text-[11px] hover:border-primary/50 hover:bg-accent"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">{c.sku}</span> {c.nombre}
                      <span className="ml-1 text-[10px] text-muted-foreground">{Math.round(c.score * 100)}%</span>
                    </button>
                  ))}
                </div>
              )}
              {buscando ? (
                <div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU o nombre…" className="h-8 pl-8 text-xs" />
                  </div>
                  {!!resultados.length && (
                    <div className="mt-1 space-y-0.5">
                      {resultados.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { onChange({ itemId: p.id, matchEstado: 'manual', confianza: null }); setBuscando(false); setQ('') }}
                          className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span> {p.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setBuscando(true)} className="text-[11px] text-primary underline">
                  Buscar en el catálogo
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Campo({
  label,
  children,
  conf = 'alta',
  alerta = false,
  ayuda,
}: {
  label: string
  children: React.ReactNode
  conf?: 'alta' | 'media' | 'baja'
  alerta?: boolean
  ayuda?: string
}) {
  return (
    <div className="space-y-1">
      <Label className={cn(
        'text-[10px] uppercase tracking-wider',
        alerta ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}>
        {label}
        {conf === 'media' && <span className="ml-1 normal-case text-amber-600 dark:text-amber-400">· verificá</span>}
        {conf === 'baja' && <span className="ml-1 normal-case text-rose-600 dark:text-rose-400">· no lo leí bien</span>}
      </Label>
      {children}
      {ayuda && <p className="text-[10px] text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
