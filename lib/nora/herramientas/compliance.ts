/**
 * OS-5b · Herramientas de COMPLIANCE para NORA. registrar_despacho es GLOBAL
 * (mostrador, todos los roles). CP-01: solo producto + turno + quién/cuándo.
 */
import { turnoActual, TURNO_LABEL, diasSinTrazabilidad, papelesEnAlerta } from '@/lib/compliance/helpers'
import type { Herramienta } from './tipos'
import { buscarProductos } from './_comun'

export const HERRAMIENTAS_COMPLIANCE: Herramienta[] = [
  {
    id: 'registrar_despacho',
    nombre: 'Registrar un despacho de controlado',
    descripcion: 'Anota el despacho de un medicamento controlado (registro interno: producto + turno). NO pide ni guarda datos de médico, paciente ni receta.',
    global: true,
    permiso: null,
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto despachado', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
    ],
    armarConfirmacion: async (adm, v) => {
      const { data: p } = await adm.from('productos_catalogo').select('nombre, es_controlado').eq('id', v.producto).maybeSingle()
      return { titulo: 'Registrar despacho', campos: [{ label: 'Producto', valor: p?.nombre ?? '—' }, { label: 'Turno', valor: TURNO_LABEL[turnoActual()] }], advertencias: p?.es_controlado ? [] : ['Ojo: ese producto no está marcado como controlado.'] }
    },
    ejecutar: async (adm, v, ctx) => {
      const { data, error } = await adm.from('compliance_despachos').insert({ producto_id: v.producto, sucursal_id: ctx.esTodas ? null : ctx.sucursalId, turno: turnoActual(), registrado_por: ctx.userId }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      const { data: p } = await adm.from('productos_catalogo').select('nombre').eq('id', v.producto).maybeSingle()
      return { ok: true, texto: `✓ Despacho de ${p?.nombre ?? 'producto'} registrado (turno ${TURNO_LABEL[turnoActual()]}). La receta va al libro recetario.`, entidad_id: data?.id }
    },
  },
  {
    id: 'consultar_trazabilidad',
    nombre: 'Consultar estado de trazabilidad',
    descripcion: 'Responde qué sucursales tienen la trazabilidad ANMAT atrasada. Solo lectura.',
    subapp: 'compliance',
    soloLectura: true,
    permiso: { modulo: 'operaciones', accion: 'ver' },
    slots: [],
    responder: async (adm) => {
      const traz = await diasSinTrazabilidad(adm)
      const atrasadas = traz.filter((t) => t.dias >= 1).sort((a, b) => b.dias - a.dias)
      if (!atrasadas.length) return { texto: 'Trazabilidad al día en todas las sucursales. 👌' }
      return { texto: `Trazabilidad ANMAT:\n${atrasadas.map((t) => `• ${t.nombre}: ${t.dias === 99 ? 'nunca cargada' : `${t.dias} día(s) sin cargar`}${t.dias >= 3 ? ' ⚠️' : ''}`).join('\n')}` }
    },
  },
  {
    id: 'consultar_papeles',
    nombre: 'Consultar papeles por vencer',
    descripcion: 'Responde qué papeles de sucursal están por vencer o vencidos. Solo lectura.',
    subapp: 'compliance',
    soloLectura: true,
    permiso: { modulo: 'operaciones', accion: 'ver' },
    slots: [],
    responder: async (adm) => {
      const pap = await papelesEnAlerta(adm, 30)
      if (!pap.length) return { texto: 'No hay papeles por vencer en los próximos 30 días. 👌' }
      return { texto: `Papeles en alerta:\n${pap.map((p) => `• ${p.sucursal} · ${p.tipo}: ${p.dias < 0 ? `VENCIDO hace ${-p.dias}d` : `vence en ${p.dias}d`}`).join('\n')}` }
    },
  },
]
