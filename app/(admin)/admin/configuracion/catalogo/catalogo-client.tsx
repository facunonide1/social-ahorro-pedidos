'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Upload, Search, Package, Pill, Snowflake, FileWarning } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  PRODUCTO_CATEGORIAS,
  PRODUCTO_CATEGORIA_LABELS,
  type ProductoCatalogo,
  type ProductoCatalogoCategoria,
  type VademecumData,
} from '@/lib/types/catalogo'
import { formatARS } from '@/lib/utils/format'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const ALL = '__all__'

export function CatalogoClient({
  productos,
  laboratorios,
  loadError,
}: {
  productos: ProductoCatalogo[]
  laboratorios: string[]
  loadError: string | null
}) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(ALL)
  const [lab, setLab] = useState<string>(ALL)
  const [receta, setReceta] = useState<string>(ALL)
  const [psico, setPsico] = useState<string>(ALL)
  const [editing, setEditing] = useState<ProductoCatalogo | null>(null)
  const [creating, setCreating] = useState(false)

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return productos.filter((p) => {
      if (cat !== ALL && p.categoria !== cat) return false
      if (lab !== ALL && p.laboratorio !== lab) return false
      if (receta !== ALL && String(p.requiere_receta) !== receta) return false
      if (psico !== ALL && String(p.es_psicotropico) !== psico) return false
      if (term) {
        const hay = `${p.nombre} ${p.sku} ${p.codigo_barras ?? ''}`.toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [productos, q, cat, lab, receta, psico])

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <FileWarning className="size-4" /> No se pudo leer el catálogo
        </div>
        <p className="mt-1 text-muted-foreground">
          ¿Está aplicada la migración <code>0036_catalogo_productos.sql</code>?
          Detalle: {loadError}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, SKU o código de barras…"
            className="h-9 pl-8"
          />
        </div>
        <FilterSelect value={cat} onChange={setCat} placeholder="Categoría">
          {PRODUCTO_CATEGORIAS.map((c) => (
            <SelectItem key={c} value={c}>
              {PRODUCTO_CATEGORIA_LABELS[c]}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={lab} onChange={setLab} placeholder="Laboratorio">
          {laboratorios.map((l) => (
            <SelectItem key={l} value={l}>
              {l}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={receta} onChange={setReceta} placeholder="Receta">
          <SelectItem value="true">Requiere receta</SelectItem>
          <SelectItem value="false">Venta libre</SelectItem>
        </FilterSelect>
        <FilterSelect value={psico} onChange={setPsico} placeholder="Psicotrópico">
          <SelectItem value="true">Psicotrópico</SelectItem>
          <SelectItem value="false">No psicotrópico</SelectItem>
        </FilterSelect>

        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/configuracion/catalogo/importar">
              <Upload className="size-4" />
              Importar CSV
            </Link>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtrados.length} de {productos.length} productos
      </div>

      {productos.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Categoría</th>
                <th className="px-3 py-2 font-medium">Laboratorio</th>
                <th className="px-3 py-2 text-right font-medium">P. sugerido</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      {p.nombre}
                      {p.requiere_receta && <Pill className="size-3 text-amber-500" aria-label="Requiere receta" />}
                      {p.es_refrigerado && <Snowflake className="size-3 text-sky-500" aria-label="Refrigerado" />}
                    </div>
                    {p.presentacion && (
                      <div className="text-xs text-muted-foreground">{p.presentacion}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="font-normal">
                      {PRODUCTO_CATEGORIA_LABELS[p.categoria]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.laboratorio || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {p.precio_sugerido != null ? formatARS(p.precio_sugerido) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Sin resultados para los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <ProductoSheet
          producto={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  children: React.ReactNode
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[150px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}: todas</SelectItem>
        {children}
      </SelectContent>
    </Select>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <Package className="size-8 text-muted-foreground" />
      <div>
        <div className="font-medium">Sin productos en el catálogo</div>
        <div className="mt-0.5 max-w-sm text-sm text-muted-foreground">
          Cargá tu vademécum para enriquecer la info de productos: foto, droga,
          comisión, sustitutos y más.
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          Nuevo producto
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/configuracion/catalogo/importar">
            <Upload className="size-4" />
            Importar CSV
          </Link>
        </Button>
      </div>
    </div>
  )
}

function ProductoSheet({
  producto,
  onClose,
}: {
  producto?: ProductoCatalogo
  onClose: () => void
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const editing = Boolean(producto)

  const vd = (producto?.vademecum_data ?? {}) as VademecumData
  const [form, setForm] = useState({
    sku: producto?.sku ?? '',
    codigo_barras: producto?.codigo_barras ?? '',
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    categoria: (producto?.categoria ?? 'otros') as ProductoCatalogoCategoria,
    subcategoria: producto?.subcategoria ?? '',
    laboratorio: producto?.laboratorio ?? '',
    presentacion: producto?.presentacion ?? '',
    droga_principal: producto?.droga_principal ?? '',
    requiere_receta: producto?.requiere_receta ?? false,
    es_psicotropico: producto?.es_psicotropico ?? false,
    es_refrigerado: producto?.es_refrigerado ?? false,
    foto_url: producto?.foto_url ?? '',
    precio_sugerido: producto?.precio_sugerido?.toString() ?? '',
    precio_costo_promedio: producto?.precio_costo_promedio?.toString() ?? '',
    comision_empleado_pct: producto?.comision_empleado_pct?.toString() ?? '0',
    stock_minimo_global: producto?.stock_minimo_global?.toString() ?? '',
    activo: producto?.activo ?? true,
  })
  const [vade, setVade] = useState<VademecumData>({
    para_que_sirve: vd.para_que_sirve ?? '',
    dosis: vd.dosis ?? '',
    contraindicaciones: vd.contraindicaciones ?? '',
    interacciones: vd.interacciones ?? '',
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    if (!form.sku.trim() || !form.nombre.trim()) {
      toast.error('SKU y nombre son obligatorios.')
      return
    }
    const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s))
    const vademecum_data = Object.fromEntries(
      Object.entries(vade).filter(([, v]) => (v ?? '').toString().trim() !== ''),
    )

    const payload = {
      sku: form.sku.trim(),
      codigo_barras: form.codigo_barras.trim() || null,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria,
      subcategoria: form.subcategoria.trim() || null,
      laboratorio: form.laboratorio.trim() || null,
      presentacion: form.presentacion.trim() || null,
      droga_principal: form.droga_principal.trim() || null,
      requiere_receta: form.requiere_receta,
      es_psicotropico: form.es_psicotropico,
      es_refrigerado: form.es_refrigerado,
      foto_url: form.foto_url.trim() || null,
      vademecum_data,
      precio_sugerido: numOrNull(form.precio_sugerido),
      precio_costo_promedio: numOrNull(form.precio_costo_promedio),
      comision_empleado_pct: Number(form.comision_empleado_pct || '0'),
      stock_minimo_global: numOrNull(form.stock_minimo_global),
      activo: form.activo,
    }

    setBusy(true)
    try {
      if (editing) {
        const { error } = await sb
          .from('productos_catalogo')
          .update(payload)
          .eq('id', producto!.id)
        if (error) throw new Error(error.message)
        toast.success('Producto actualizado.')
      } else {
        const { error } = await sb.from('productos_catalogo').insert(payload)
        if (error) throw new Error(error.message)
        toast.success('Producto creado.')
      }
      onClose()
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU *">
              <Input value={form.sku} onChange={(e) => patch('sku', e.target.value)} disabled={editing} />
            </Field>
            <Field label="Código de barras">
              <Input value={form.codigo_barras} onChange={(e) => patch('codigo_barras', e.target.value)} />
            </Field>
          </div>
          <Field label="Nombre *">
            <Input value={form.nombre} onChange={(e) => patch('nombre', e.target.value)} />
          </Field>
          <Field label="Descripción">
            <Textarea value={form.descripcion} onChange={(e) => patch('descripcion', e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select value={form.categoria} onValueChange={(v) => patch('categoria', v as ProductoCatalogoCategoria)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCTO_CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>{PRODUCTO_CATEGORIA_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategoría">
              <Input value={form.subcategoria} onChange={(e) => patch('subcategoria', e.target.value)} />
            </Field>
            <Field label="Laboratorio">
              <Input value={form.laboratorio} onChange={(e) => patch('laboratorio', e.target.value)} />
            </Field>
            <Field label="Presentación">
              <Input value={form.presentacion} onChange={(e) => patch('presentacion', e.target.value)} placeholder="ej. 30 comp" />
            </Field>
            <Field label="Droga principal">
              <Input value={form.droga_principal} onChange={(e) => patch('droga_principal', e.target.value)} />
            </Field>
            <Field label="Foto (URL)">
              <Input value={form.foto_url} onChange={(e) => patch('foto_url', e.target.value)} placeholder="https://…" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <Check label="Requiere receta" checked={form.requiere_receta} onChange={(v) => patch('requiere_receta', v)} />
            <Check label="Psicotrópico" checked={form.es_psicotropico} onChange={(v) => patch('es_psicotropico', v)} />
            <Check label="Refrigerado" checked={form.es_refrigerado} onChange={(v) => patch('es_refrigerado', v)} />
            {editing && <Check label="Activo" checked={form.activo} onChange={(v) => patch('activo', v)} />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Precio sugerido">
              <Input type="number" value={form.precio_sugerido} onChange={(e) => patch('precio_sugerido', e.target.value)} />
            </Field>
            <Field label="Costo promedio">
              <Input type="number" value={form.precio_costo_promedio} onChange={(e) => patch('precio_costo_promedio', e.target.value)} />
            </Field>
            <Field label="Comisión empleado %">
              <Input type="number" value={form.comision_empleado_pct} onChange={(e) => patch('comision_empleado_pct', e.target.value)} />
            </Field>
            <Field label="Stock mínimo global">
              <Input type="number" value={form.stock_minimo_global} onChange={(e) => patch('stock_minimo_global', e.target.value)} />
            </Field>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-medium">Vademécum</div>
            <div className="space-y-2">
              <Field label="¿Para qué sirve?">
                <Textarea value={vade.para_que_sirve} onChange={(e) => setVade((v) => ({ ...v, para_que_sirve: e.target.value }))} rows={2} />
              </Field>
              <Field label="Dosis">
                <Textarea value={vade.dosis} onChange={(e) => setVade((v) => ({ ...v, dosis: e.target.value }))} rows={2} />
              </Field>
              <Field label="Contraindicaciones">
                <Textarea value={vade.contraindicaciones} onChange={(e) => setVade((v) => ({ ...v, contraindicaciones: e.target.value }))} rows={2} />
              </Field>
              <Field label="Interacciones">
                <Textarea value={vade.interacciones} onChange={(e) => setVade((v) => ({ ...v, interacciones: e.target.value }))} rows={2} />
              </Field>
            </div>
          </div>

          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[hsl(var(--primary))]"
      />
      {label}
    </label>
  )
}
