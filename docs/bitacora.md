# Bitácora

## 2026-11-12 · Las compras que ya entraron cruzan con el catálogo

`guardarCompras` insertaba `compras_lineas` sin `producto_id`, `match_score`
ni `match_via`. El comparador de `/admin/compras/donde-comprar` lee las listas
por `producto_id`: una compra sin producto no se puede poner al lado de un
precio. El cruce es el mismo que el de las listas (`matchearProducto`), con
un paso delante.

Primero el código de barras. La fuente es `producto_codigos_barras` (un
producto puede tener hasta cuatro). `productos_catalogo.codigo_barras` es sólo
el principal y completa los huecos: no pisa un código que ya estaba en la
tabla. Se guardan los dígitos y, si al sacar los ceros de la izquierda sigue
siendo un EAN, también esa forma. Un código de menos de 8 dígitos o un cero
no es un EAN.

Si el código no está, sigue el matcher de las listas: mapeo manual y, si no,
nombre (producto, droga, concentración, unidades) con `DRIVE_MATCH_SCORE`
(0,62 si no está). Debajo del umbral la fila queda con `producto_id` null,
`match_via = sin_match` y el score que tuvo. No se borra nada. El `hash_linea`
no cambió, así que un reingreso no duplica: `ignoreDuplicates` deja la fila
vieja como está. Las que ya estaban sin producto las toma el rematch, en otro
paso.

El índice por token no cambia el resultado. Un score mayor a cero comparte al
menos un token con la ficha; el barrido de 46.000 fichas por cada línea de la
planilla no entra en los 60 segundos del cron. El test compara el índice
contra el barrido completo.

## 2026-11-12 · Google Drive: carpetas compartidas, listas al comparador, maestro solo en previa

NORA puede leer las carpetas «compras farmacias» y «compras farmacias (privado)».
No son de la cuenta del dueño: están en gabrielafigueiras75@gmail.com y
compartidas con él. La API pide `sharedWithMe`, `supportsAllDrives` e
`includeItemsFromAllDrives`. El alcance es `drive.readonly`.

OAuth: authorization code, PKCE y state. La app de Google queda en Testing, así
que el refresh token se estima vencido a los 7 días (`connected_at`) y, si
Google responde `invalid_grant`, la fila pasa a `vencida` y entra un aviso en
`nora_avisos`. El token se guarda cifrado (AES-256-GCM, `DRIVE_TOKEN_ENC_KEY`).
No sale al navegador. Las tablas del token no tienen políticas: solo
`service_role`, y se revoca `anon` y `authenticated` porque el default
privilege de la 0250 no se va con un revoke a PUBLIC.

`DRIVE_INGESTA_ENABLED` nace apagado. Si no es `true`, la pantalla dice
deshabilitado y el cron `/api/cron/drive-ingesta` (cada 30 minutos) responde
200 sin hacer nada. `DRIVE_PRECIOS_AUTO_APLICAR`, si no está, sigue a ese flag.

La primera corrida lista todo, de a una página, y lo deja en
`drive_archivos_ingestados`. Las siguientes miran lo modificado después de
`last_sync_at`. Cada corrida procesa 4 archivos. A los 3 fallos el archivo
queda en error. «Procesar ahora» corre el mismo lote.

La planilla «Compras y precios por droguería» es la fuente principal: la
pestaña de listas va al comparador (`listas_precios`, la vigente anterior del
mismo proveedor deja de serlo), la de compras va a `compras_lineas`, y
«Archivos cargados» marca esos file id para no bajarlos de nuevo. El
comparador no se alimenta de `lib/centro-datos/import.ts`: `aplicar()` ahí
pisa el precio de venta del catálogo y no arma una lista por droguería. Por
eso una lista confiable usa el mismo camino que `/api/compras/listas-precios`
(vigente / histórica) y se puede revertir desde la pantalla. Si no hay
droguería o el match no llega al umbral, queda en previa.

Ninguna lista trae EAN. El match es por nombre (droga, concentración,
presentación). Debajo del score la fila queda sin producto, visible, y un
mapeo manual se guarda en `drive_mapeo_productos` y se reutiliza. Norma, Ceos,
Distrifarm y Vannier tienen parser propio: Ceos y Distrifarm no cargan el
título de categoría como producto. Mayorsur es un PDF de dos columnas. Irma /
Vitamin Way y cualquier «importación temporal» no entran como precios.

Los PDF de Asoprofarma y Monroe se leen del texto. Las fotos van a
`doc_extracciones` en pendiente y, si hay modelo, se dispara la extracción que
ya existía. No se confirman.

Los maestros `pla_3d` de Guz Gon y Figueiras se estacionan en la previa de
SIFACO con la sucursal en el nombre. No se llama a `sifaco_aplicar_maestro`.
Un archivo de más de 12 MB no se parsea en el cron: queda señalado para
subirlo a mano en la pantalla que ya existe.

«¿Dónde lo compro más barato?» está en `/admin/compras/donde-comprar` y como
herramienta de solo lectura `donde_comprar` (super_admin, gerente, comprador).

Migración `0294`, sin aplicar. Rollback en `supabase/rollbacks/0294_…sql`.

Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`DRIVE_TOKEN_ENC_KEY`, `DRIVE_INGESTA_ENABLED`, `DRIVE_PRECIOS_AUTO_APLICAR`.
Redirect de producción:
`https://social-ahorro-pedidos.vercel.app/api/integraciones/google-drive/callback`.
Las previews usan el host del request.

En Google Cloud, Facu: proyecto, Drive API, consentimiento External/Testing
con su mail como usuario de prueba, cliente OAuth web con esa redirect, y las
env en Vercel. Las credenciales OAuth ya las está cargando.

## 2026-11-10 · Meses del maestro de Guzmán (09/11/2026)

El importador de `/admin/operaciones/sifaco` (`POST /api/sifaco/importar`,
`tipo=maestro`) lee las ventas por índice: columna 1 = mes en curso, columnas
2..13 = doce meses cerrados. Los nombres vivían en `MESES_MAESTRO` como
jul26..ago25, que es el export de agosto. El maestro de Guzmán SA-01
(`maestro guzgon 9-11.xls`, hoja `pla_3d_10`, `*** 09/11/26 ***`) trae
oct26..nov25 en esos mismos índices, y `este` es noviembre 2026, parcial.

Los nombres ahora salen del archivo: primero las columnas 2..13 si dicen un
mes (`oct26`, `10/26`), y si no, la fecha entre asteriscos. `MESES_MAESTRO`
queda sólo como respaldo del export de agosto, cuando el archivo no dice nada.
La leyenda «Mes En Curso: 10/26» no se usa: en este archivo contradice las
columnas, la fecha del reporte y el volumen de `este`.

`ago25` sigue parcial sólo cuando es el mes más viejo. En el archivo de
noviembre el más viejo es nov25, que era un mes entero, y entra entero.

No se movió ningún otro índice. No se tocó `sifaco_aplicar_maestro` ni la
base. La fila de staging sigue guardando `vta_este` y `vta_meses` en el mismo
orden; el nombre de cada posición queda en la importación (`fecha_archivo`,
`codificacion_prueba.meses` y `previa.meses`). Aplicar ese arreglo al catálogo
sigue siendo otro paso.
