'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AMBITOS, AMBITO_TEXTO, type Ambito } from '@/lib/conteo/ambito'
import { parseSpreadsheet } from '@/lib/utils/export-excel'

type Punto = { id: string; nombre: string }
type Lista = { id: string; zona: string }

type ItemPrevisto = {
  sku: string | null
  descripcion: string
  unidad: string | null
  orden: number
  estado: 'con_catalogo' | 'sin_catalogo' | 'sin_sku' | 'repetido'
  novedad?: 'nuevo' | 'existente'
}
type Previa = {
  items: ItemPrevisto[]
  total: number
  conCatalogo: number
  sinCatalogo: number
  sinSku: number
  repetidos: number
  reimportacion?: {
    zona: string
    nuevos: number
    existentes: number
    desaparecidos: { id: string; sku: string | null; descripcion: string }[]
    conteosPrevios: number
  }
}

const SIN_COLUMNA = '__ninguna__'

/**
 * Importar una lista de conteo desde una planilla.
 *
 * La planilla se lee en el navegador y al servidor van las filas ya mapeadas.
 * Es el mismo camino que usa el resto del sistema para importar, y evita subir
 * un archivo entero para descubrir que la columna del SKU se llamaba distinto.
 */
export default function ImportarClient({
  puntos,
  listas,
  puntoPorDefecto,
}: {
  puntos: Punto[]
  listas: Lista[]
  puntoPorDefecto?: string | null
}) {
  const router = useRouter()
  const [zona, setZona] = useState('')
  const [puntoId, setPuntoId] = useState<string>(puntoPorDefecto ?? SIN_COLUMNA)
  const [listaId, setListaId] = useState<string>(SIN_COLUMNA)
  const [headers, setHeaders] = useState<string[]>([])
  const [filas, setFilas] = useState<string[][]>([])
  const [mapa, setMapa] = useState<{ sku: string; descripcion: string; unidad: string; orden: string }>({
    sku: SIN_COLUMNA,
    descripcion: SIN_COLUMNA,
    unidad: SIN_COLUMNA,
    orden: SIN_COLUMNA,
  })
  // SIN DEFAULT. Arranca vacío y el botón no se habilita hasta que se elija:
  // si acá dijera 'total' de entrada, una góndola contada contra el total del
  // punto marcaría como faltante todo lo que está en el depósito, y nadie
  // sabría que eligió algo.
  const [ambito, setAmbito] = useState<Ambito | ''>('')
  const [pegado, setPegado] = useState('')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [cargando, setCargando] = useState(false)

  /** Adivina el mapeo por el nombre de la columna. Se puede corregir a mano. */
  function adivinar(hs: string[]) {
    const buscar = (...claves: string[]) =>
      hs.find((h) => claves.some((c) => h.toLowerCase().replace(/\s+/g, '').includes(c))) ?? SIN_COLUMNA
    return {
      sku: buscar('sku', 'codigo', 'código'),
      descripcion: buscar('descrip', 'detalle', 'producto', 'nombre'),
      unidad: buscar('unidad', 'medida'),
      orden: buscar('orden', 'posicion', 'posición'),
    }
  }

  async function elegirArchivo(file: File | null) {
    if (!file) return
    setPrevia(null)
    try {
      const { headers: hs, rows } = await parseSpreadsheet(file)
      setHeaders(hs)
      setFilas(rows)
      setMapa(adivinar(hs))
      toast.success(`${rows.length} fila(s) leídas de la planilla`)
    } catch {
      toast.error('No pudimos leer la planilla. ¿Es un .xlsx o .csv?')
    }
  }

  /**
   * Lo pegado, leído como filas.
   *
   * Existe porque el archivo es una barrera para el caso que más va a pasar al
   * principio: quince productos de una góndola, anotados en el teléfono o
   * copiados de una planilla abierta. Pedir un .xlsx para eso es pedir que
   * alguien abra Excel, guarde y suba — tres pasos antes del primero.
   *
   * Una línea por item. Si la línea trae tabulación, coma o punto y coma, lo de
   * antes es el SKU y lo de después la descripción; si no trae ninguno, la
   * línea entera es la descripción y el item queda sin SKU — que se cuenta
   * igual, sólo que al cerrar no va a tener contra qué compararse.
   */
  function filasPegadas() {
    return pegado
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((linea, i) => {
        const m = linea.match(/^([^\t,;]+)[\t,;]\s*(.+)$/)
        return {
          sku: m ? m[1].trim() : null,
          descripcion: m ? m[2].trim() : linea,
          unidad: null,
          orden: i + 1,
        }
      })
  }

  function armarFilas() {
    if (headers.length === 0 && pegado.trim() !== '') return filasPegadas()
    const idx = (col: string) => (col === SIN_COLUMNA ? -1 : headers.indexOf(col))
    const iSku = idx(mapa.sku)
    const iDesc = idx(mapa.descripcion)
    const iUni = idx(mapa.unidad)
    const iOrd = idx(mapa.orden)
    return filas.map((r, i) => ({
      sku: iSku >= 0 ? (r[iSku] ?? null) : null,
      descripcion: iDesc >= 0 ? (r[iDesc] ?? '') : '',
      unidad: iUni >= 0 ? (r[iUni] ?? null) : null,
      orden: iOrd >= 0 && r[iOrd] && !Number.isNaN(Number(r[iOrd])) ? Number(r[iOrd]) : i + 1,
    }))
  }

  async function llamar(confirmar: boolean) {
    setCargando(true)
    try {
      const res = await fetch('/api/conteo/listas/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zona,
          ambito: ambito || undefined,
          puntoId: puntoId === SIN_COLUMNA ? null : puntoId,
          listaId: listaId === SIN_COLUMNA ? null : listaId,
          filas: armarFilas(),
          confirmar,
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error ?? 'No se pudo importar')
        return
      }
      if (confirmar) {
        toast.success(
          `Lista guardada: ${j.creados} item(s) nuevo(s)` +
            (j.marcados ? ` · ${j.marcados} marcado(s) como que ya no están` : ''),
        )
        router.push('/admin/operaciones/conteos')
        router.refresh()
      } else {
        setPrevia(j.previa)
        // La previa se arma abajo del fold: sin esto, el botón se deshabilita un
        // instante, la pantalla no se mueve, y se lee como que no pasó nada.
        // Se espera al pintado para que el nodo exista cuando se lo busca.
        requestAnimationFrame(() => {
          document.getElementById('previa')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      }
    } catch {
      toast.error('No se pudo importar. Probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  const hayItems =
    (filas.length > 0 && mapa.descripcion !== SIN_COLUMNA) || filasPegadas().length > 0
  const esNueva = listaId === SIN_COLUMNA
  const puedeVerPrevia =
    hayItems && (!esNueva || (zona.trim() !== '' && ambito !== '' && puntoId !== SIN_COLUMNA))

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              El punto que manda en un conteo es <b>el que elijas acá abajo</b>, no el
              selector de sucursal de la barra de arriba. Ese cambia lo que ves en el
              resto de Operaciones y no toca la lista.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>¿Es una zona nueva o una que ya existe?</Label>
            <Select value={listaId} onValueChange={setListaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_COLUMNA}>Zona nueva</SelectItem>
                {listas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    Reimportar «{l.zona}»
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {listaId === SIN_COLUMNA ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="zona">Nombre de la zona</Label>
                <Input
                  id="zona"
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  placeholder="Perfumería góndola 3"
                />
                <p className="text-xs text-muted-foreground">
                  Una zona es un tramo que una persona recorre de una vez.{' '}
                  <b>Entre 15 y 40 items</b> es lo que entra en veinte minutos sin
                  cansarse. Una góndola entera de 120 se abandona por la mitad: si es
                  grande, partila en dos zonas.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>¿En qué punto está esta zona?</Label>
                <Select value={puntoId} onValueChange={setPuntoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí el punto" />
                  </SelectTrigger>
                  <SelectContent>
                    {puntos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {puntoId === SIN_COLUMNA ? (
                  <p className="text-xs text-muted-foreground">
                    Hace falta: el stock se guarda por punto, así que{' '}
                    <b>una lista sin punto no se puede contar</b> — al empezar el conteo
                    no habría contra qué comparar y se traba ahí.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {listaId === SIN_COLUMNA ? (
          <div className="space-y-1.5">
            <Label>¿Contra qué se compara lo que se cuente?</Label>
            <Select value={ambito} onValueChange={(v) => setAmbito(v as Ambito)}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí una — no hay opción por defecto" />
              </SelectTrigger>
              <SelectContent>
                {AMBITOS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AMBITO_TEXTO[a].titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ambito ? (
              <p className="text-xs text-muted-foreground">{AMBITO_TEXTO[ambito].consecuencia}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Acá el stock está separado entre góndola y depósito. Si contás una
                góndola y comparás contra el total del punto,{' '}
                <b>todo lo que está en el depósito va a aparecer como faltante</b> — y
                alguien va a salir a buscar mercadería que nunca se perdió.
              </p>
            )}
          </div>
        ) : null}

        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">Antes de cargar la lista, dos cosas</p>
          <p className="text-xs text-muted-foreground">
            <b>El orden es el del recorrido, no el del catálogo.</b> Quien cuenta camina
            la góndola y va tachando: si la lista sigue ese orden, el conteo dura veinte
            minutos; si sigue el orden del catálogo, hay que ir y volver por cada item.
          </p>
          <p className="text-xs text-muted-foreground">
            <b>Los items sin SKU entran, pero no se comparan.</b> Se cuentan igual y
            quedan registrados; al cerrar van a decir «no se pudo comparar», porque sin
            SKU no hay stock del sistema contra qué medirlos.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="archivo">La planilla</Label>
          <Input
            id="archivo"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            Alcanza con SKU y descripción. Si trae una columna de orden, ese es el
            orden en que se va a contar — y el orden es el recorrido de la góndola,
            no el del catálogo.
          </p>
        </div>

        {headers.length === 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="pegado">…o pegá la lista acá</Label>
            <Textarea
              id="pegado"
              value={pegado}
              onChange={(e) => setPegado(e.target.value)}
              rows={6}
              placeholder={'DEMO-0001, Paracetamol 500 x20\nDEMO-0002, Ibuprofeno 400 x10\nCrema de manos (sin SKU)'}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Una línea por item, en el orden en que se recorre la góndola. Si la línea
              trae coma o tabulación, lo de antes es el SKU. Sin SKU también entra: se
              cuenta igual, pero al cerrar no va a tener con qué compararse.
            </p>
          </div>
        ) : null}

        {headers.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-4">
            {(['sku', 'descripcion', 'unidad', 'orden'] as const).map((campo) => (
              <div key={campo} className="space-y-1.5">
                <Label className="capitalize">{campo}</Label>
                <Select
                  value={mapa[campo]}
                  onValueChange={(v) => setMapa((m) => ({ ...m, [campo]: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_COLUMNA}>— sin columna —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        ) : null}

        <Button onClick={() => llamar(false)} disabled={!puedeVerPrevia || cargando}>
          {cargando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
          Ver qué va a pasar
        </Button>
      </Card>

      {previa ? (
        <Card id="previa" className="space-y-4 p-4 scroll-mt-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">{previa.total} items</Badge>
            <Badge variant="secondary">{previa.conCatalogo} con producto del catálogo</Badge>
            {previa.sinCatalogo > 0 ? (
              <Badge variant="outline" className="border-amber-500 text-amber-700">
                {previa.sinCatalogo} sin producto del catálogo
              </Badge>
            ) : null}
            {previa.sinSku > 0 ? <Badge variant="outline">{previa.sinSku} sin SKU</Badge> : null}
            {previa.repetidos > 0 ? (
              <Badge variant="destructive">{previa.repetidos} repetidos (no entran)</Badge>
            ) : null}
          </div>

          {previa.sinCatalogo > 0 || previa.sinSku > 0 ? (
            <Alert>
              <AlertDescription className="text-sm">
                Los que no matchean el catálogo <b>entran igual en la lista</b> y se
                cuentan igual. Lo que no se hace es crear productos nuevos: el SKU es
                global y un producto se crea a propósito, no subiendo una planilla.
                {previa.sinSku > 0
                  ? ' Los que vienen sin SKU no van a poder compararse contra el stock del sistema al cerrar.'
                  : ''}
              </AlertDescription>
            </Alert>
          ) : null}

          {previa.reimportacion ? (
            <Alert>
              <AlertDescription className="text-sm">
                Reimportando «{previa.reimportacion.zona}»: {previa.reimportacion.nuevos} nuevo(s),{' '}
                {previa.reimportacion.existentes} que ya estaban
                {previa.reimportacion.desaparecidos.length > 0 ? (
                  <>
                    , y {previa.reimportacion.desaparecidos.length} que ya no vienen en la
                    planilla — se marcan como que no están, <b>no se borran</b>: la zona
                    tiene {previa.reimportacion.conteosPrevios} conteo(s) hechos y borrarlos
                    se llevaría puesto el historial.
                  </>
                ) : (
                  '.'
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="text-left">
                  <th className="p-2 font-medium">#</th>
                  <th className="p-2 font-medium">SKU</th>
                  <th className="p-2 font-medium">Descripción</th>
                  <th className="p-2 font-medium">Catálogo</th>
                </tr>
              </thead>
              <tbody>
                {previa.items.slice(0, 300).map((it, i) => (
                  <tr key={`${it.sku ?? 'x'}-${i}`} className="border-t">
                    <td className="p-2 text-muted-foreground">{it.orden}</td>
                    <td className="p-2 font-mono text-xs">{it.sku ?? '—'}</td>
                    <td className="p-2">{it.descripcion}</td>
                    <td className="p-2">
                      {it.estado === 'con_catalogo' ? (
                        <span className="text-emerald-700">sí</span>
                      ) : it.estado === 'repetido' ? (
                        <span className="text-destructive">repetido</span>
                      ) : (
                        <span className="text-amber-700">no</span>
                      )}
                      {it.novedad === 'nuevo' ? ' · nuevo' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {previa.items.length > 300 ? (
            <p className="text-xs text-muted-foreground">
              Se muestran los primeros 300 de {previa.items.length}. Se van a guardar todos.
            </p>
          ) : null}

          <Button onClick={() => llamar(true)} disabled={cargando}>
            {cargando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Guardar la lista
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
