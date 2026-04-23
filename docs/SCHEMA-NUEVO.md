# Schema nuevo · Admin Hub

> Todas las tablas son **nuevas**. No se modifica ninguna tabla existente.
> Naming en snake_case. Enums en singular sin prefijo de tabla.
> Archivo: `supabase/migrations/0016_admin_hub_schema.sql`.

## Decisiones de diseño relevantes

1. **`users_admin` en lugar de `roles_admin`**. El prompt original propuso `roles_admin` pero el nombre es confuso porque la fila modela al usuario, no al rol. La tabla tiene una columna `rol` que usa el enum `admin_role`.

2. **Sistema de roles independiente del CRM de pedidos**. No se toca `users_pedidos` ni su enum `pedidos_user_role`. Un mismo `auth.users.id` puede tener fila en ambas tablas; cada subapp usa su propio helper:
   - CRM pedidos: `public.current_pedidos_role()`
   - Admin Hub: `public.current_admin_role()` (nuevo, SECURITY DEFINER)

3. **FK a `orders(id)`**, no `pedidos`. En el repo la tabla de pedidos se llama `orders` (inglés). Por eso las columnas se llaman `order_id` (no `pedido_id`) en `facturas_proveedor` y `recepciones_mercaderia`.

4. **No hay tabla `productos`** en el repo. `recepcion_items.producto_id` queda como `uuid` genérico sin FK. Cuando se cree la tabla de productos, agregar la FK en una migración posterior.

5. **Autonumeración**: `pagos.numero_orden_pago` se completa con un trigger `before insert` (formato `OP-YYYY-NNNN`) usando una secuencia nueva `orden_pago_seq`. Mismo patrón que el código `SA-YYYY-XXXX` de orders.

6. **RLS abierta de lectura / cerrada de escritura**. Todos los roles de `admin_role` pueden leer todas las tablas (patrón permisivo para un equipo chico). Escritura segmentada por rol operativo:
   - `super_admin` / `gerente`: todo
   - `comprador` / `administrativo`: proveedores, documentos, facturas
   - `tesoreria`: cuentas bancarias, pagos
   - `sucursal`: recepciones de su sucursal
   - `auditor`: solo lectura + lectura de `auditoria_logs`
   Refinar por entidad a medida que aparezcan casos reales.

7. **Notificaciones con doble destinatario**. `notificaciones_admin.user_id` (individual) _o_ `rol_destinatario` (broadcast por rol). Check constraint garantiza que al menos uno esté seteado.

8. **Trigger anti-self-edit** en `users_admin` replica el patrón ya usado en `users_pedidos_lock_self`: un usuario no puede cambiar su propio rol ni desactivarse a sí mismo.

## Tablas creadas (14)

### Core del Hub
| Tabla | Propósito |
|---|---|
| `users_admin` | Perfil + rol por usuario del Admin Hub |
| `sucursales` | Ubicaciones físicas de la cadena |
| `auditoria_logs` | Historial genérico de acciones |
| `notificaciones_admin` | Bandeja de alertas / tareas / aprobaciones |

### Proveedores
| Tabla | Propósito |
|---|---|
| `proveedores` | Maestro de proveedores |
| `proveedor_contactos` | Contactos (vendedor, cobranzas, etc.) |
| `proveedor_cuentas_bancarias` | CBU/alias para pagos |
| `proveedor_documentos` | PDFs (constancia CUIT, convenios, listas de precios) con vencimiento opcional |

### Compras y pagos
| Tabla | Propósito |
|---|---|
| `facturas_proveedor` | Facturas A/B/C/M recibidas |
| `factura_items` | Detalle opcional de línea |
| `pagos` | Orden de pago (OP-YYYY-NNNN) |
| `pago_facturas` | Relación N:M con `monto_aplicado` para pagos parciales / múltiples |

### Logística
| Tabla | Propósito |
|---|---|
| `recepciones_mercaderia` | Recepción de un pedido en sucursal |
| `recepcion_items` | Detalle con diferencias (pedido vs recibido vs dañado) |

## Enums creados

| Enum | Valores |
|---|---|
| `condicion_iva` | responsable_inscripto · monotributo · exento · consumidor_final |
| `contacto_rol` | vendedor · cobranzas · logistica · gerencia · otro |
| `tipo_cuenta_bancaria` | caja_ahorro · cuenta_corriente |
| `proveedor_documento_tipo` | constancia_cuit · certificado_iibb · convenio · lista_precios · otro |
| `tipo_factura` | A · B · C · M |
| `factura_estado` | borrador · pendiente_aprobacion · aprobada · programada_pago · pagada_parcial · pagada · vencida · rechazada · anulada |
| `metodo_pago` | transferencia · cheque · echeq · efectivo · tarjeta · otro |
| `pago_estado` | solicitado · aprobado · ejecutado · conciliado · anulado |
| `recepcion_estado` | completa · parcial · con_diferencias · rechazada |
| `admin_role` | super_admin · gerente · comprador · administrativo · tesoreria · auditor · sucursal |
| `notificacion_tipo` | alerta · tarea · info · aprobacion |
| `notificacion_prioridad` | baja · media · alta · critica |

## Relaciones con tablas existentes

| FK | Apunta a | ON DELETE | Comentario |
|---|---|---|---|
| `users_admin.id` | `auth.users(id)` | CASCADE | Si se borra el auth user, se borra su admin |
| `users_admin.sucursal_id` | `sucursales(id)` | SET NULL | Sucursal opcional |
| `sucursales.responsable_id` | `auth.users(id)` | SET NULL | |
| `proveedores.created_by` | `auth.users(id)` | SET NULL | |
| `proveedor_*` anexos → | `proveedores(id)` | CASCADE | Borrar proveedor borra contactos/cuentas/docs |
| `proveedor_documentos.uploaded_by` | `auth.users(id)` | SET NULL | |
| `facturas_proveedor.proveedor_id` | `proveedores(id)` | **RESTRICT** | No se permite borrar proveedor con facturas |
| `facturas_proveedor.order_id` | `orders(id)` | SET NULL | Opcional, vincula factura a un pedido del CRM |
| `facturas_proveedor.sucursal_id` | `sucursales(id)` | SET NULL | |
| `facturas_proveedor.created_by` / `approved_by` | `auth.users(id)` | SET NULL | |
| `factura_items.factura_id` | `facturas_proveedor(id)` | CASCADE | |
| `pagos.proveedor_id` | `proveedores(id)` | **RESTRICT** | |
| `pagos.solicitado_por` / `aprobado_por` / `ejecutado_por` | `auth.users(id)` | SET NULL | |
| `pago_facturas.pago_id` | `pagos(id)` | CASCADE | |
| `pago_facturas.factura_id` | `facturas_proveedor(id)` | **RESTRICT** | No se permite borrar factura con pagos aplicados |
| `recepciones_mercaderia.order_id` | `orders(id)` | SET NULL | |
| `recepciones_mercaderia.sucursal_id` | `sucursales(id)` | SET NULL | |
| `recepciones_mercaderia.recibido_por` | `auth.users(id)` | SET NULL | |
| `recepcion_items.recepcion_id` | `recepciones_mercaderia(id)` | CASCADE | |
| `notificaciones_admin.user_id` | `auth.users(id)` | CASCADE | |
| `auditoria_logs.user_id` | `auth.users(id)` | SET NULL | |

## Integridad adicional

- `facturas_proveedor` tiene `UNIQUE (proveedor_id, tipo_factura, punto_venta, numero_factura)` para impedir cargar dos veces la misma factura.
- `pago_facturas` tiene `UNIQUE (pago_id, factura_id)` y `CHECK (monto_aplicado > 0)`.
- `proveedores.calificacion_interna` con `CHECK (1..5 or null)`.
- `users_admin` bloquea self-edit (rol y activo) vía trigger.
- `notificaciones_admin` requiere `user_id` o `rol_destinatario` via CHECK.

## Qué NO se incluye (fuera de alcance de esta migración)

- Tablas de productos / stock / compras (más allá de factura).
- Integración con AFIP (validación automática de CAE).
- Fronted del Admin Hub.
- Modificar `users_pedidos` ni la función `current_pedidos_role`.
- Tocar nada de la cuponera (ni `public.users` ni `handle_new_user`).

## Cómo aplicar

Revisar contra los repos que comparten el Supabase, coordinar ventana, y:

```bash
# Supabase Dashboard → SQL Editor → pegar el contenido del archivo
# o bien:
supabase db push  # si está configurado el CLI
```

Después, generar tipos TS:

```bash
npx supabase gen types typescript \
  --project-id hrjxjbirajbsurobqdca \
  --schema public \
  > lib/types/db.generated.ts
```

(Requiere `SUPABASE_ACCESS_TOKEN` y que el proyecto esté logueado con `supabase login`.)
