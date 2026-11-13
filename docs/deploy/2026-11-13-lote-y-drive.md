# Paquete de deploy · carga en lote y ingesta de Drive (2026-11-13)

Rama `fix/lote-y-drive-ingesta` (PR en borrador contra `main`). Producción hoy: `main` @ `fa7a354` (#11).

**Sin migraciones, sin cambios de RLS, sin secretos nuevos en el código.** Nunca se aplica un maestro de SIFACO: la ingesta los estaciona o los marca para subir a mano.

## Antes de mergear

1. Mirá el preview de este PR:
   - `/admin/finanzas/documentos/lote`: elegí 2 o 3 facturas con «Elegir archivos». Tienen que aparecer en la lista y pasar a «Leyendo» / «Listo para revisar». Un PDF de más de 4,4 MB tiene que decir cuánto pesa, no quedar mudo.
   - `/admin/configuracion/integraciones/google-drive` → «Ver estado»: dice si está `CRON_SECRET` y muestra las últimas corridas.
2. En Vercel → Settings → Environment Variables (Production), comprobá que existan:
   - `CRON_SECRET` (cualquier valor largo). **Sin esta variable Vercel no manda el header y el cron nunca entra** (ahora contesta 503 y lo dice en el log).
   - `DRIVE_INGESTA_ENABLED=true`.
   - Opcionales: `DRIVE_PRESUPUESTO_MS` (por defecto 40000), `DRIVE_CARPETAS_COMPRAS` (por defecto `compras farmacias|compras farmacias (privado)`).
3. Plan de Vercel: el cron de la ingesta corre cada 30 minutos. En el plan Hobby los crons solo pueden correr una vez por día; si el proyecto es Hobby, avisá y lo paso a diario (o se dispara a mano).

## Deploy

1. Mergear el PR a `main` (lo hacés vos).
2. Esperar el deploy de producción en verde.

## Después del deploy (en este orden)

1. Google Drive → **«Destrabar»**: lo que quedó «procesando» (la planilla «Compras y precios por droguería», desde las 16:36 UTC) vuelve a la cola. Igual se libera solo en la primera corrida: su lock venció.
2. **«Agregar las carpetas de compras»**: busca «compras farmacias» y «compras farmacias (privado)» por nombre exacto (Mi unidad y compartidas) y las suma con subcarpetas, sin sacar las que ya estaban. Si alguna dice «no la encontré» o «hay N con ese nombre», elegila a mano con el buscador de carpetas de la misma pantalla.
3. **«Procesar ahora»** y después **«Ver estado»**: tiene que aparecer una corrida manual con lo encolado y lo procesado.
4. A los 30 minutos, **«Ver estado»** otra vez: tiene que aparecer una corrida `cron`. Si no aparece, el cron no está llegando (ver punto 2 y 3 de «Antes»).

Qué esperar en la cola:
- Los 4 maestros (figueiras / guz gon, ~42 MB) pasan a **«previa»** sin bajarse, con el motivo «la ingesta no lo baja ni lo aplica: subilo a mano en /admin/operaciones/sifaco». Ya no traban la cola.
- La planilla «Compras y precios por droguería» se procesa **por partes** (4 droguerías por corrida); mientras tanto figura «pendiente» con `destino_ref = parcial:N/M`.
- Las listas de las carpetas de compras entran como **precios**, con la droguería (nombre o subcarpeta) y su **fecha** (nombre, carpeta, contenido o, último, la de Drive). Una lista más vieja que la vigente queda como historial y no la reemplaza.

## Rollback

- **Rápido (sin código):** Vercel → Deployments → el deploy de `fa7a354` → «Promote to Production».
- **Con git:** `git revert -m 1 <merge del PR>` en `main` y deploy.
- **Datos:** nada para deshacer en el esquema. Lo que la nueva versión escribe es reversible con lo de siempre:
  - Listas aplicadas: «Revertir» en la bandeja de Drive (vuelve la anterior a vigente).
  - Estados de la cola: «Destrabar» o, en la versión vieja, las acciones de clasificar.
  - `integraciones_google_drive.listado_cursor` ahora guarda además `partes` y `corridas`; la versión vieja las ignora y las pisa en su próximo listado.

## Consultas de diagnóstico (solo lectura)

```sql
select estado, count(*) from drive_archivos_ingestados group by 1;
select nombre, estado, intentos, proximo_intento_at, updated_at, error
  from drive_archivos_ingestados where estado in ('procesando','pendiente','previa') order by updated_at desc limit 20;
select listado_cursor->'corridas' from integraciones_google_drive order by connected_at desc limit 1;
select folder_nombre, incluir_subcarpetas from integraciones_google_drive_carpetas;
```
