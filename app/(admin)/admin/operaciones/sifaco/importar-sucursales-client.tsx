'use client'

import { useState } from 'react'
import { Loader2, Upload, FileSpreadsheet, AlertTriangle, Check, Info } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  leerMaestroSucursales, hashDeArchivo, subirSucursalesEnLotes,
  type ArchivoSucursalesLeido, type ImportacionAnterior, type Progreso,
} from '@/lib/sifaco/parseo-sucursales-cliente'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

type Paso = 'elegir' | 'leyendo' | 'listo' | 'subiendo' | 'cargado' | 'aplicando' | 'aplicado' | 'error'

/**
 * SUBIR EL MAESTRO ABIERTO POR SUCURSAL.
 *
 * ── POR QUÉ UNA PANTALLA Y NO UNA SESIÓN DE CÓDIGO ──────────────────────────
 *
 * El archivo anterior era del 28 de agosto y se importó el 30. El siguiente
 * llegó el 14 de octubre: 47 días después, y entró porque alguien escribió un
 * script. Todo lo que calcula el plan de compra sale de esa foto. Mientras
 * importar necesite una sesión de código, la foto va a estar vieja.
 *
 * ── EL ORDEN DE LOS PASOS NO ES DECORATIVO ──────────────────────────────────
 *
 * Leer → verificar → subir → APLICAR. Entre subir y aplicar hay una persona:
 * subir deja las filas en la pila de origen y no cambia un solo número;
 * aplicar reescribe el stock de las cuatro sucursales. Son dos cosas y se
 * aprietan por separado.
 */
export function ImportarSucursalesClient({ anterior }: { anterior: ImportacionAnterior | null }) {
  const [paso, setPaso] = useState<Paso>('elegir')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [leido, setLeido] = useState<ArchivoSucursalesLeido | null>(null)
  const [impId, setImpId] = useState<string | null>(null)
  const [prog, setProg] = useState<Progreso | null>(null)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function elegir(f: File | null) {
    if (!f) return
    setArchivo(f); setError(null); setPaso('leyendo'); setResultado(null)
    try {
      // Leer y verificar ANTES de mandar nada: así «este archivo no entra» se
      // puede decir sin haber escrito una fila.
      const l = await leerMaestroSucursales(f, anterior)
      setLeido(l)
      setPaso('listo')
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el archivo.')
      setPaso('error')
    }
  }

  async function subir() {
    if (!archivo || !leido) return
    if (!leido.entra) { toast.error('El archivo no entra: mirá los cortes.'); return }
    setPaso('subiendo'); setError(null)
    try {
      const hash = await hashDeArchivo(archivo)
      const r = await fetch('/api/sifaco/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'sucursal', nombre: archivo.name, hash, bytes: archivo.size }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo abrir la importación.')

      if (j.estado === 'duplicado') {
        toast.info('Este archivo ya se importó. Es el mismo, byte por byte.')
        setImpId(j.importacion?.id ?? null)
        setPaso('cargado')
        return
      }

      // El original va DERECHO a Storage: 35 MB no pasan por una función.
      const sb = createClient()
      const { error: eUp } = await sb.storage
        .from(j.bucket).uploadToSignedUrl(j.path, j.token, archivo)
      if (eUp) throw new Error(`Subiendo el archivo: ${eUp.message}`)

      setImpId(j.importacionId)
      for await (const p of subirSucursalesEnLotes(j.importacionId, leido, new Set())) setProg(p)
      setPaso('cargado')
      toast.success(`${leido.filas.length.toLocaleString('es-AR')} filas en la pila. Todavía no se aplicó nada.`)
    } catch (e: any) {
      setError(e?.message ?? 'Falló la carga.')
      setPaso('error')
    }
  }

  async function aplicar() {
    if (!impId) return
    setPaso('aplicando'); setError(null)
    try {
      const r = await fetch(`/api/sifaco/importar/${impId}/aplicar-sucursal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Los avisos ya se mostraron arriba y quien aprieta este botón los vio.
        // Queda escrito en `aplicado_con_avisos`.
        body: JSON.stringify({ confirmar_avisos: true }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo aplicar.')
      setResultado(j.resultado)
      setPaso('aplicado')
      toast.success('Aplicado. El stock por sucursal quedó actualizado.')
    } catch (e: any) {
      setError(e?.message ?? 'Falló al aplicar.')
      setPaso('error')
    }
  }

  const r = leido?.resumen

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Maestro abierto por sucursal</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          La hoja <code>tabla3e</code>: stock y ventas de los cuatro locales. De acá salen el stock
          por sucursal, los quiebres reales y la transferencia antes de comprar.
        </p>
      </div>

      {paso === 'elegir' && (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm hover:bg-muted/50">
          <Upload className="size-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Elegí el archivo</div>
            <div className="text-xs text-muted-foreground">
              .xls o .xlsx. Se lee en tu máquina: no se sube hasta que lo confirmes.
            </div>
          </div>
          <input type="file" accept=".xls,.xlsx" className="hidden"
            onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {paso === 'leyendo' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo y verificando…
        </p>
      )}

      {leido && r && paso !== 'elegir' && paso !== 'leyendo' && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <span className="font-medium">{archivo?.name}</span>
            <Badge variant="outline" className="text-[10px]">hoja {leido.hoja}</Badge>
            <span className="text-xs text-muted-foreground">
              {r.filas.toLocaleString('es-AR')} filas ·{' '}
              {Object.keys(leido.mapa.indice).length} columnas reconocidas
              {r.fechaArchivo && <> · archivo del {r.fechaArchivo}</>}
            </span>
          </div>

          {/* ── D.2 · LO QUE SE VERIFICÓ, TODO, AUNQUE PASE ──────────────── */}
          <div className="space-y-1.5">
            {leido.chequeos.map((c) => (
              <div key={c.clave} className={`rounded-lg border p-2.5 text-xs ${
                c.nivel === 'corta' ? 'border-destructive/40 bg-destructive/5'
                : c.nivel === 'avisa' ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                <div className="flex items-center gap-1.5 font-medium">
                  {c.nivel === 'pasa' ? <Check className="size-3.5 text-emerald-600" />
                   : c.nivel === 'avisa' ? <Info className="size-3.5 text-amber-600" />
                   : <AlertTriangle className="size-3.5 text-destructive" />}
                  {c.titulo}
                </div>
                <p className="mt-0.5 leading-snug text-muted-foreground">{c.dice}</p>
                {c.queHacer && <p className="mt-1 leading-snug">{c.queHacer}</p>}
              </div>
            ))}
          </div>

          {!leido.entra && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-xs">
                <b>Este archivo no entra.</b> No se escribió nada. Los cortes de arriba no se pueden
                confirmar: un archivo al que le falta el stock de una sucursal no tiene una versión
                aceptable.
              </AlertDescription>
            </Alert>
          )}

          {leido.entra && leido.avisos > 0 && (
            <Alert>
              <Info className="size-4" />
              <AlertDescription className="text-xs leading-snug">
                <b>{leido.avisos} avisos.</b> Un aviso no bloquea porque puede ser un hallazgo y no
                un defecto: fue un aviso de «+71,8% en el valor» el que destapó que el maestro
                anterior traía una sola sucursal. Pero queda escrito que se aplicó sabiendo.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      {paso === 'listo' && (
        <Button onClick={subir} disabled={!leido?.entra} className="gap-1">
          <Upload className="size-4" />
          Subir las {leido?.filas.length.toLocaleString('es-AR')} filas a la pila
        </Button>
      )}

      {paso === 'subiendo' && (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Subiendo {prog ? `${prog.filas.toLocaleString('es-AR')} de ${prog.filasTotales.toLocaleString('es-AR')}` : '…'}
          </p>
          {prog && (
            <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((prog.filas / prog.filasTotales) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {paso === 'cargado' && (
        <div className="space-y-2">
          <Alert>
            <Check className="size-4" />
            <AlertDescription className="text-xs leading-snug">
              Las filas están en la pila de origen y <b>no cambió ningún número todavía</b>.
              Aplicar reescribe el stock de las cuatro sucursales, las ventas de cuatro meses y
              crea los productos que no estaban.
            </AlertDescription>
          </Alert>
          <Button onClick={aplicar} className="gap-1">
            <Check className="size-4" /> Aplicar
          </Button>
        </div>
      )}

      {paso === 'aplicando' && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Aplicando. Son casi 200.000 filas: puede tardar.
        </p>
      )}

      {paso === 'aplicado' && resultado && (
        <Alert>
          <Check className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>Aplicado.</b>{' '}
            {Number(resultado.productos_nuevos ?? 0).toLocaleString('es-AR')} productos nuevos ·{' '}
            {Number(resultado.filas_stock_sucursal ?? 0).toLocaleString('es-AR')} filas de stock ·{' '}
            {Number(resultado.filas_ventas_sucursal ?? 0).toLocaleString('es-AR')} de ventas ·{' '}
            {Number(resultado.condicion_venta_completada ?? 0).toLocaleString('es-AR')} condiciones de
            venta completadas
            {Number(resultado.canal_cerrado_por_el_archivo ?? 0) > 0 && (
              <> · <b>{resultado.canal_cerrado_por_el_archivo} productos despublicables</b>: el
              archivo los declara con receta y estaban abiertos al canal</>
            )}.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
