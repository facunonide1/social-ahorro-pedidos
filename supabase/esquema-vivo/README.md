# Esquema vivo

DDL de piezas que existen en la base de producción y **no** están en ninguna
migración (se aplicaron a mano o por MCP). Se guarda acá como referencia, para
poder leerlas y arreglarlas con una migración nueva. **Nada de esta carpeta se
aplica.**

Se genera con `supabase/consultas/esquema_vivo.sql` (sólo lectura). Hoy faltan:

- `decisiones_pendientes` (vista) — A4
- `proveedores_detectar` (función) — avisos de proveedores
- `sifaco_aplicar_maestro`, `sifaco_aplicar_sucursales` (funciones) — C1
- `rls_escrituras_que_dan_lectura` (función) — auditor de RLS
- `producto_stock_sifaco` (tabla) — C1
