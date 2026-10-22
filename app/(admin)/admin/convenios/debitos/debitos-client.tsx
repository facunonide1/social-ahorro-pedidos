'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileDown, Megaphone, ListChecks, Scale, Tags } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import {
  type DebitoFila, type PorMotivo, type PorSucursal, type Situacion,
  SITUACION_TEXTO, ESTADO_DEBITO_LABEL, loQueDiceLaDiferencia,
} from '@/lib/convenios/debitos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Motivo = {
  clave: string; nombre: string; reclamable: 'si' | 'no' | 'depende'
  plazo_reclamo_dias: number | null; que_es: string; que_hacer: string; depende_de: string | null
}
type ConvLite = { id: string; nombre: string }

async function post(body: any) {
  const r = await fetch('/api/convenios/debitos', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error ?? 'Error')
  return j
}

export function DebitosClient({
  debitos, truncado, porMotivo, porSucursal, motivos, convenios, esDueño, miSucursal, puedeEditar,
}: {
  debitos: DebitoFila[]
  truncado: boolean
  porMotivo: PorMotivo[]
  porSucursal: PorSucursal[]
  motivos: Motivo[]
  convenios: ConvLite[]
  esDueño: boolean
  miSucursal: string | null
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [cargar, setCargar] = useState(false)
  const [reclamando, setReclamando] = useState<DebitoFila | null>(null)
  const [busy, setBusy] = useState(false)

  // Las sumas por situación. Se calculan sobre las filas que ya vinieron de la
  // vista; si la lista está truncada se dice, porque entonces el total miente.
  const porSituacion = useMemo(() => {
    const m = new Map<Situacion, { n: number; plata: number }>()
    for (const d of debitos) {
      const k = d.situacion
      const a = m.get(k) ?? { n: 0, plata: 0 }
      m.set(k, { n: a.n + 1, plata: a.plata + Number(d.importe) })
    }
    return m
  }, [debitos])

  const total = debitos.reduce((a, d) => a + Number(d.importe), 0)
  const perdido = porSituacion.get('se perdio por dejarlo vencer')
  const recuperable = porSituacion.get('reclamable y sin reclamar')
  const sinSaber = porSituacion.get('no se puede saber')

  // ── F.4 · LA PANTALLA VACÍA BIEN HECHA ──────────────────────────────────
  if (!debitos.length && !porMotivo.length) {
    return (
      <div className="max-w-2xl space-y-3 rounded-lg border border-dashed p-5">
        <h2 className="font-medium">No hay ningún débito cargado.</h2>
        <p className="text-sm leading-snug text-muted-foreground">
          Eso <b>no</b> quiere decir que la obra social no te haya debitado nada. Quiere decir que
          no entró ninguna liquidación al sistema. Una farmacia puede estar perdiendo del 3% al 8%
          de su facturación en débitos que nunca reclamó, y lo que hace que se pierdan es
          exactamente esto: que nadie los sume.
        </p>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Lo que lo enciende:</p>
          <p className="leading-snug text-muted-foreground">
            Un <b>archivo de débitos de un trimestre</b>. No hace falta que tenga un formato
            determinado: el importador lee los nombres de columna que se usan habitualmente, muestra
            qué columnas entendió y deja confirmar antes de guardar nada.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/admin/convenios/liquidaciones">Importar una liquidación</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── EL NÚMERO QUE IMPORTA ───────────────────────────────────────── */}
      <section className="space-y-2 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{formatARS(total)}</span>
          <span className="text-sm text-muted-foreground">
            debitados en los últimos 90 días · {debitos.length} débitos
          </span>
        </div>

        <div className="grid gap-2 pt-1 sm:grid-cols-3">
          <Dato titulo="Se puede recuperar"
            valor={recuperable ? formatARS(recuperable.plata) : formatARS(0)}
            detalle={recuperable
              ? `${recuperable.n} débito(s) reclamables y sin reclamar. Si nadie los reclama se pierden solos.`
              : 'Ningún débito reclamable sin reclamar.'}
            riesgo={!!recuperable} />
          <Dato titulo="Se perdió por dejarlo vencer"
            valor={perdido ? formatARS(perdido.plata) : formatARS(0)}
            detalle={perdido
              ? `${perdido.n} débito(s) que eran recuperables y a los que se les venció el plazo.`
              : 'Ninguno venció sin reclamar. Es el número que este sector viene a mantener en cero.'}
            riesgo={!!perdido} />
          <Dato titulo="No se puede saber"
            valor={sinSaber ? formatARS(sinSaber.plata) : formatARS(0)}
            detalle={sinSaber
              ? `${sinSaber.n} débito(s) donde falta un dato para decidir. No es que no se puedan reclamar: es que nadie los miró.`
              : 'Todos los débitos están clasificados.'}
            riesgo={false} />
        </div>

        {truncado && (
          <p className="text-xs text-amber-700 dark:text-amber-500">
            La lista está cortada por el tope de seguridad del paginado: estos totales son de lo
            que se trajo, no de todo lo que hay.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => exportar(debitos)}>
            <FileDown className="size-4" /> Exportar .xlsx
          </Button>
          {puedeEditar && (
            <Button size="sm" onClick={() => setCargar(true)}>Cargar un débito</Button>
          )}
        </div>
      </section>

      {/* ── C.7 · POR MOTIVO, ORDENADO POR PLATA ────────────────────────── */}
      <section className="space-y-2">
        <Titulo icono={Tags} texto="Por motivo, ordenado por plata"
          bajada="Es la pregunta que importa: cuál es el motivo que más se lleva. Por eso el motivo es un catálogo y no texto libre — escrito a mano de nueve formas, esta tabla no existiría." />
        {!porMotivo.length ? (
          <Vacio texto="Sin débitos cargados no hay motivos que ordenar." />
        ) : (
          <div className="divide-y rounded-lg border">
            {porMotivo.map((m) => (
              <div key={m.motivo} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.motivo_nombre}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {m.reclamable === 'si' ? 'se reclama'
                      : m.reclamable === 'no' ? 'no se reclama' : 'depende'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{m.cantidad} débitos</span>
                  <span className="ml-auto text-base font-semibold tabular-nums">
                    {formatARS(m.plata)}
                  </span>
                </div>
                <p className="text-xs leading-snug text-muted-foreground">{m.que_hacer}</p>
                {(m.plata_recuperada > 0 || m.plata_perdida > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {m.plata_recuperada > 0 && <>Recuperado: <b>{formatARS(m.plata_recuperada)}</b>. </>}
                    {m.plata_perdida > 0 && <>Perdido: <b>{formatARS(m.plata_perdida)}</b>.</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── C.3 · POR SUCURSAL, SÓLO PARA DIRECCIÓN ─────────────────────── */}
      {esDueño && (
        <section className="space-y-2">
          <Titulo icono={Scale} texto="Por sucursal"
            bajada="Si una sucursal tiene el triple de débitos por el mismo motivo, hay dónde mirar. El sistema muestra el número: no acusa a nadie." />
          {!porSucursal.length ? (
            <Vacio texto="Sin débitos cargados no hay comparación posible." />
          ) : (
            <div className="divide-y rounded-lg border">
              {porSucursal.map((p, i) => {
                const frase = loQueDiceLaDiferencia(p)
                return (
                  <div key={i} className="space-y-0.5 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{p.sucursal}</span>
                      <span className="text-muted-foreground">{p.motivo_nombre}</span>
                      <span className="text-xs text-muted-foreground">{p.cantidad} débitos</span>
                      {p.veces_el_promedio != null && (
                        <Badge variant={p.veces_el_promedio >= 1.5 ? 'destructive' : 'outline'}
                          className="text-[10px]">
                          {p.veces_el_promedio.toFixed(1)}× el promedio
                        </Badge>
                      )}
                      <span className="ml-auto tabular-nums">{formatARS(p.plata)}</span>
                    </div>
                    {p.veces_el_promedio == null && (
                      <p className="text-[11px] text-muted-foreground">
                        Es la única sucursal con este motivo: no hay con qué comparar.
                      </p>
                    )}
                    {frase && <p className="text-xs leading-snug text-muted-foreground">{frase}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── LOS DÉBITOS, UNO POR UNO ────────────────────────────────────── */}
      <section className="space-y-2">
        <Titulo icono={ListChecks} texto={`Los débitos (${debitos.length})`}
          bajada="Cada uno con lo que el sistema puede decir sobre si se reclama, y por qué." />
        <div className="divide-y rounded-lg border">
          {debitos.map((d) => {
            const s = SITUACION_TEXTO[d.situacion] ?? { label: d.situacion, que_significa: '', riesgo: 'medio' as const }
            return (
              <div key={d.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{d.motivo_nombre}</span>
                  <span className="text-xs text-muted-foreground">{d.convenio}</span>
                  <span className="text-xs text-muted-foreground">{d.sucursal}</span>
                  <Badge variant={s.riesgo === 'alto' ? 'destructive' : 'outline'} className="text-[10px]">
                    {s.label}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {ESTADO_DEBITO_LABEL[d.estado]}
                  </Badge>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatARS(Number(d.importe))}
                  </span>
                </div>
                <p className="text-xs leading-snug text-muted-foreground">
                  {d.por_que}
                  {d.vence_at && d.dias != null && (
                    <> {Number(d.dias) >= 0
                      ? <>Vence el {d.vence_at}, en {d.dias} días.</>
                      : <>Venció el {d.vence_at}.</>}</>
                  )}
                </p>
                {puedeEditar && d.estado === 'abierto' && d.reclamable !== 'false' && (
                  <Button size="sm" variant="outline" className="mt-1"
                    onClick={() => setReclamando(d)}>
                    <Megaphone className="size-3.5" /> Reclamar
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <HojaCargar abierto={cargar} setAbierto={setCargar} motivos={motivos}
        convenios={convenios} miSucursal={miSucursal} />
      <HojaReclamar debito={reclamando} onCerrar={() => setReclamando(null)} />
    </div>
  )

  function exportar(filas: DebitoFila[]) {
    // F.3 · con todo lo que hace falta para reclamar. Sin paciente ni médico.
    exportExcel('debitos-obras-sociales', filas.map((d) => ({
      'Obra social': d.convenio, Sucursal: d.sucursal,
      Motivo: d.motivo_nombre, Importe: Number(d.importe),
      'Fecha de liquidación': d.fecha_liquidacion,
      Estado: ESTADO_DEBITO_LABEL[d.estado], Situación: d.situacion,
      '¿Se reclama?': d.reclamable === 'true' ? 'sí' : d.reclamable === 'false' ? 'no' : 'no se puede saber',
      'Por qué': d.por_que,
      'Vence el': d.vence_at ?? '',
    })), { sheet: 'Débitos' })
  }
}

function Dato({ titulo, valor, detalle, riesgo }: {
  titulo: string; valor: string; detalle: string; riesgo: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${riesgo ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{titulo}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{detalle}</p>
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

function HojaCargar({ abierto, setAbierto, motivos, convenios, miSucursal }: {
  abierto: boolean; setAbierto: (v: boolean) => void
  motivos: Motivo[]; convenios: ConvLite[]; miSucursal: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    convenio_id: '', motivo: 'troquel_faltante', importe: '',
    fecha_liquidacion: new Date().toISOString().slice(0, 10),
    motivo_texto_original: '', notas: '',
  })
  const m = motivos.find((x) => x.clave === f.motivo)

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Cargar un débito</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <Campo label="Obra social">
            <Select value={f.convenio_id} onValueChange={(v) => setF({ ...f, convenio_id: v })}>
              <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
              <SelectContent>
                {convenios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          <Campo label="Motivo"
            ayuda={m ? `${m.que_es} ${m.que_hacer}` : undefined}>
            <Select value={f.motivo} onValueChange={(v) => setF({ ...f, motivo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {motivos.map((x) => <SelectItem key={x.clave} value={x.clave}>{x.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          {f.motivo === 'otro' && (
            <Campo label="Qué decía el papel"
              ayuda="Se guarda tal cual. No se le inventa un motivo para que encaje: mientras nadie lo lea, el sistema va a decir que no sabe si es reclamable.">
              <Input value={f.motivo_texto_original}
                onChange={(e) => setF({ ...f, motivo_texto_original: e.target.value })} />
            </Campo>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Importe">
              <Input type="number" value={f.importe}
                onChange={(e) => setF({ ...f, importe: e.target.value })} />
            </Campo>
            <Campo label="Fecha de liquidación"
              ayuda={m?.plazo_reclamo_dias ? `El plazo de reclamo corre desde acá: ${m.plazo_reclamo_dias} días.` : undefined}>
              <Input type="date" value={f.fecha_liquidacion}
                onChange={(e) => setF({ ...f, fecha_liquidacion: e.target.value })} />
            </Campo>
          </div>

          {!miSucursal && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              No tenés una sucursal asignada, así que el débito se va a cargar sin sucursal y la
              base lo va a rechazar: la sucursal es obligatoria. Cargalo desde el importador de
              liquidaciones, que la pide.
            </p>
          )}

          <Button size="lg" className="w-full" disabled={busy || !miSucursal}
            onClick={async () => {
              setBusy(true)
              try {
                const j = await post({ accion: 'cargar', sucursal_id: miSucursal, ...f })
                toast.success('Débito cargado.', {
                  description: j?.tarea?.ok
                    ? `Es reclamable: se creó la tarea ${j.tarea.tarea_codigo}, vence el ${j.tarea.vence_at}.`
                    : j?.tarea?.motivo,
                })
                setAbierto(false); router.refresh()
              } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
            }}>
            {busy && <Loader2 className="size-4 animate-spin" />} Cargar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function HojaReclamar({ debito, onCerrar }: { debito: DebitoFila | null; onCerrar: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ como: 'portal', que_se_dijo: '' })

  return (
    <Sheet open={!!debito} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Reclamar {debito ? formatARS(Number(debito.importe)) : ''}</SheetTitle></SheetHeader>
        {debito && (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-snug text-muted-foreground">
              {debito.convenio} · {debito.motivo_nombre}. {debito.por_que}
            </p>

            <Campo label="Por dónde">
              <Select value={f.como} onValueChange={(v) => setF({ ...f, como: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="mail">Mail</SelectItem>
                  <SelectItem value="papel">Papel</SelectItem>
                  <SelectItem value="telefono">Teléfono</SelectItem>
                </SelectContent>
              </Select>
            </Campo>

            <Campo label="Qué se dijo"
              ayuda="Lo que se mandó y con qué respaldo. Sirve el día que haya que recordar qué se había reclamado.">
              <Input value={f.que_se_dijo} onChange={(e) => setF({ ...f, que_se_dijo: e.target.value })} />
            </Campo>

            <p className="text-[11px] leading-snug text-muted-foreground">
              El reclamo queda <b>abierto</b> hasta que alguien lo cierre con lo que contestaron.
              Si no contestan, el resultado es «sin respuesta» — que lo elige una persona y no es lo
              mismo que dejarlo abierto para siempre.
            </p>

            <Button size="lg" className="w-full" disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const j = await post({ accion: 'reclamar', debito_id: debito.id, ...f })
                  toast.success('Reclamo registrado.', { description: j?.aviso ?? undefined })
                  onCerrar(); router.refresh()
                } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
              }}>
              {busy && <Loader2 className="size-4 animate-spin" />} Registrar el reclamo
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {ayuda && <p className="text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
