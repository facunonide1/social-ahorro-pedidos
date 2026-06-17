# 🔍 Auditoría de gaps · NORA HQ (F6-T · T13)

Relevamiento de rutas y hallazgos. Severidad: 🔴 alta / 🟡 media / 🟢 baja.

## a) Adjuntos / comprobantes (prioridad máxima) ✅ infra + 4 entidades

Infra: tabla polimórfica `adjuntos` (migración `0039`, aplicada) + bucket privado
`comprobantes` (0037) + componente drop-in `<Comprobantes entidadTipo entidadId />`
(`components/shared/comprobantes.tsx`) con subida (foto cámara en mobile + archivo/
PDF), lista con URLs firmadas, descarga y borrado.

| Entidad | Ruta detalle | Estado |
|---------|--------------|--------|
| Facturas proveedor | `/hub/facturas/[id]` | ✅ wireado (`entidadTipo="factura"`) |
| Pagos | `/hub/pagos/[id]` | ✅ wireado (`pago`) |
| Recepciones | `/hub/recepciones/[id]` | ✅ wireado (`recepcion`, "remito firmado") |
| Devoluciones | `/hub/compras/devoluciones/[id]` | ✅ wireado (`devolucion`) |
| Gastos operativos | `/hub/sucursales/gastos` (sin detalle) | 🟡 pendiente: no hay página `[id]`. Drop-in cuando se cree el detalle, o agregar el uploader al form de alta con `entidadTipo="gasto"`. |
| Cheques | `/hub/finanzas/cheques` (sin detalle) | 🟡 pendiente: ídem, `entidadTipo="cheque"`. |

> Drop-in para los pendientes (1 línea en el detalle/form de la entidad):
> `<Comprobantes entidadTipo="gasto" entidadId={gasto.id} />`

## b) Forms — hallazgos
- 🟡 Gastos/cheques sin pantalla de detalle navegable (solo listado) → impide
  adjuntar comprobante con el patrón estándar. Recomendado: crear `[id]` o sheet
  de detalle.
- 🟢 Validaciones zod: F2–F5 usan `useState` (decisión F6). Migración a rhf+zod
  queda como mejora transversal futura (no bloqueante).

## c) Botones muertos / links rotos
- ✅ "Admin Hub (nuevo)" del CRM eliminado (F6.5 T3).
- 🟢 Ítems de sidebar a rutas no creadas → muestran toast "En construcción"
  (patrón `estado: 'placeholder'`), no rompen.

## d) Detalles navegables
- ✅ Facturas/pagos/recepciones/devoluciones/proveedores/clientes/tareas con
  detalle. 🟡 Gastos y cheques sin detalle (ver arriba).

## e) Empty states / breadcrumbs / mobile
- ✅ Empty states en módulos nuevos F6-T (turnos, recurrencias, catálogo,
  verificaciones, bandeja por tab).
- ✅ Breadcrumbs vía `PageHeader` en todas las pantallas nuevas.
- 🟡 Audit mobile 375px completo en pantallas legacy F2–F5: pendiente pasada
  dedicada (las nuevas F6-T son responsive).

## f) Identidad
- ✅ "SA Hub"/"Admin Hub" reemplazados por NORA HQ (F6.5 T2). Bug header search
  overlap arreglado (F6.5 T1).
- 🟢 Colores hardcodeados puntuales (hex en seeds de tipos) son intencionales
  (color del tipo de tarea), no rompen la paleta.

## Pendientes priorizados (no bloqueantes)
1. 🟡 Detalle de gastos y cheques + wiring de `<Comprobantes>`.
2. 🟡 Audit mobile 375px de pantallas legacy F2–F5.
3. 🟢 Migración forms a rhf+zod (transversal).
