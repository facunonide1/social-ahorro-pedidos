# 🔐 Usuarios y permisos finos (v0.26)

Una sola gestión para **empleados** (legajo RRHH) y **usuarios del panel**
(acceso + rol + permisos), en `/admin/configuracion/usuarios`.

## Modelo de datos

- **`empleados`** (RRHH): legajo, gamificación, `user_id` → enlaza a la cuenta de
  panel (auth.users.id = `users_admin.id`). `sucursales_acceso[]`.
- **`users_admin`** (panel): `rol` (enum `admin_role`), `sucursal_id`,
  `sucursales_acceso[]` (v0.26), `activo`, `permisos_custom` (jsonb).
- **Una persona** = empleado, usuario del panel, o **ambos** (vinculados por
  `empleados.user_id`). La pantalla las muestra a todas; acciones **"Dar acceso"**
  (crea/reusa la cuenta y la vincula al legajo) y **"Vincular a legajo"**.
- Backups conservadores: `backup_users_admin_v26`, `backup_empleados_v26`.

## Roles base (catálogo v2)

| Rol | Para qué |
|-----|----------|
| `super_admin` | Dueño. Todo, incluida la configuración. |
| `gerente` | Gestión global (todo salvo administrar usuarios). |
| `encargado_sucursal` | Encargado: opera su sucursal, caja, tareas, faltantes. |
| `comprador` | Compras, listas de precios, importación SIFACO. |
| `tesoreria` | Finanzas, caja general, aprueba pagos/retiros. |
| `cajero` | Opera su caja y pedidos (no ve saldo de caja general). |
| `repartidor` | Pedidos / entregas. |
| `rrhh` | Legajos, tareas del equipo. |
| `marketing` | Ofertas, CRM, BI. |
| `empleado_general` | Mi panel, tareas propias, comunicación. |
| `auditor` | Solo lectura en todo. |

**Legacy mapeados** (se evitan en altas nuevas, conviven con preset):
`administrativo` (≈ finanzas+RRHH+CRM), `sucursal` (= `encargado_sucursal`).

## Permisos finos: 18 módulos × 5 acciones

Acciones: **Ver · Crear · Editar · Aprobar · Eliminar**.

Módulos: `mission_control`, `comunicacion`, `tareas`, `operaciones`, `compras`,
`finanzas`, `caja`, `centro_datos`, `ofertas`, `clientes`, `pedidos`,
`sucursales`, `rrhh`, `aprobaciones`, `bi`, `ia`, `auditoria`, `configuracion`.

**Permiso efectivo = preset del rol ⊕ overrides** (`permisos_custom`). En la UI se
guarda solo el *diff* contra el preset (`diffContraPreset`), y las celdas
overrideadas se resaltan (`esOverride`). Todo en `lib/types/permisos.ts`:
`permisosEfectivos(rol, custom)`, `puede(rol, custom, modulo, accion)`.

### Sub-permisos sensibles (granularidad fina)
- `puedeVerSaldoCajaGeneral` → super_admin / gerente / tesorería (o caja:aprobar).
- `puedeAprobarRetiros` → `aprobaciones:aprobar` ∨ `caja:aprobar`.
- `puedeEditarPrecios` → `ofertas:editar` ∨ `operaciones:editar`.

## Dónde se aplica (UI + backend)

- **Sidebar/top-nav**: `navegacionParaUsuario(rol, permisosCustom)` muestra solo
  los sectores con `puede(modulo, 'ver')` (`moduloDeHref` mapea cada ruta a su
  módulo). super_admin ve todo; links externos siempre.
- **Backend (403 real, no solo ocultar)**: `lib/admin-hub/permisos-server.ts`
  → `requirePermiso(modulo, accion)`. Ya aplicado en:
  - `POST /api/finanzas/caja` (aprobar/rechazar retiros) → `puedeAprobarRetiros`.
  - `POST /api/finanzas/pagos` (ejecutar pago) → `finanzas:aprobar`.
  - `POST /api/ofertas` (gestionar/aprobar/rechazar) → `ofertas:crear|editar|aprobar`.
  - Resto de APIs: ir migrando sus gates de rol a `requirePermiso` por sector.
- **Sucursales**: `users_admin.sucursales_acceso[]` + `sucursal_id` se cruzan con
  el selector de sucursal global (un encargado ve solo su(s) sucursal(es)).

## Salvaguardas
- Un super_admin no puede auto-desactivarse ni bajarse el rol (UI + API).
- "Dar acceso" reusa el auth user existente del empleado si ya lo tiene (no
  duplica cuentas).
