'use client'

import { useState } from 'react'
import { Upload, Loader2, AlertTriangle, Check, Info, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { leerArchivoDeCaja, type LecturaDeCaja } from '@/lib/caja/leer-archivo'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const CRUCE: Record<string, { t: string; pregunta: string }> = {
  cierre_vs_tickets: {
    t: 'El cierre contra los tickets',
    pregunta: '¿Lo que declaró el cierre es lo que dicen los tickets?',
  },
  fuerte_vs_cierres: {
    t: 'La caja fuerte contra los cierres',
    pregunta: '¿Entró a la caja fuerte lo que los cierres declararon haber mandado?',
  },
  retiros_vs_pagos: {
    t: 'Los retiros contra los pagos',
    pregunta: '¿Cada retiro de la caja fuerte tiene un pago que lo justifique?',
  },
}

export function ControlCajaClient({ sucursales, config, abiertas, miSucursal, rol }: {
  sucursales: any[]; config: any[]; abiertas: any[]
  miSucursal: string | null; rol: string
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [sucursal, setSucursal] = useState(miSucursal ?? sucursales[0]?.id ?? '')
  const [leyendo, setLeyendo] = useState<'tickets' | 'ventas' | null>(null)
  const [lecturas, setLecturas] = useState<Record<string, LecturaDeCaja>>({})
  const [corriendo, setCorriendo] = useState(false)
  const [cruces, setCruces] = useState<any[] | null>(null)
  const [dif, setDif] = useState<any[]>(abiertas)
  const [error, setError] = useState<string | null>(null)

  const cfg = config.find((c) => c.sucursal_id === sucursal)
  const sucNombre = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? 'esa sucursal'

  async function elegir(tipo: 'tickets' | 'ventas', f: File | null) {
    if (!f) return
    setLeyendo(tipo); setError(null)
    try {
      const l = await leerArchivoDeCaja(f)
      setLecturas((p) => ({ ...p, [tipo]: l }))
      if (l.total === null) {
        toast.warning(`No se encontró una columna de importe en ${f.name}. Mirá qué columnas trae.`)
      }
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el archivo.')
    } finally { setLeyendo(null) }
  }

  async function correr() {
    setCorriendo(true); setError(null)
    try {
      // Cada archivo leído se manda con su propio llamado: si uno falla, el otro
      // ya quedó guardado y no hay que volver a subirlo.
      for (const tipo of ['tickets', 'ventas'] as const) {
        const l = lecturas[tipo]
        if (!l) continue
        const r = await fetch('/api/caja/control', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo, fecha, sucursal_id: sucursal,
            nombre: l.nombre, hash: l.hash, filas: l.filas,
            total: l.total, total_efectivo: l.efectivo,
            total_tarjetas: l.tarjetas, total_otros: l.otros,
            columnas: l.columnas,
          }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? 'No se pudo subir el archivo.')
        setCruces(j.cruces ?? null); setDif(j.diferencias ?? [])
      }

      // Y el cruce corre igual sin archivos: los otros dos no los necesitan.
      if (!lecturas.tickets && !lecturas.ventas) {
        const r = await fetch('/api/caja/control', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha, sucursal_id: sucursal }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? 'No se pudo correr el control.')
        setCruces(j.cruces ?? null); setDif(j.diferencias ?? [])
      }
      toast.success('Control corrido.')
    } catch (e: any) {
      setError(e?.message ?? 'Falló el control.')
    } finally { setCorriendo(false) }
  }

  return (
    <div className="space-y-6">
      {/* ── LO QUE HAY ABIERTO, PRIMERO ─────────────────────────────────── */}
      {dif.filter((d) => d.estado === 'abierta').length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>
              {dif.filter((d) => d.estado === 'abierta').length} diferencia(s) sin explicar, por{' '}
              {formatARS(dif.filter((d) => d.estado === 'abierta')
                .reduce((a, d) => a + Math.abs(Number(d.diferencia ?? 0)), 0))}.
            </b>{' '}
            Una diferencia abierta no acusa a nadie: dice que los números no coinciden. El motivo lo
            escribe una persona, y hasta que alguien lo escriba queda acá.
          </AlertDescription>
        </Alert>
      )}

      {/* ── EL DÍA Y LA SUCURSAL ────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Qué día se controla</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            <div className="mb-1 text-muted-foreground">Fecha</div>
            <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs">
            <div className="mb-1 text-muted-foreground">Sucursal</div>
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
              disabled={!!miSucursal}
              className="rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60">
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          {miSucursal && (
            <p className="text-xs text-muted-foreground">
              Controlás la caja de tu sucursal. Los totales de la cadena y la caja fuerte son de los
              dueños.
            </p>
          )}
        </div>

        {/* ── C.6 · EL TOPE DE EFECTIVO ───────────────────────────────── */}
        <p className="text-xs leading-snug text-muted-foreground">
          {cfg?.tope_efectivo == null ? (
            <>
              <b>{sucNombre(sucursal)} no tiene tope de efectivo definido</b>, así que NORA no avisa
              cuando se pasa. No es cero: cero querría decir que no puede quedar ni un peso en caja.
              El tope lo define el dueño en Configuración.
            </>
          ) : (
            <>Tope de efectivo de {sucNombre(sucursal)}: <b>{formatARS(Number(cfg.tope_efectivo))}</b>.
              Pasado eso, NORA avisa.</>
          )}
        </p>
      </section>

      {/* ── LOS DOS ARCHIVOS ────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Los archivos del día</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Se leen en tu máquina: al servidor sólo llegan los totales. El archivo de tickets es el
            que permite el primer cruce; los otros dos salen de lo que ya está en NORA.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(['tickets', 'ventas'] as const).map((tipo) => {
            const l = lecturas[tipo]
            return (
              <div key={tipo} className="rounded-lg border p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {tipo}
                </div>
                {!l ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm hover:underline">
                    {leyendo === tipo
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Upload className="size-4 text-muted-foreground" />}
                    {leyendo === tipo ? 'Leyendo…' : 'Elegir archivo'}
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={(e) => elegir(tipo, e.target.files?.[0] ?? null)} />
                  </label>
                ) : (
                  <div className="space-y-1 text-xs">
                    <div className="font-medium">{l.nombre}</div>
                    <div className="text-muted-foreground">
                      {l.filas.toLocaleString('es-AR')} filas ·{' '}
                      {l.total === null
                        ? <span className="text-amber-600 dark:text-amber-400">sin columna de importe</span>
                        : <>total {formatARS(l.total)}</>}
                    </div>
                    {l.total !== null && (l.efectivo !== null || l.tarjetas !== null) && (
                      <div className="text-muted-foreground">
                        {l.efectivo !== null && <>efectivo {formatARS(l.efectivo)} </>}
                        {l.tarjetas !== null && <>· tarjetas {formatARS(l.tarjetas)}</>}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      columnas: {l.columnas.slice(0, 8).join(', ')}{l.columnas.length > 8 ? '…' : ''}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <Button onClick={correr} disabled={corriendo} className="gap-1">
          {corriendo ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {corriendo ? 'Controlando…' : 'Controlar este día'}
        </Button>
        {error && (
          <Alert variant="destructive"><AlertTriangle className="size-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription></Alert>
        )}
      </section>

      {/* ── LOS TRES CRUCES ────────────────────────────────────────────── */}
      {cruces && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Qué se cruzó
          </h2>
          {cruces.map((c) => {
            const info = CRUCE[c.cruce] ?? { t: c.cruce, pregunta: '' }
            const noSePudo = !!c.sin_dato
            const hay = Number(c.diferencias ?? 0) > 0
            return (
              <div key={c.cruce} className={`rounded-lg border p-3 ${
                hay ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {noSePudo ? <HelpCircle className="size-4 text-muted-foreground" />
                   : hay ? <AlertTriangle className="size-4 text-destructive" />
                   : <Check className="size-4 text-emerald-600" />}
                  <span className="font-medium">{info.t}</span>
                  {hay && (
                    <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                      {c.diferencias} · {formatARS(Number(c.monto))}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{info.pregunta}</p>
                <p className="mt-1 text-xs leading-snug">
                  {noSePudo
                    ? <><b>No se pudo cruzar:</b> {c.sin_dato}. No es que esté todo bien — es que no se puede saber.</>
                    : hay
                      ? 'Las diferencias están abajo, con el turno y quién cerró.'
                      : 'Se cruzó y coincide.'}
                </p>
              </div>
            )
          })}
        </section>
      )}

      {/* ── LAS DIFERENCIAS ────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Diferencias
        </h2>
        {!dif.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No hay diferencias marcadas. Si todavía no corriste el control de ningún día, eso no
            quiere decir que no haya: quiere decir que no se miró.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {dif.map((d) => (
              <div key={d.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {formatARS(Math.abs(Number(d.diferencia)))}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {CRUCE[d.cruce]?.t ?? d.cruce}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{d.fecha}</span>
                  {d.cerro_nombre && (
                    <span className="text-xs text-muted-foreground">· cerró {d.cerro_nombre}</span>
                  )}
                  <Badge variant={d.estado === 'abierta' ? 'destructive' : 'outline'}
                    className="ml-auto text-[10px]">{d.estado}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.lado_a}: <b>{formatARS(Number(d.monto_a))}</b> · {d.lado_b}:{' '}
                  <b>{formatARS(Number(d.monto_b))}</b>
                </div>
                {d.motivo
                  ? <p className="text-xs italic">{d.motivo}</p>
                  : <p className="text-xs text-muted-foreground">
                      Sin motivo escrito. Eso es todo lo que el sistema afirma: que no coinciden.
                    </p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── E.2 · LEER LA FOTO DEL CIERRE ──────────────────────────────── */}
      <Alert>
        <Info className="size-4" />
        <AlertDescription className="text-xs leading-snug">
          <b>La foto del cierre de SIFACO se puede leer sola.</b> Se sube en el arqueo del turno y
          NORA saca los totales con el mismo motor que lee las facturas. Lo leído se <b>propone</b>,
          no se guarda: quien cierra ve los números al lado de la foto y confirma o corrige, igual
          que con el match de productos. Un total mal leído que entra solo haría que este control
          marque una diferencia que no existe, y alguien saldría a buscar plata que está.
        </AlertDescription>
      </Alert>

      {/* ── C.4 · EL ARQUEO CIEGO ──────────────────────────────────────── */}
      <Alert>
        <Info className="size-4" />
        <AlertDescription className="text-xs leading-snug">
          <b>El arqueo ciego está construido y hoy no se usa.</b> El circuito existe —el conteo se
          carga antes de ver el total del sistema, y si se carga después queda marcado— pero no es
          un paso obligatorio, porque el cierre real de hoy no lo incluye. Exigirlo haría que nadie
          cierre una caja, y una caja sin cerrar no se controla de ninguna forma. La regla de oro 3
          sigue siendo el objetivo: queda disponible y declarado que no se adoptó.
        </AlertDescription>
      </Alert>
    </div>
  )
}
