'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, FileSpreadsheet, Upload, Download, Loader2, Wand2, Lock } from 'lucide-react'
import { toast } from 'sonner'

import { parseSpreadsheet } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  CAMPOS_SISTEMA, TIPO_PERFIL_LABEL, FRECUENCIA_LABEL,
  type PerfilDatos, type TipoPerfilDatos, type DireccionDatos, type FrecuenciaDatos,
  type FormatoDatos, type CampoSistema,
} from '@/lib/types/centro-datos'

const NONE = '__ignorar__'
const TIPOS: TipoPerfilDatos[] = ['productos', 'stock', 'ventas', 'clientes', 'ofertas', 'dif_stock', 'custom']
const FRECS: FrecuenciaDatos[] = ['manual', 'cada_2hs', 'diaria', 'semanal']

/** auto-mapeo: matchea encabezados del archivo contra campos del sistema. */
function autoMap(headers: string[], tipo: TipoPerfilDatos): Record<string, CampoSistema> {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const reglas: Record<string, CampoSistema> = {
    codigo: 'sku', cod: 'sku', sku: 'sku', barras: 'codigo_barras', ean: 'codigo_barras',
    descrip: 'nombre', nombre: 'nombre', producto: 'nombre', detalle: 'nombre',
    precio: 'precio', stock: 'stock', rubro: 'rubro', nomlab: 'laboratorio', laboratorio: 'laboratorio',
    droga: 'droga', estado: 'estado', tipo: 'tipo', mesact: 'venta_mes',
    ant1: 'ant_1', ant2: 'ant_2', ant3: 'ant_3', ant4: 'ant_4', ant5: 'ant_5', ant6: 'ant_6',
    nompromo: 'nom_promo', defpromo: 'def_promo', descu: 'descuento', recar: 'recargo',
    cant: 'cantidad', cantidad: 'cantidad', importe: 'monto', monto: 'monto',
  }
  const out: Record<string, CampoSistema> = {}
  for (const h of headers) {
    const nh = n(h)
    let campo: CampoSistema | undefined
    if (reglas[nh]) campo = reglas[nh]
    else { const k = Object.keys(reglas).find((kk) => nh === kk || nh.startsWith(kk)); if (k) campo = reglas[k] }
    if (campo) out[h] = campo
  }
  return out
}

export function PerfilesClient({ perfiles }: { perfiles: PerfilDatos[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<PerfilDatos | 'nuevo' | null>(null)

  async function eliminar(p: PerfilDatos) {
    if (p.es_sistema) { toast.error('No se puede eliminar un perfil de sistema'); return }
    if (!confirm(`¿Eliminar el perfil "${p.nombre}"?`)) return
    const r = await fetch(`/api/centro-datos/perfiles?id=${p.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Perfil eliminado'); router.refresh() } else { toast.error('No se pudo eliminar') }
  }

  const imports = perfiles.filter((p) => p.direccion === 'import')
  const exports = perfiles.filter((p) => p.direccion === 'export')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{perfiles.length} perfiles</div>
        <Button size="sm" onClick={() => setEdit('nuevo')}><Plus className="size-4" /> Nuevo perfil</Button>
      </div>

      <Grupo titulo="Importación" icon={Upload} perfiles={imports} onEdit={setEdit} onDelete={eliminar} />
      <Grupo titulo="Exportación (formato SIFACO)" icon={Download} perfiles={exports} onEdit={setEdit} onDelete={eliminar} />

      {edit && (
        <PerfilSheet
          perfil={edit === 'nuevo' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function Grupo({ titulo, icon: Icon, perfiles, onEdit, onDelete }: { titulo: string; icon: any; perfiles: PerfilDatos[]; onEdit: (p: PerfilDatos) => void; onDelete: (p: PerfilDatos) => void }) {
  if (!perfiles.length) return null
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Icon className="size-4" /> {titulo}</div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Perfil</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Formato</th><th className="px-3 py-2">Frecuencia</th><th className="px-3 py-2 text-right">Columnas</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id} className="border-t border-border/60">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 font-medium">{p.nombre} {p.es_sistema && <Lock className="size-3 text-muted-foreground" />}</div>
                  {p.descripcion && <div className="max-w-[320px] truncate text-xs text-muted-foreground">{p.descripcion}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{TIPO_PERFIL_LABEL[p.tipo]}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="uppercase text-[10px]">{p.formato}</Badge></td>
                <td className="px-3 py-2 text-xs">{FRECUENCIA_LABEL[p.frecuencia]}</td>
                <td className="px-3 py-2 text-right text-xs">{Object.keys(p.mapeo_columnas ?? {}).length}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(p)}><Pencil className="size-3.5" /></Button>
                    {!p.es_sistema && <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => onDelete(p)}><Trash2 className="size-3.5" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PerfilSheet({ perfil, onClose, onSaved }: { perfil: PerfilDatos | null; onClose: () => void; onSaved: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(perfil?.descripcion ?? '')
  const [direccion, setDireccion] = useState<DireccionDatos>(perfil?.direccion ?? 'import')
  const [tipo, setTipo] = useState<TipoPerfilDatos>(perfil?.tipo ?? 'productos')
  const [formato, setFormato] = useState<FormatoDatos>(perfil?.formato ?? 'xlsx')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaDatos>(perfil?.frecuencia ?? 'manual')
  const [separador, setSeparador] = useState<string>((perfil?.opciones?.separador as string) ?? ';')
  const [decimales, setDecimales] = useState<string>((perfil?.opciones?.decimales as string) ?? '.')
  const [headers, setHeaders] = useState<string[]>(Object.keys(perfil?.mapeo_columnas ?? {}))
  const [mapeo, setMapeo] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const [k, v] of Object.entries(perfil?.mapeo_columnas ?? {})) m[k] = String(v)
    return m
  })
  const [guardando, setGuardando] = useState(false)

  const camposDisponibles = useMemo(() => CAMPOS_SISTEMA.filter((c) => c.tipos.includes(tipo) || c.value === 'ignorar'), [tipo])

  async function subirEjemplo(f: File) {
    try {
      const { headers } = await parseSpreadsheet(f)
      if (!headers.length) { toast.error('No se detectaron columnas'); return }
      setHeaders(headers)
      const auto = autoMap(headers, tipo)
      const m: Record<string, string> = {}
      for (const h of headers) m[h] = auto[h] ?? NONE
      setMapeo(m)
      toast.success(`${headers.length} columnas detectadas · ${Object.keys(auto).length} auto-mapeadas`)
    } catch (e: any) { toast.error('No se pudo leer: ' + (e?.message ?? '')) }
  }

  async function guardar() {
    if (!nombre.trim()) { toast.error('Poné un nombre'); return }
    const mapeo_columnas: Record<string, string> = {}
    for (const [col, campo] of Object.entries(mapeo)) {
      if (campo && campo !== NONE) {
        // import: columna archivo → campo sistema. export: campo sistema → columna salida.
        mapeo_columnas[col] = campo
      }
    }
    setGuardando(true)
    try {
      const r = await fetch('/api/centro-datos/perfiles', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: perfil?.id, nombre, descripcion, direccion, tipo, formato, frecuencia,
          mapeo_columnas, opciones: { separador, decimales, con_encabezado: true },
        }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Perfil guardado'); onSaved()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setGuardando(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{perfil ? `Editar: ${perfil.nombre}` : 'Nuevo perfil de mapeo'}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label className="text-xs">Nombre *</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Productos SIFACO" /></div>
            <div className="sm:col-span-2"><Label className="text-xs">Descripción</Label><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Dirección</Label>
              <Select value={direccion} onValueChange={(v) => setDireccion(v as DireccionDatos)} disabled={!!perfil?.es_sistema}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="import">Importar</SelectItem><SelectItem value="export">Exportar</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de datos</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoPerfilDatos)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{TIPO_PERFIL_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formato</Label>
              <Select value={formato} onValueChange={(v) => setFormato(v as FormatoDatos)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(['xls', 'xlsx', 'csv', 'txt'] as FormatoDatos[]).map((f) => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Frecuencia</Label>
              <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as FrecuenciaDatos)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FRECS.map((f) => <SelectItem key={f} value={f}>{FRECUENCIA_LABEL[f]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Separador (CSV/TXT)</Label>
              <Select value={separador} onValueChange={setSeparador}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value=";">; (punto y coma)</SelectItem><SelectItem value=",">, (coma)</SelectItem><SelectItem value="\t">tab</SelectItem><SelectItem value="|">| (pipe)</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Decimales</Label>
              <Select value={decimales} onValueChange={setDecimales}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value=".">. punto (1234.56)</SelectItem><SelectItem value=",">, coma (1.234,56)</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {/* Mapeo */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Mapeo de columnas</div>
              <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirEjemplo(f) }} />
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><Upload className="size-3.5" /> Archivo de ejemplo</Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {direccion === 'import' ? 'Asigná cada columna del archivo a un campo del sistema.' : 'Asigná cada campo del sistema a la columna de salida que SIFACO espera.'}
            </p>
            {headers.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-1 rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
                <FileSpreadsheet className="size-5" /> Subí un archivo de ejemplo para detectar las columnas.
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {headers.map((h) => (
                  <div key={h} className="grid grid-cols-2 items-center gap-2">
                    <div className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs" title={h}>{h}</div>
                    <Select value={mapeo[h] ?? NONE} onValueChange={(v) => setMapeo((m) => ({ ...m, [h]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— ignorar —</SelectItem>
                        {camposDisponibles.filter((c) => c.value !== 'ignorar').map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pb-6">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={guardando} onClick={guardar}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Guardar perfil</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
