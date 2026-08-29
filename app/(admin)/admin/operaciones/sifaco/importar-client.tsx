'use client'

import { useState } from 'react'
import { Loader2, Upload, FileSpreadsheet, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { leerMaestro, hashDeArchivo, subirEnLotes, type ArchivoLeido, type Progreso } from '@/lib/sifaco/parseo-cliente'
import { PALABRAS_TESTIGO } from '@/lib/sifaco/codificacion'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Paso = 'elegir' | 'leyendo' | 'listo-para-subir' | 'subiendo' | 'cargado' | 'error'

export function ImportarSifacoClient() {
  const [paso, setPaso] = useState<Paso>('elegir')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [leido, setLeido] = useState<ArchivoLeido | null>(null)
  const [prog, setProg] = useState<Progreso | null>(null)
  const [previa, setPrevia] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function elegir(f: File | null) {
    if (!f) return
    setArchivo(f); setError(null); setPaso('leyendo'); setPrevia(null)
    try {
      const l = await leerMaestro(f)
      setLeido(l)
      setPaso('listo-para-subir')
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo leer el archivo.')
      setPaso('error')
    }
  }

  async function subir() {
    if (!archivo || !leido) return
    setPaso('subiendo'); setError(null)
    try {
      const hash = await hashDeArchivo(archivo)

      const r = await fetch('/api/sifaco/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'maestro', nombre: archivo.name, hash, bytes: archivo.size }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo abrir la importación.')

      if (j.estado === 'duplicado') {
        toast.info('Este archivo ya se importó. Es el mismo, byte por byte.')
        setPaso('listo-para-subir')
        return
      }

      // El original va DERECHO a Storage. No pasa por ninguna función.
      const sb = createClient()
      const { error: eUp } = await sb.storage
        .from(j.bucket)
        .uploadToSignedUrl(j.path, j.token, archivo)
      if (eUp) throw new Error(`Subiendo el archivo: ${eUp.message}`)

      const hechos = await fetch(`/api/sifaco/importar/${j.importacionId}/lote`)
        .then((x) => x.json())
        .then((x) => new Set<number>(x?.lotes ?? []))
        .catch(() => new Set<number>())

      for await (const p of subirEnLotes(j.importacionId, leido, hechos)) setProg(p)

      const rp = await fetch(`/api/sifaco/importar/${j.importacionId}/previa`, { method: 'POST' })
      const jp = await rp.json()
      if (!rp.ok) throw new Error(jp?.error ?? 'No se pudo calcular la vista previa.')
      setPrevia(jp.previa)
      setPaso('cargado')
    } catch (e: any) {
      setError(e?.message ?? 'Falló la carga.')
      setPaso('error')
    }
  }

  const v = leido?.veredicto

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 hover:bg-muted/40">
            <FileSpreadsheet className="size-6 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {archivo ? archivo.name : 'Elegí el archivo pla_3d_24.xls'}
              </div>
              <div className="text-xs text-muted-foreground">
                {archivo
                  ? `${(archivo.size / 1_048_576).toFixed(1)} MB`
                  : 'El maestro de productos que exporta SIFACO. Puede pesar 40 MB o más: se sube directo, no hay límite de tamaño acá.'}
              </div>
            </div>
            <input type="file" accept=".xls,.xlsx" className="hidden"
              onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
          </label>

          {paso === 'leyendo' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Leyendo el archivo y probando la codificación…
            </div>
          )}
        </CardContent>
      </Card>

      {/* La codificación, ANTES de subir nada. */}
      {v && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">Codificación</div>
            <div className="text-sm">
              El arreglo que más funcionó es <b>{v.codificacion}</b> — {v.descripcion}.
              {' '}Encontró <b>{Object.values(v.puntajes).length ? Math.max(...Object.values(v.puntajes)) : 0} de {PALABRAS_TESTIGO.length}</b>{' '}
              palabras de prueba ({PALABRAS_TESTIGO.join(', ')}).
            </div>

            {v.muestras.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                {v.muestras.slice(0, 5).map((m, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <code className="text-destructive">{m.antes}</code>
                    <span className="text-muted-foreground">→</span>
                    <code className="text-emerald-600 dark:text-emerald-400">{m.despues}</code>
                  </div>
                ))}
              </div>
            )}

            {!v.verificado && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Ninguna de las palabras de prueba apareció con ningún arreglo. No quiere decir
                  que el archivo esté bien: quiere decir que esto no lo pudo verificar. Mirá las
                  muestras antes de guardar.
                </AlertDescription>
              </Alert>
            )}

            {v.residuo.filas > 0 && (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  <b>{v.residuo.filas.toLocaleString('es-AR')} descripciones</b> siguen teniendo
                  caracteres imposibles después del arreglo. El archivo tiene más de una capa de
                  daño y ésta arregló una. Ejemplos:{' '}
                  <code className="text-xs">{v.residuo.muestra.slice(0, 3).join(' · ')}</code>
                </AlertDescription>
              </Alert>
            )}

            <div className="text-xs text-muted-foreground">
              {leido!.filasDeDatos.toLocaleString('es-AR')} filas de datos
              {' '}(sin el encabezado ni el renglón de reporte de SIFACO).
            </div>

            {(paso === 'listo-para-subir' || paso === 'error') && (
              <Button onClick={subir} className="gap-2">
                <Upload className="size-4" /> Subir y cargar
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {paso === 'subiendo' && prog && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Lote {prog.lote} de {prog.lotes} — {prog.filas.toLocaleString('es-AR')} de{' '}
              {prog.filasTotales.toLocaleString('es-AR')} filas
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((prog.lote / prog.lotes) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Si esto se corta, no se pierde: al volver a subir el mismo archivo sigue desde el
              lote donde quedó.
            </p>
          </CardContent>
        </Card>
      )}

      {/* La vista previa. Nada se aplicó todavía. */}
      {previa && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Check className="size-4 text-emerald-500" /> Cargado. Todavía no se aplicó nada al catálogo.
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato n={previa.filas} t="filas" />
              <Dato n={previa.nuevos} t="productos nuevos" />
              <Dato n={previa.ya_estan} t="ya están" />
              <Dato n={previa.no_vienen} t="no vienen en el archivo" />
              <Dato n={previa.con_stock} t="con stock" />
              <Dato n={previa.con_costo} t="con costo" />
              <Dato n={previa.controlados} t="controlados" />
              <Dato n={previa.codigos_unicos} t="códigos únicos" />
            </div>

            {previa.depto_sin_mapear && Object.keys(previa.depto_sin_mapear).length > 0 && (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Departamentos que no están declarados y caerían en «otros»:{' '}
                  <b>{Object.entries(previa.depto_sin_mapear).map(([k, n]) => `${k} (${n})`).join(' · ')}</b>.
                  Se agregan en <code>sifaco_depto_categoria</code> sin tocar código.
                </AlertDescription>
              </Alert>
            )}

            {previa.psi_sin_mapear && Object.keys(previa.psi_sin_mapear).length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Niveles de control sin declarar:{' '}
                  <b>{Object.entries(previa.psi_sin_mapear).map(([k, n]) => `${k} (${n})`).join(' · ')}</b>.
                  Es terreno legal: no se aplica hasta declararlos.
                </AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">
              El paso de aplicar al catálogo no está en esta versión: los datos quedan en la pila
              de origen, que es lo que SIFACO dijo ese día.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function Dato({ n, t }: { n: number | null | undefined; t: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-semibold tabular-nums">{(n ?? 0).toLocaleString('es-AR')}</div>
      <div className="text-xs text-muted-foreground">{t}</div>
    </div>
  )
}
