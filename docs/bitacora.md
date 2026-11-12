# Bitácora

## 2026-11-12 · Los archivos de más de 12 MB tienen su lugar en la pantalla de Drive

Desde el #22, un archivo que pasa los 12 MB queda en previa con
`destino_ref = 'omitido_por_tamano'` sin bajarse. Pero aparecía mezclado en la
bandeja general, con botones de «Clasificar como…» que no lo destraban: el
cron lo vuelve a saltear. Las copias `.xls` de 42 MB caen siempre acá.

Ahora la pantalla de Google Drive tiene una sección aparte, «Demasiado grandes
para el cron», con el peso de cada archivo y adónde subirlo a mano según qué
es: el maestro a Operaciones → SIFACO (que lee el archivo en el navegador y lo
manda por lotes), las listas a Compras → Listas de precios y las facturas a
Finanzas → Documentos. La bandeja general ya no los repite.

## 2026-11-12 · La ingesta no sabe que es Drive

FIND va a ser la fuente maestra. Para que cambiar de fuente no sea reescribir
la ingesta, `lib/ingesta/fuente.ts` define lo único que depende de la fuente:
listar una página de una carpeta y bajar un archivo (`FuenteArchivos`).
`lib/drive/fuente-drive.ts` es la implementación de Drive, armada con el access
token ya refrescado. `correrIngesta` arma la fuente una vez y, de ahí en más,
`encolar`, `procesarLote` y `procesarUno` reciben la fuente, no el token.
Clasificar, parsear, cruzar y guardar no cambiaron.

La conexión (OAuth, token cifrado, vencimiento a los 7 días) sigue siendo de
Drive y queda en `correrIngesta`: cada fuente se construye ya autenticada.
FIND va a ser otra implementación de `FuenteArchivos` más su propia conexión,
detrás de la bandera `fuente_find` (G4).

Tests con una fuente en memoria que recorre páginas, subcarpetas y el corte
por fecha del último sync, y del adaptador de Drive con `fetch` simulado
(traducción de la respuesta, token, error 403). `npm test` corre por glob.

## 2026-11-12 · Las compras que entraron desde Drive se ven

`compras_lineas` la llena la ingesta y no la mostraba ninguna pantalla.
`/admin/compras/ingeridas` (está en los accesos rápidos de Compras) muestra
cuántas líneas hay, cuántas se cruzaron con el catálogo y cuántas no, con
`count: exact` (no se cuentan filas traídas). Lista las 200 más recientes del
filtro, y lo dice. Busca por producto, proveedor o código de barras y, si la
línea está cruzada, muestra con qué producto, la vía y el score.

«Recalcular cruce» recorre `POST /api/compras/rematch` (#22) siguiendo el
cursor, hasta 40 tandas por clic; cada pedido entra en 60 s y lo que ya se
cruzó no se pisa. Pantalla y RLS piden lo mismo: super_admin, gerente o
comprador. Si la tabla no existe, la pantalla lo dice en vez de romperse.

No hay «Ignorar» por línea: `compras_lineas` no tiene columna para eso y
agregarla es una migración. Queda anotado si hace falta.

## 2026-11-12 · El PR #7 se pone al día con main en `feat/compras-cruce`

El #7 (`cursor/compras-match-ingesta-61dc`) no mergeaba limpio desde que
entró el #8. No se reescribió esa rama: `feat/compras-cruce` sale de main y
mergea el #7 con `--no-ff`, así quedan sus commits y su autoría.

Qué trae el #7: `guardarCompras` cruza cada línea con el catálogo (barras de
`producto_codigos_barras`, después el matcher de las listas) y deja
`producto_id`, `match_score` y `match_via`. El rematch de las que ya estaban
sin producto, de a 80, sin borrar: `POST /api/compras/rematch` con sesión y
`GET /api/cron/compras-rematch` con `CRON_SECRET` (no está en `vercel.json`).
El cron de Drive deja en previa lo que pasa de 12 MB sin bajarlo, entra un
solo pesado por corrida, corta a los 45 segundos y saca de `procesando` lo que
quedó colgado. La bandeja deja ignorar un pendiente. La sección SIFACO puede
nombrar a la droguería, si la tabla existe.

Conflicto sólo en esta bitácora: quedan todas las entradas de los dos lados,
las de main (#8 a #11) arriba porque son más nuevas. `package.json` no chocó:
el #7 no tocaba los tests, y `drive.test.ts` ya estaba en la lista. Lo de
main (saltear verificadores sin env, el build que no escribe en producción,
CI y lint) queda como estaba.

Arreglos sobre el #7. `recuperarTrabados` no leía el error del select ni de
los updates: ahora corta la corrida, igual que el rematch, en vez de contar
un archivo como recuperado sin haberlo escrito. Lo mismo el update que manda
a previa un archivo de más de 12 MB. El select de trabados ordena también por
`id`. `mapeosGuardados` paginaba por `nombre_norm`, que se repite entre
proveedores: suma `id` al orden para no perder ni repetir filas entre
páginas. `barrasDelCatalogo` suma `producto_id` por la misma razón. El rematch
ya ordenaba por `id`, leía todos los errores y tenía `maxDuration`; no hay
`.in()` con listas largas.

`npm test` 51 de 51, `tsc` limpio, lint en 0 con avisos, build sin env de
Supabase: los verificadores de la base se saltean, cortes, RLS y lente pasan.

La migración `0296_la_seccion_sifaco_nombra_al_proveedor.sql` sigue sin
aplicar. Rollback en
`supabase/rollbacks/0296_la_seccion_sifaco_nombra_al_proveedor.sql`. No se
tocó la base, ni secretos, ni `sifaco_aplicar_maestro`.

## 2026-11-12 · CI en cada PR y config de lint

`.github/workflows/ci.yml` corre `npm ci`, `npm test`, `tsc --noEmit`,
`npm run lint` y `npm run build` en cada PR y en cada push a una rama que no
sea main. No usa secretos: sin las env de Supabase, los verificadores del
build que necesitan la base se saltean solos y el resto (cortes, RLS estática,
lente, permisos) corre igual. Nada de esto escribe en producción.

`.eslintrc.json` extiende `next/core-web-vitals`. Se apaga
`react/no-unescaped-entities`, que marcaba 24 comillas en textos en castellano,
y se declara el plugin de `@typescript-eslint` para que los
`eslint-disable` que ya había encuentren su regla. `npm run lint` sale en 0
con 5 avisos (dependencias de hooks e `<img>`). El build sigue con
`ignoreDuringBuilds`: el lint corre aparte en CI.

## 2026-11-12 · Backlog y pendientes de Facu

`docs/backlog.md` junta todo lo que falta para dar NORA por terminada, por
épica: estabilidad, compras e ingesta, maestro por sucursal, precios,
multisucursal, seguridad, calidad, fuentes intercambiables y pulido. Cada ítem
tiene criterio de terminado, rama, estado y dependencia.
`docs/pendientes-humanos.md` junta lo que necesita a Facu, con el texto de
firma.

En el relevamiento salió que cuatro piezas del esquema no están en ninguna
migración y viven sólo en la base: `decisiones_pendientes`,
`proveedores_detectar`, `sifaco_aplicar_maestro` y
`rls_escrituras_que_dan_lectura`. `cerebro_calcular` corre por pg_cron cada
minuto con tope de 50 s.

## 2026-11-12 · El build no escribe en producción

`npm run build` corre `verificar:coherencia`, y eso llamaba a
`agentes_resumen_calcular(null)`. Esa función es SECURITY DEFINER y
**escribe** `agentes_resumen_snapshot`. Pasaba en cada deploy de producción y
en cada build local con `.env.local` contra prod, y además le sumaba a la
base unos 20 s de cálculo sobre toda la cadena. Ahora el script lee la fila
de la cadena de `agentes_resumen_snapshot` y no llama a ninguna función que
escriba. El cruce exacto de Abasto (productos y plata a transferir) corre
sólo si el snapshot tiene 15 minutos o menos, que es cuando lo acaban de
recalcular el cron `medidor` o el importador de SIFACO. Si es más viejo, se
saltea con su edad: comparar un snapshot de la madrugada contra la vista de
ahora daría diferencias que no son cortes. Los otros cruces (paginar,
quiebres, candados) no cambian.

`auditar:rls-roles` creaba 5 usuarios reales en Auth (`auditor.<rol>@rls.test`)
con fila activa en `users_admin` cuando se lo corría a mano con
`VERCEL_ENV=production`, como recomendaba la entrada de abajo. Ahora esa
parte pide además `AUDITOR_CREAR_USUARIOS=1`, y en un build de Vercel no corre
nunca, aunque el flag esté. Sin el flag, el auditor revisa **todos** los
usuarios de Auth (paginados, no los primeros 200) y falla si queda algún
`@rls.test` vivo. Con el flag, un Ctrl-C o un SIGTERM borra los usuarios
creados antes de salir (`try/finally` no corre con una señal), y el control
final también mira todas las páginas.

`scripts/buscar-usuarios-auditor.ts` lista, sólo leyendo, los `@rls.test` que
haya en Auth y si tienen fila activa en `users_admin`:
`npx tsx --env-file=.env.local scripts/buscar-usuarios-auditor.ts`.

Las demás funciones que llaman los verificadores del build están declaradas
`stable` en las migraciones. `rls_escrituras_que_dan_lectura` (la usa
`auditar:rls-roles`) no está en ninguna migración del repo: queda por revisar
en la base.

`npm test` suma `scripts/hotfix-build.test.ts` (44 tests).

No se tocó la base, ni migraciones, ni RLS, ni secretos.

## 2026-11-12 · /admin no se cae si la vista de decisiones no responde

`/admin` tiraba `Cannot read properties of null (reading 'filter')`.
`decisiones_pendientes` es una vista pesada: cuando PostgREST corta por
statement timeout, `data` vuelve `null` y `EquipoClient` filtraba eso. La home
ahora espera como mucho 5 segundos, loguea código y mensaje (sin las filas) y
sigue con lista vacía. `equipo.agentes` también va con `?? []`. El resto de
los `.filter` de esa página ya partían de `data ?? []` o de helpers que
devuelven array (`papelesEnAlerta`, `diasSinTrazabilidad`, `primerDia`).

Si otra página de NORA tira, `app/(admin)/error.tsx` muestra el error adentro
del shell (el dock sigue) con Reintentar y un link a `/admin`.

Quien entra a `/pedidos` sin fila en `users_pedidos` iba a
`/logout?reason=sin_permiso` y perdía la sesión. Si tiene fila activa en
`users_admin`, ahora va a `/admin/pedidos`. El resto sigue igual: sin fila en
ninguna de las dos, o con la de pedidos inactiva y sin admin activo, logout;
repartidor, a `/repartidor`.

El build de preview cortaba en `scripts/_auditar-rls-roles.ts` con
`Falta NEXT_PUBLIC_SUPABASE_URL`. Esas env están en production; en preview,
sólo en la rama vieja `feature/crm-redesign`. El auditor se saltea (aviso,
exit 0) cuando `VERCEL_ENV !== 'production'` o falta alguna de las tres
variables. En production, con las variables, la medición no cambia: en Vercel
sigue sin crear usuarios de prueba. Para correrlo en la máquina:
`VERCEL_ENV=production npm run auditar:rls-roles` (desde el hotfix del build, además
`AUDITOR_CREAR_USUARIOS=1` para que cree usuarios; ver la entrada de arriba).

`verificar:coherencia` y `verificar:limite` vienen después en `npm run build`
y tiran el mismo `Falta …` si no hay URL. Se saltean sólo cuando faltan las
variables. Con `.env.local` o en production corren como antes. El auditor de
RLS, no: fuera de production no corre aunque las variables estén.

`npm test` corre los `node:test` de drive, dónde comprar, meses del maestro,
el null del equipo y la decisión de saltear el build.

No se tocó la base, ni migraciones, ni RLS, ni secretos.

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

Las 727 filas que ya estaban sin producto no se reescriben al reingresar: el
hash choca y `ignoreDuplicates` las deja. El rematch las recorre de a 80,
sólo donde `producto_id` es null, y aplica el mismo cruce. No borra nada y no
pisa un producto que ya estaba. Si el score y la vía ya coinciden, no escribe.
Corta a los 40 segundos y devuelve `siguiente` para seguir. Hoy unas 82
deberían cruzar por barras.

Lo llama un super_admin, gerente o comprador en `POST /api/compras/rematch`.
El cron, sin sesión, es `GET /api/cron/compras-rematch` con `CRON_SECRET`: el
middleware manda a login cualquier otra API sin sesión, así que el secreto no
serviría en la ruta de compras. No está en `vercel.json`. Se corre a mano.

## 2026-11-12 · El cron no se come un archivo que no entra

`/api/cron/drive-ingesta` tiene `maxDuration` 60. La planilla «Compras y
precios por droguería» quedó en `procesando`: la corrida murió a la mitad y
nadie la devolvía a la cola.

Un archivo de más de 12 MB se marca `previa` con `destino_ref =
omitido_por_tamano` antes de descargarlo, así no gasta uno de los 4 lugares.
Si Drive no manda el tamaño (un Google Sheet) y al bajarlo igual pasa el
tope, tampoco se parsea. La planilla, un maestro, o un archivo de 2 MB o más
entra de a uno por corrida. A los 45 segundos desde que arrancó la ingesta no
se empieza otro: el resto sigue `pendiente`.

Si `procesando` tiene más de 10 minutos —más que los 60 del tope, menos que
los 30 del cron— vuelve a `pendiente` con intento+1. Empezar a procesarlo
suma otro intento, igual que antes. Al llegar a 3, `error`. `updated_at` se
escribe al pasar a `procesando`, para no recuperar un archivo que está
corriendo de verdad.

En la pantalla de Drive, Ignorar también está para los que siguen
`pendiente`. Antes el botón sólo aparecía en sin clasificar, previa y error,
y un pendiente no se podía sacar de la cola sin esperar a que fallara.

## 2026-11-12 · La sección SIFACO puede nombrar a la droguería

Migración `0296`, sin aplicar. Rollback en `supabase/rollbacks/0296_…sql`.
La `0295` quedó para el historial de precios y facturas, en el PR #6.
Tabla `sifaco_seccion_proveedor(seccion text primary key, proveedor_id uuid
references proveedores on delete set null, nota text, created_at)`. RLS
prendido. La lectura es la de `proveedores_read` (cualquier admin). La
escritura es la de `proveedores_write` (super_admin, gerente, comprador,
administrativo), partida en insert, update y delete: un `FOR ALL` también da
SELECT y el auditor lo marca. No hay filas. El mapeo lo carga Facu.

Propuesto, no cargado:

- MIC → MICROSULES
- MAY → MAYORSUR
- PHA → Pharmamerican / PHARMOS, a confirmar
- CEO → CEOS
- WES → WEST
- Z59 → LAFARMEN
- Z33 → HIERBAS
- Z34 → KIOSKO
- NOR → ¿NORMA? Dudoso
- El resto queda con el código como nombre hasta que exista la fila

Si la tabla no está, la consulta devuelve el error de «no existe» y el cruce
sigue sin ella. No se rompe la ingesta. Un código sin fila no inventa un
proveedor: `proveedor_nombre` sigue siendo Z45, MIC o el que venga.

`detectarProveedor` ahora distingue Monroe Americana de Monroe. El alias
busca «monroe americana» en la razón social. En `proveedores` no está
«MONROE AMERICANA»: hasta que se cargue, una factura de Monroe Americana no
se cuelga de un proveedor que sólo se llama Monroe. «Laboratorio Omicron»
matchea con el proveedor que ya existe, OMICRON.

No se tocó `sifaco_aplicar_maestro`.

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
