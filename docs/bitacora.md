# Bitácora

## 2026-11-12 · Un número que no se pudo leer no es un cero

Las homes de Compras y Pedidos leían sus números sin mirar el error. Si una
consulta caía (por un timeout, por ejemplo), el KPI mostraba 0: «0 pedidos
abiertos», «0 faltantes». Un número plausible que miente sin avisar es el error
que este proyecto ya encontró cuatro veces con los cortes de 1.000.

`erroresDeLectura` (`lib/supabase/errores.ts`) junta los errores de las
lecturas de una pantalla. `AvisoLectura` (`components/shared/`) los muestra
arriba: «No se pudo leer: … Esos números aparecen vacíos, no en cero». Un
«permission denied» de RLS aparece aparte, como «tu rol no puede ver…», porque
no es una caída. En Pedidos, el KPI que falló queda en «—» (`KpiCard` ya lo
hacía con `null`).

Es el patrón para el resto de las pantallas. Esta pasada cubre las dos homes
más usadas. Las demás (sifaco, drive, comparador) ya decían sus errores o se
arreglaron en sus PRs (#23, #25, #32).

## 2026-11-12 · Estado del desarrollo: qué quedó, qué espera firma y en qué orden

**Hecho y en main:** #8, #9 (el build no escribe en prod), #10 (backlog y
pendientes) y #11 (CI y lint).

**En PR, con CI en verde, esperando firma.** Tres pilas. Cada una se mergea en
orden y la siguiente se re-apunta a main (ver `pendientes-humanos.md`):

1. **Principal (estabilidad, seguridad, calidad, multisucursal, pulido):**
   #12 → #15 → #14 (+0297) → #13 → #16 → #17 → #18 → #19 → #20 → #26 → #27 →
   #28 → #29 → #30 → #31 → #35 → #36 → #37 → #38.
2. **Compras e ingesta:** #22 (reemplaza #7; 0296 opcional) → #23 → #24 →
   #32 → #33 → #34.
3. **Precios:** #21 (reemplaza #6; **0295 antes del deploy**) → #25.

Si dos pilas chocan en `docs/bitacora.md`, la segunda se re-apila sobre la
primera antes de firmar. Es un conflicto sólo de texto.

**Migraciones, en este orden** (ninguna aplicada; cada una con rollback en
`supabase/rollbacks/`):
1. 0294, ya en main. Confirmar qué partes existen en la base: `compras_lineas`
   ya tiene filas.
2. 0295, junto con #21 y antes de su deploy.
3. 0296, con #22. Opcional: sin la tabla, la ingesta sigue.
4. 0297, junto con #14, como un solo paquete.

**Cambios en la base preparados como consultas de sólo lectura** (los corre
Facu): índices de FK (P12), RLS initplan y permisivas (P13), funciones
definer abiertas a anon y esquema vivo (P14).

**Bloqueado por humano:**
- A4, `decisiones_pendientes`: el cuerpo de la vista vive sólo en la base (P2/P14).
- C1 y C2, maestro por sucursal: `producto_stock_sifaco` y
  `sifaco_aplicar_sucursales` viven sólo en la base (P2/P14).
- F2, revoke a anon: lista real de la base (P14).
- F4, contraseñas filtradas (P4).
- F7, usuarios `@rls.test` (P2/P9).
- B2, alta de Monroe Americana con su CUIT (P15).
- G6, env de Preview (P6).
- H2 real, la API de FIND (P10).
- E2, depende de A4.

**Pendiente sin bloqueo:** ninguno. I3 quedó en #38 con el patrón aplicado
a las dos homes más usadas.

**Riesgos que quedan:**
- alertas-stock y metricas-stock leen ahora las 192.000 filas por tramos. Si
  un tramo no entra en 40 s dos veces seguidas, esa sexta parte queda con el
  dato de ayer y `ok:false` en el log. Se arregla subiendo los tramos.
- El ABC de metricas-stock es una aproximación por tramo.
- El límite real de duración en Vercel no se conoce (P11). Los crons que
  declaran 60 s están hechos para entrar en 60.
- El comparador (#25) lee todos los ítems vigentes: es más lento, pero ya no
  miente.
- Cuatro piezas del esquema viven sólo en la base. Hasta volcarlas (P14), todo
  lo que las toca es a ciegas, y por eso no se tocaron.

## 2026-11-12 · Fuera el shell viejo que nadie usaba

`components/layout/sidebar.tsx`, `top-nav.tsx`, `search-trigger.tsx`,
`user-menu.tsx` y `period-selector.tsx` eran el shell anterior a `OsShell`.
No los importaba ninguna página (los dos últimos sólo los usaba `top-nav`), y
mostraban «En construcción» y «Próximamente» que nadie veía. Se borraron. Lo
que sí se usa de esa carpeta (`notifications-trigger` y `sucursal-selector`,
desde `OsShell`) queda. `tsc`, lint, tests y build pasan sin ellos.

## 2026-11-12 · Quién entra a /admin y a /pedidos, en un solo lugar y con tests

La decisión de adónde va cada persona estaba repartida entre `app/page.tsx` y
`app/pedidos/page.tsx`, cada una con su versión. Ahora vive en
`lib/auth/destino.ts` (`destinoRaiz`, `destinoPedidos`) y las dos páginas la
usan. No cambia ninguna regla: es la misma que dejó el #8 (alguien de NORA sin
fila en `users_pedidos` va a `/admin/pedidos`, no al logout). La tabla
completa está en `docs/PERMISOS.md`. Hay tests para cada caso, incluido el que
el #8 arregló.

## 2026-11-12 · La sucursal de despacho de cada canal se elige desde la pantalla

De qué sucursal sale un pedido que entra solo no se deduce del stock
(`lib/pedidos/canales.ts`): sale de `canales_venta.sucursal_despacho_id`, que
elige una persona. Si nadie la eligió, el pedido entra igual y queda en
`pedidos_sin_sucursal`. La home de pedidos lo avisaba, pero ninguna pantalla
dejaba elegirla: sólo se veía el cartel «sucursal de despacho sin definir».

En `/admin/canales`, cada canal tiene ahora «Despacha desde» con las
sucursales activas. Lo ven y lo cambian sólo super_admin y gerente. Guarda por
`POST /api/canales/[id]/sucursal-despacho`, que revisa rol, que la sucursal
exista y esté activa, y que el canal exista. Elegir «sin definir» la borra.

No reasigna los pedidos que ya entraron sin sucursal: eso es otra decisión.

## 2026-11-12 · Nada visible que no ande: la campanita funciona y lo «próximamente» se esconde

**Notificaciones.** La campanita de arriba ya contaba bien: el store
(`lib/stores/notifications-store.ts`) carga las últimas 50 de
`notificaciones_admin` y escucha las nuevas por Realtime. Pero al abrirla
decía «Próximamente». Ahora lista las notificaciones con prioridad, hora y
estado. Al tocar una, la marca leída y va a su `url_accion`. Tiene «Marcar
todas como leídas» y, sin notificaciones, dice «No tenés notificaciones».
Las de stock fantasma que manda alertas-stock ya aparecen ahí.

**Lo que no anda, oculto.** Las acciones rápidas marcadas `proximamente` (en
la home y en Aplicaciones) y el botón de dictado deshabilitado de Mi día sólo
se muestran con la bandera `pantallas_en_construccion` (G4), que está
apagada. `components/layout/sidebar.tsx`, `top-nav.tsx` y `search-trigger.tsx`
también dicen «En construcción», pero no los importa nadie: el shell es
`OsShell`. No se borraron (quedan anotados para limpiar).

## 2026-11-12 · Las 9 funciones abiertas a anon y el esquema que vive sólo en la base

Dos consultas más **de sólo lectura** para destrabar lo que estaba bloqueado
por no ver la base:

- `supabase/consultas/definer_abiertas_a_anon.sql`: las funciones SECURITY
  DEFINER que `anon` puede ejecutar (los advisors dicen 9), con el `revoke`,
  su rollback (`grant`) y, antes de firmar, **en qué políticas RLS aparece
  cada una y para qué roles**. Si una política que evalúa `anon` usa la
  función (el caso posible de `current_admin_role`), revocar cambia «cero
  filas» por «permission denied». Con esa salida se arma la migración de F2
  sin adivinar.
- `supabase/consultas/esquema_vivo.sql`: el DDL actual de
  `decisiones_pendientes`, `proveedores_detectar`, `sifaco_aplicar_maestro`,
  `sifaco_aplicar_sucursales`, `rls_escrituras_que_dan_lectura` y
  `producto_stock_sifaco`. Se guarda en `supabase/esquema-vivo/` como
  referencia, no como migración.

Probadas en Postgres 16 local: la primera marca las definer abiertas (no las
cerradas ni las invoker), señala la política de anon que usa
`current_admin_role`, sus revokes corren y la dejan vacía. La segunda devuelve
el DDL de la vista, la función y la tabla.

## 2026-11-12 · RLS: las 430 initplan y las 259 permisivas, listadas desde la base

Como con los índices: el arreglo sale de leer la base, no de adivinar desde
las migraciones. Dos consultas **de sólo lectura** en `supabase/consultas/`:

- `rls_initplan.sql`: cada política de `public` que llama a `auth.uid()`,
  `auth.jwt()` o `auth.role()` sin envolver en `(select …)`, que se evalúa
  **por fila**. Devuelve la definición actual, el `alter policy` con las
  llamadas envueltas (Postgres las evalúa una vez por consulta) y el
  `alter policy` de rollback con la definición original.
- `rls_permisivas_multiples.sql`: por tabla × rol × acción, las políticas
  permisivas que se suman con OR, con su condición. No genera sentencias:
  fusionar políticas es una decisión de permisos, no un reemplazo mecánico.

Probadas en Postgres 16 local con un `auth.uid()` de mentira. La primera no
marca la política ya envuelta, sus `alter policy` corren y la dejan vacía, y
el rollback la devuelve a como estaba. La segunda junta las tres permisivas de
SELECT (incluida la que viene de un `for all`).

Es cambio de RLS: lo aplica Facu, tabla por tabla, con firma (P13).

## 2026-11-12 · La lista de índices de las foreign keys sale de la base, no de adivinar

Los advisors marcan 346 foreign keys sin índice. Escribir esos índices a mano
desde las migraciones sería adivinar: parte del esquema vive sólo en la base.
`supabase/consultas/indices_fk_faltantes.sql` es una consulta **de sólo
lectura** sobre `pg_constraint` y `pg_index`. Devuelve cada FK de `public` sin
un índice que empiece por sus columnas en el mismo orden, con el
`create index concurrently if not exists` que le falta y su rollback (`drop
index concurrently`), ordenadas por tamaño de tabla: las grandes primero.

Se probó en un Postgres 16 local con casos armados (FK simple sin índice,
compuesta, índice en orden invertido, índice que la cubre por prefijo, FK ya
indexada). Marca las tres que faltan, ignora las dos cubiertas, las
sentencias que genera corren, y después de correrlas la consulta da vacía.

Las sentencias van **de a una y fuera de una transacción**: `concurrently` no
bloquea escrituras pero no puede ir dentro de BEGIN/COMMIT. Lo corre Facu
(P12).

## 2026-11-12 · El auditor de NORA publica sus avisos en lote

`correrAuditor` llamaba a `emitirAviso` una vez por hallazgo: un SELECT para
ver si ya estaba pendiente y un INSERT, en serie, decenas de veces, dentro de
un cron de 60 s. Además ninguna de las dos miraba el error. Ahora el auditor
junta los avisos en `colaDeAvisos()` (`lib/ai/cola-avisos.ts`) y al final
revisa las claves de a 50 e inserta de a 200 con el helper de
avisos-proveedores, cortando si algo falla. `emitirAviso` sigue igual para los
otros 19 usos sueltos.

`correrAuditor` devolvía cuántos avisos *emitió*, contando los que el dedup
descartaba. Ahora devuelve `avisos` (los nuevos de verdad) y `revisados` (todo
lo que encontró). «Revisar ahora» en el feed lo distingue: «N cosas nuevas (y M
que ya te había avisado)» o «lo que encontró ya te lo había avisado», en vez de
«no encontró nada» cuando sí encontró.

## 2026-11-12 · Todos los crons dejan registro de cada corrida

Los 13 crons que faltaban y `/api/ai/resumen-diario` (que también es un cron
de `vercel.json`) pasan por `conRegistro`: una línea JSON al empezar y otra al
terminar, con duración, status y error. Con esto, los 21 crons dejan registro.
Se filtra en los logs de Vercel por `"cron":`.

Acá **no** se agregó `maxDuration`. `medidor` ya declara 300 y se deploya, así
que el plan permite más de 60 s. Si el proyecto usa fluid compute, el valor
por defecto ya es 300, y declarar 60 bajaría el límite. Antes de tocarlo hay
que saber cómo está configurado el proyecto (pendiente P11). Los que ya
declaran 60 (#12, #13) están hechos para entrar en 60 s.

## 2026-11-12 · Woo: un solo mapeo, firma de tiempo constante y tests

El sync (`lib/woo/sync.ts`) y el webhook (`/api/woo-webhook`) tenían cada uno
su copia de `pickTipoEnvio`, `isFueraDeHorario` y `mapItems`: un arreglo en uno
no llegaba al otro. Ahora las dos rutas usan `lib/woo/mapear.ts`, que no toca
red ni base y tiene tests. Además, `horaBuenosAires` normaliza el «24» que
algunas versiones de ICU devuelven a medianoche.

El webhook comparaba la firma HMAC con `!==`. Eso no es de tiempo constante:
el tiempo de respuesta filtra cuántos caracteres coinciden. `firmaValida` usa
`timingSafeEqual` y rechaza la firma vacía.

No cambia qué pedido entra ni cómo se guarda. La ingesta de Drive
(`lib/drive/correr.ts`) todavía no tiene tests de punta a punta: van con H1,
cuando la fuente sea una interfaz que se pueda reemplazar por una falsa.

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
