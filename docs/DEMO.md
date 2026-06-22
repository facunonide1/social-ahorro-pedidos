# 🎭 Datos demo

El sistema se puede poblar con datos ficticios coherentes (todos `es_demo` o con
SKU `DEMO-`) para probarlo, y limpiarlos para arrancar real. Desde
**Configuración general → Datos de demostración** (solo super_admin).

## Cargar (`seed_demo_maestro()`, migr. 0066)
Interconectado por los mismos IDs, para las 4 sucursales:
- **120 productos** DEMO (rubros farmacia/perfumería/súper, barras, laboratorio,
  droga, precio, `ventas_mensuales` MES_ACT+ANT_1..6).
- **stock** por sucursal (góndola/depósito) con variedad por `hashtext(sku)`:
  rápidos con poco stock (quiebres), dormidos con mucho stock sin venta, normales.
- **~7.600 ventas diarias** (45 días) con rotación variada.
- **150 clientes** B2C (5 fuentes, niveles, riesgo de churn, frecuencia).
- **48 arqueos de caja** (algunos con descuadre para el control anti-robo).
- **3 ofertas** activas (dos por vencer).

Enciende: recomendaciones de compra, dinero dormido, control de caja, análisis de
ventas, segmentos de CRM, auditor de NORA. Idempotente (no duplica).

## Archivos de ejemplo estilo SIFACO (T6)
`/api/centro-datos/archivo-ejemplo?tipo=productos|ventas|clientes` genera con
SheetJS archivos ficticios con el **formato real** para practicar la importación:
- `productos_sifaco_demo.xls` (26 columnas: DESCRIP, PRECIO, STOCK, CODIGO, BARRAS,
  RUBRO, MES_ACT, ANT_1..6, NOM_LAB, DROGA, NOM_PROMO, …).
- `ventas_diarias_demo.csv` (CODIGO, DESCRIP, CANT, IMPORTE).
- `clientes_demo.xls` (NOMBRE, DOC, TEL, EMAIL).
Botones de descarga en **Centro de Datos → Importar**.

## Limpiar (`limpiar_demo()`, migr. 0067)
Borra **SOLO** `es_demo=true` (en orden FK-safe, hijos→padres) + productos
`DEMO-`. Los datos reales (`es_demo=false`) **NUNCA** se tocan — verificado con
centinelas: un cliente/producto real sobrevive, el demo queda en cero.
- UI con protección: escribir **CONFIRMAR**, solo super_admin, muestra el conteo
  de registros demo antes de borrar.
- `contar_demo()` da el conteo en vivo.

## Seguridad
`seed_demo_maestro`/`limpiar_demo`/`contar_demo` son `SECURITY DEFINER` pero con
`EXECUTE` **revocado de PUBLIC** y otorgado solo a `service_role`: únicamente la
API (`/api/admin/demo-maestro`, gateada a super_admin) puede invocarlas.
