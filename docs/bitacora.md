# Bitácora

## 2026-11-12 · Las banderas en un solo lugar

`lib/banderas.ts` registra cada bandera con su variable, qué cambia al
prenderla y su ítem del backlog. Todo nace apagado y sólo se prende con
`'true'` exacto, el mismo criterio que ya usaba Drive (`lib/drive/flag.ts` no
cambia y queda registrada). Por ahora están `ingesta_drive`,
`maestro_por_sucursal` (C2), `fuente_find` (H2) y `pantallas_en_construccion`
(I2). Prenderlas en producción es cambiar una variable en Vercel: eso lo hace
Facu. `npm test` también corre ahora los `lib/*.test.ts`.

## 2026-11-12 · Cargando y «no está» adentro de NORA

No había ningún `loading.tsx` ni `not-found.tsx`. Mientras una página pesada
de `/admin` cargaba, la pantalla anterior quedaba quieta y parecía colgada. Un
`notFound()` (lo llaman 21 páginas: pedido, proveedor o producto que no está)
mostraba el 404 genérico de Next, en inglés y fuera del shell.

- `app/(admin)/loading.tsx`: bloques grises con la forma de una página,
  adentro del shell, con `aria-busy`.
- `app/(admin)/admin/not-found.tsx`: «Esta pantalla no existe, o lo que
  buscabas ya no está», con link al inicio.
- `app/not-found.tsx`: las URLs que no existen, en castellano.

## 2026-11-12 · «No tenés permiso» en vez de caer en la home sin saber por qué

`requireAdminHubAccess` y seis pantallas del mostrador mandaban a
`/hub?denied=1` cuando el rol no alcanzaba. `/hub` ya no existe: desde la v0.18,
`next.config.mjs` lo redirige de forma permanente a `/admin`. La persona
terminaba en la home de NORA sin ningún aviso. Ahora va directo a
`/admin?denied=1` y la home muestra arriba «No tenés permiso para la pantalla
que quisiste abrir», con a quién pedírselo.

## 2026-11-12 · El build se rompe si una función SECURITY DEFINER nueva queda abierta a anon

Octava vez que aparece la misma familia de error: una función SECURITY DEFINER
que `anon` puede ejecutar por `/rest/v1/rpc`. `scripts/auditar-definer.mjs`
corre primero en `npm run build`, y por eso también en CI. Recorre
`supabase/migrations` en orden y, para cada función cuya **última** definición
es SECURITY DEFINER, exige un `revoke … from public, anon` **después** de ese
último `create`. Cuenta la forma de la 0228 (el `do` que cierra todas las
funciones de trigger) y `drop function`. Falla si después aparece un
`grant … to anon`.

Hoy encuentra 11 funciones abiertas según las migraciones; los advisors de la
base dicen 9, así que alguna se cerró a mano. Esas 11 quedan en
`scripts/definer-deuda.json`: se listan en cada build pero no lo rompen. Las
cierra la migración de F2, que se arma contra la base. Cualquier función
**nueva** que quede abierta rompe el build.

Ojo para F2: `current_admin_role` y `hub_rol_activo` las usan las políticas de
RLS. Si `anon` lee alguna tabla con esas políticas, quitarle el EXECUTE
cambia «cero filas» por «permission denied». Hay que mirarlo en la base antes
de firmar.

`npm test` corre ahora todos los `lib/*/*.test.ts` y `scripts/*.test.ts` por
glob: un test nuevo ya no queda afuera por no estar en la lista.

## 2026-11-12 · alertas-stock y metricas-stock por tramos: no pueden pasar los 60 s

Leer las 192.464 filas de stock de una vez arreglaba el cálculo incompleto pero
abría otro riesgo: que la corrida pasara los 60 s y las alertas no salieran.
Facu pidió no cambiar una cosa por la otra.

**Tramos.** `lib/cron/tramos.ts` parte el espacio de UUID de `producto_id` en
6 rangos parejos (los UUID v4 son aleatorios: ~1/6 del catálogo cada uno). Cada
corrida procesa un tramo para todas las sucursales: ~32.000 filas de stock en
vez de 192.000. Todas las lecturas (stock, rotación, lotes, vencimientos,
catálogo, ventas de 30 días y las alertas activas) se filtran por ese rango.

**Qué tramo toca.** Un solo cron cada 5 minutos en una ventana de una hora
(`vercel.json`: metricas-stock `*/5 3 * * *`, alertas-stock `*/5 4 * * *`). El
tramo sale del reloj (minuto / 5, módulo 6), así que cada uno corre dos veces.
Si la primera pasada no llega, la segunda lo retoma. No hace falta guardar un
cursor en la base, ni hace falta migración. `?tramo=N` fuerza uno a mano.

**Plazo.** Leer tiene 40 s. Si se pasa, la corrida responde 503, queda en el
log y **no escribe nada**: las alertas y la rotación de ayer siguen como
estaban. Escribir tiene hasta 52 s y se mira entre tandas, nunca en el medio.

**Alertas por diferencia.** Antes se borraban todas las activas y se
insertaban de nuevo. Ahora se leen las activas del tramo y se escribe sólo la
diferencia (`diferenciaAlertas`):
- se borra lo que ya no vale;
- lo que cambió se borra e inserta de a pares en la misma tanda (el índice
  único no deja dos activas iguales);
- se inserta lo nuevo.
Lo que no cambió no se toca y conserva su `created_at`. En ningún momento la
tabla queda vacía. Si se corta entre tandas, lo no tocado queda en la versión
anterior. El aviso de stock fantasma a los super admin sale sólo por los
fantasmas nuevos: antes se repetía todos los días.

**ABC.** La clasificación A/B/C de metricas-stock se rankea dentro del tramo.
Como cada tramo es una muestra al azar del catálogo, los cortes de 20 % y 50 %
casi no se mueven, pero un producto justo en el borde puede caer en la letra
vecina. Es una aproximación, a cambio de que la corrida entre en 60 s.

**El botón.** «Regenerar» en `/admin/operaciones/alertas` pide los seis tramos
uno atrás del otro, cada uno en su propio pedido. Si uno falla, dice cuál y
los anteriores ya quedaron hechos.

Si con el tiempo un tramo no entra en 40 s, se sube `TRAMOS_POR_DEFECTO` (con
12 tramos cada uno corre una vez por ventana).

## 2026-11-12 · Crons: todo el stock, escrituras en tandas y registro de cada corrida

**Calculaban sobre una parte.** `stock_items` tiene 192.464 filas (lo dice
`auditar:cortes`) y `paginar()` corta en 100.000 por defecto. alertas-stock y
metricas-stock no miraban `truncado`: alertaban y guardaban la rotación sobre
la mitad del stock. alertas-stock, además, leía `producto_rotacion` sin
paginar, cortado en 1.000. `paginarCompleto()` (en `lib/supabase/paginar.ts`)
sube el tope a 2.000.000 y tira si se llega: un cron que guarda un resultado
no calcula sobre una parte. `auditar:cortes` lo reconoce como paginado.

**El orden no era único.** Se paginaba por offset ordenando por `producto_id`
(o `recurrencia_id`), que se repite. Entre páginas, Postgres no garantiza el
orden de los empates y se pueden saltear o repetir filas. En generar-agenda
eso es grave: una recurrencia salteada en «ya se generó hoy» se vuelve a
crear. Ahora el orden lleva `id` de desempate.

**Escrituras gigantes sin mirar el error.** alertas-stock borraba las activas
y hacía un único insert de todas. No leía el error, y si el insert se caía
por timeout la pantalla de alertas quedaba vacía. metricas-stock hacía un
upsert único de todo `producto_rotacion`. Ahora las dos van de a 500 con
`lib/supabase/tandas.ts` y cortan en el primer error. El borrado-y-recarga
sigue sin ser atómico: si falla a la mitad, quedan las tandas que entraron, y
la corrida termina en 500 y queda en el log.

**URLs largas en generar-agenda.** `.in('id', recIds)` con hasta 500 UUIDs
es el mismo riesgo de 400 que tenía avisos-proveedores. Va de a 100 y lee el
error. Las recurrencias se leían con `.limit(500)` y la 501 no se generaba
nunca: ahora se pagina.

**Registro.** `lib/cron/corrida.ts` envuelve el GET de generar-agenda,
alertas-stock, metricas-stock, nora-auditor, drive-ingesta, avisos-proveedores
y avisos-compras. Escribe una línea JSON al empezar y otra al terminar (cron,
corrida, ms, status, ok, error). Se filtra en los logs de Vercel por
`"cron":`. Si el handler tira, responde 500 con el mensaje. No escribe en la
base. Todos declaran `maxDuration = 60`.

Lo que queda para que dejen de cortar: los índices (F5), sobre todo
`movimientos_stock(tipo, fecha)` y `tareas(created_at)`, y bajar
`cerebro_calcular`, que corre cada minuto y compite con todo (A3).
`nora-auditor` sigue haciendo un SELECT y un INSERT por aviso.

## 2026-11-12 · El cerebro cada cinco minutos (migración 0297, sin aplicar)

`cerebro_calcular()` corre por pg_cron **cada minuto** desde la 0288, con tope
de 50 s, y recorre toda la cadena: `bandeja_unica(null, null, 100000)` (que
arrastra `decisiones_pendientes`), otra lectura de la vista para contar por
agente, `direccion_por_sucursal` y varios group-by grandes. Es el candidato
más claro de los timeouts de arranque: un cálculo de decenas de segundos
cada 60 compite con todo lo demás.

La 0297 sólo lo pasa a `*/5 * * * *`: de 1.440 corridas por día a 288. El
cuerpo de la función no se toca. Sacar la segunda lectura de la vista pide
reescribir 250 líneas sin poder probarlas contra la base; queda para cuando
haya acceso (A4). La pantalla del cerebro ya dice «hace N min», y el texto de
«todavía no se calculó» dice cinco minutos.

Rollback: `supabase/rollbacks/0297_el_cerebro_cada_cinco_minutos.sql`.

## 2026-11-12 · PINs débiles rechazados

El PIN es de 4 dígitos y el login corta a los pocos intentos, así que lo que
importa es no estar entre los que se prueban primero. `motivoPinDebil()`
(`lib/auth/pin.ts`) rechaza: los cuatro iguales, escaleras que suben o bajan
(con vuelta: 7890, 9012), dos dígitos repetidos (1212), espejos (1221), años
de 1940 a 2039 y el PIN que sale del N° de empleado. Corre sólo al crear o
cambiar un PIN (`setPinEmpleado`): los que ya existen siguen entrando, para no
dejar a nadie afuera. El del super admin lo cambia Facu.

El alta de `/api/admin/personas` se tragaba el error del PIN
(`.catch(() => {})`). Ahora la cuenta se crea igual, pero la respuesta trae
`aviso_pin` y la pantalla de usuarios lo muestra.

## 2026-11-12 · avisos-proveedores: sin 400 «header too large» y sin duplicados

`publicarAvisos` (`lib/proveedores/avisos.ts`) armaba un
`.in('clave_dedup', claves.slice(0, 500))`. PostgREST lleva ese filtro en la
URL: con cientos de claves de 40 a 80 caracteres el pedido pesa decenas de KB y
el gateway lo corta con 400 «header too large». El error no se leía, así que
`previos` volvía null, todo contaba como nuevo y el insert (tampoco se miraba
su error) podía duplicar los avisos de todos los días. Las claves después de
la 500 nunca se revisaban. `lib/compras/avisos.ts` tenía lo mismo, sin tope.

`lib/avisos/dedup.ts` revisa las claves de a 50, inserta de a 200 y corta con
error si falla cualquiera de las dos cosas: es mejor no avisar hoy que avisar
diez veces lo mismo. También descarta las claves repetidas dentro del mismo
lote. Los dos crons de avisos declaran `maxDuration = 60`.

El 400 era la única causa visible. `proveedores_detectar` no está en el repo
(vive en la base) y no tiene `statement_timeout` propio: si después de esto el
cron sigue lento, la causa está ahí.

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
