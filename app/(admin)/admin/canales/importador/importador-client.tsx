'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, FileUp, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type Canal = { id: string; nombre: string; entrada_catalogo: string; entrada_liquidaciones: string }

type Leido = {
  importacion: string
  entra_solo: boolean
  que_pasa: string
  mapeo_propuesto: Record<string, string>
  aparecieron: string[]
  desaparecieron: string[]
  campos: string[]
  filas_totales: number
  filas_leidas: number
  filas_crudas: number
  que_falta: string
}

const TIPOS = [
  { v: 'catalogo', t: 'Catálogo', d: 'qué está publicado y a qué precio' },
  { v: 'liquidacion', t: 'Liquidación', d: 'qué te pagaron y cuánto se llevaron' },
  { v: 'errores', t: 'Rechazos', d: 'qué rechazó la plataforma y por qué' },
  { v: 'ventas', t: 'Ventas', d: 'qué vendió la plataforma' },
]

/**
 * A.6 · SUBIR UN ARCHIVO DE PLATAFORMA.
 *
 * ── POR QUÉ SON DOS PASOS Y NO UN BOTÓN ─────────────────────────────────────
 *
 * Porque entre leer y guardar hay una persona. El paso 1 lee el archivo, lo
 * guarda entero —también las filas que no entendió— y muestra qué leyó. El
 * paso 2 confirma el mapeo y recién ahí cruza.
 *
 * Si fuera un botón, un archivo con el formato cambiado se mapearía mal sin
 * fallar, y guardaría cualquier cosa. Eso es peor que fallar: un error se
 * arregla, un dato mal cargado se descubre tres meses después.
 *
 * ── EL PARSEO ES EN EL NAVEGADOR ────────────────────────────────────────────
 *
 * El archivo no se sube: se lee acá y se mandan los encabezados y las filas
 * ya en JSON. Un catálogo de PedidosYa son miles de filas y subirlo entero a
 * una función serverless con 60 segundos de techo es pedirle que falle.
 */
export function ImportadorClient({ canales }: { canales: Canal[] }) {
  const router = useRouter()
  const [canal, setCanal] = useState('')
  const [tipo, setTipo] = useState('catalogo')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [leido, setLeido] = useState<Leido | null>(null)
  const [mapeo, setMapeo] = useState<Record<string, string>>({})
  const [encabezados, setEncabezados] = useState<string[]>([])
  const [muestra, setMuestra] = useState<Record<string, string>[]>([])
  const [confirmando, setConfirmando] = useState(false)

  async function onArchivo(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    if (!canal) { toast.error('Elegí el canal primero.'); ev.target.value = ''; return }

    setLeyendo(true)
    try {
      // `xlsx` ya es dependencia del proyecto (lo usa el Centro de Datos).
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const hoja = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json<Record<string, any>>(hoja, { defval: '', raw: false })
      if (!filas.length) throw new Error('El archivo no trae filas.')

      const heads = Object.keys(filas[0])
      const limpias = filas.map((f) => {
        const o: Record<string, string> = {}
        for (const h of heads) o[h] = (f[h] ?? '').toString()
        return o
      })

      setEncabezados(heads)
      setMuestra(limpias.slice(0, 5))
      setNombreArchivo(file.name)

      const r = await fetch('/api/canales/importador', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'leer', canal, tipo, archivo: file.name,
          encabezados: heads, filas: limpias,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo leer el archivo.')
      setLeido(j as Leido)
      setMapeo(j.mapeo_propuesto ?? {})
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló la lectura.')
    } finally {
      setLeyendo(false)
      ev.target.value = ''
    }
  }

  async function confirmar() {
    if (!leido) return
    setConfirmando(true)
    try {
      const r = await fetch('/api/canales/importador', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'confirmar', importacion: leido.importacion, mapeo, aprender: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo confirmar.')
      toast.success('Confirmado y cruzado', {
        description: j.cruce?.que_pasa_ahora ?? `${j.filas_leidas} filas leídas, ${j.filas_crudas} crudas.`,
        duration: 12_000,
      })
      setLeido(null); setEncabezados([]); setMuestra([]); setMapeo({})
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setConfirmando(false) }
  }

  const canalElegido = canales.find((c) => c.id === canal)

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Subir un archivo</h2>

      {/* ── PASO 1 · QUÉ ARCHIVO ES ──────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Canal</Label>
          <Select value={canal} onValueChange={(v) => { setCanal(v); setLeido(null) }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Elegí el canal" /></SelectTrigger>
            <SelectContent>
              {canales.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-sm">{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Qué trae</Label>
          <Select value={tipo} onValueChange={(v) => { setTipo(v); setLeido(null) }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.v} value={t.v} className="text-sm">{t.t} — {t.d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">El archivo</Label>
          <Input
            type="file" accept=".xlsx,.xls,.csv"
            onChange={onArchivo} disabled={!canal || leyendo}
            className="h-9 text-xs file:text-xs"
          />
        </div>
      </div>

      {canalElegido && tipo === 'catalogo' && canalElegido.entrada_catalogo === 'api' && (
        <p className="flex gap-1.5 rounded border border-dashed px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>
            El catálogo de <b>{canalElegido.nombre}</b> está declarado como que entra por API. Subir
            un archivo acá no está mal, pero si la API anda esto va a duplicar trabajo.
          </span>
        </p>
      )}

      {leyendo && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Leyendo el archivo. Nada se guardó todavía.
        </p>
      )}

      {/* ── PASO 2 · QUÉ LEYÓ ────────────────────────────────────────── */}
      {leido && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <FileUp className="size-4" />
            <span className="text-sm font-medium">{nombreArchivo}</span>
            {leido.entra_solo ? (
              <Badge variant="secondary" className="text-[10px]">
                <Sparkles className="mr-1 size-3" />
                el formato ya se conocía: entró solo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">hay que confirmar el mapeo</Badge>
            )}
          </div>

          <p className="rounded border bg-muted/40 p-2.5 text-xs leading-snug">{leido.que_pasa}</p>

          {/* Qué cambió, si cambió. «La huella no coincide» no es accionable. */}
          {(!!leido.aparecieron.length || !!leido.desaparecieron.length) && (
            <div className="space-y-1 rounded border border-amber-500/50 bg-amber-500/5 p-2.5 text-xs">
              <p className="font-medium">La plataforma cambió el formato.</p>
              {!!leido.aparecieron.length && (
                <p className="leading-snug">
                  <b>Aparecieron {leido.aparecieron.length}:</b> {leido.aparecieron.join(', ')}
                </p>
              )}
              {!!leido.desaparecieron.length && (
                <p className="leading-snug">
                  <b>Desaparecieron {leido.desaparecieron.length}:</b>{' '}
                  {leido.desaparecieron.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
            {[
              { t: 'filas en el archivo', v: leido.filas_totales },
              { t: 'se entendieron', v: leido.filas_leidas },
              { t: 'quedaron crudas', v: leido.filas_crudas },
            ].map((x) => (
              <div key={x.t}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.t}</p>
                <p className="text-xl font-semibold tabular-nums">{x.v.toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>

          {leido.filas_crudas > 0 && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Las {leido.filas_crudas} que no se entendieron <b>no se descartaron</b>: quedaron
              guardadas con su texto original y el motivo. Si el mapeo que confirmes las explica,
              se vuelven a leer solas.
            </p>
          )}

          {/* El mapeo, columna por columna. */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Qué es cada columna
            </h3>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left [&>th]:px-2.5 [&>th]:py-1.5 [&>th]:font-medium">
                    <th>Columna del archivo</th>
                    <th>Ejemplo</th>
                    <th className="w-44">Es</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {encabezados.map((h) => (
                    <tr key={h} className="[&>td]:px-2.5 [&>td]:py-1.5">
                      <td className="font-mono text-[11px]">{h}</td>
                      <td className="max-w-[16rem] truncate text-muted-foreground">
                        {muestra.map((m) => m[h]).filter(Boolean)[0] ?? '—'}
                      </td>
                      <td>
                        <Select
                          value={mapeo[h] ?? '__nada__'}
                          onValueChange={(v) =>
                            setMapeo((m) => {
                              const n = { ...m }
                              if (v === '__nada__') delete n[h]
                              else n[h] = v
                              return n
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__nada__" className="text-xs">
                              no se usa
                            </SelectItem>
                            {leido.campos.map((c) => (
                              <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Lo que dejes en «no se usa» <b>no se tira</b>: la fila se guarda completa igual. Esto
              decide qué se cruza, no qué se conserva.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={confirmar} disabled={confirmando || !Object.keys(mapeo).length}>
              {confirmando && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              <Check className="mr-1.5 size-3.5" />
              Confirmar, aprender el formato y cruzar
            </Button>
            <Button variant="outline" onClick={() => setLeido(null)} disabled={confirmando}>
              Dejarlo sin confirmar
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {leido.que_falta} Si lo dejás sin confirmar, el archivo queda en el histórico como
            leído y no cruzado — <b>que es la verdad</b>, no un error.
          </p>
        </div>
      )}
    </section>
  )
}
