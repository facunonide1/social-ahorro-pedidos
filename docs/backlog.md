# Backlog de NORA

Lo que falta para dar NORA por terminada. Cada ítem tiene qué es, cuándo está
terminado, rama, estado y dependencia. Lo que necesita a Facu está además en
[`pendientes-humanos.md`](pendientes-humanos.md) con el texto de firma.

Estados: `pendiente` · `en curso` · `en PR` · `bloqueado por humano` · `hecho`.

Migraciones: la más alta en `main` es la 0294 (sin aplicar). La 0295 es del
PR #6 y la 0296 del PR #7. Las nuevas siguen desde la 0297. Ninguna se aplica
desde acá.

Lo que no está en el repo y vive sólo en la base (hay que traerlo antes de
tocarlo): la vista `decisiones_pendientes`, `proveedores_detectar`,
`sifaco_aplicar_maestro` y `rls_escrituras_que_dan_lectura`.

---

## A · Estabilidad

**A1 · avisos-proveedores: 400 «header too large»**
- Qué: `lib/proveedores/avisos.ts` manda hasta 500 `clave_dedup` en un
  `.in()` de PostgREST, que viaja en la URL. El error del select no se lee:
  con el 400, todo cuenta como nuevo y los avisos se duplican. Igual en
  `lib/compras/avisos.ts`, sin tope.
- Terminado: dedup en tandas chicas, errores que cortan la corrida, sin
  tope de 500, tests.
- Rama: `fix/avisos-dedup-por-tandas` · Estado: en PR · Depende de: —

**A2 · Crons sin tope y con escrituras gigantes**
- Qué: generar-agenda, alertas-stock, metricas-stock y avisos-proveedores
  no declaran `maxDuration`. alertas-stock lee `producto_rotacion` sin
  paginar (se corta en 1.000 en silencio) e inserta todas las alertas de una.
  metricas-stock hace un upsert único de todo `producto_rotacion`.
- Terminado: `maxDuration` en todos los crons, lecturas paginadas, escrituras
  en tandas, cada corrida loguea inicio, fin, duración y error (G5).
  alertas-stock y metricas-stock por tramos con plazo: ninguna corrida pasa
  los 60 s y, si una no llega, no escribe y la retoma la siguiente pasada.
- Rama: `fix/crons-tandas` · Estado: en PR · Depende de: —

**A3 · `cerebro_calcular` (206 timeouts por día)**
- Qué: pg_cron lo corre cada minuto (`0288:478`) con tope de 50 s. Lee
  `decisiones_pendientes` dos veces (dentro de `bandeja_unica` y aparte) y
  hace varios group-by de toda la cadena.
- Terminado: migración preparada que lo corre cada 5 minutos; después (con A4),
  que lea la vista una sola vez. Rollback listo. Sin aplicar.
- Rama: `feat/estabilidad-cerebro` · Estado: en PR, esperando firma (0297
  cambia sólo la frecuencia; la lectura única de la vista queda para A4) ·
  Depende de: firma de la migración.

**A4 · `decisiones_pendientes` pesada**
- Qué: vista sin parámetro. Cada lectura calcula la cadena entera y la
  filtra después la RLS. La lee `/admin` (con un timeout de 5 s desde el
  #8), `bandeja_unica` y `cerebro_calcular`.
- Terminado: snapshot o función con `p_sucursal` que filtre adentro de cada
  rama; `/admin` lee el snapshot.
- Rama: `feat/estabilidad-decisiones` · Estado: bloqueado por humano (el
  cuerpo de la vista no está en el repo; hace falta leerlo de la base) ·
  Depende de: acceso a Supabase (P2).

**A5 · google-drive/procesar**
- Qué: corridas que pasan los 60 s con planillas grandes.
- Terminado: lote seguro (uno pesado por corrida, corte a los 45 s,
  recuperación de `procesando` colgados). Ya está en el PR #7.
- Rama: `cursor/compras-match-ingesta-61dc` → B1 · Estado: en PR ·
  Depende de: B1.

**A6 · nora-auditor y generar-agenda**
- Qué: el auditor corre `compras_rotacion` de toda la cadena y un
  SELECT + INSERT por aviso. generar-agenda filtra `tareas` por
  `created_at`.
- Terminado: avisos en tandas; índices en F5.
- Rama: `fix/crons-tandas` · Estado: en PR (generar-agenda) / pendiente
  (avisos del auditor en tandas) · Depende de: F5 para los índices.

## B · Compras e ingesta

**B1 · PR #7 rebaseado sobre main**
- Qué: el PR #7 no mergea limpio contra main desde que entró el #8. No se
  reescribe la rama ajena: se arma una rama nueva con main mergeado.
- Terminado: rama nueva con CI en verde, preview sin depender de las env,
  0296 con rollback.
- Rama: `feat/compras-cruce` · Estado: pendiente · Depende de: G1.

**B2 · Proveedores Monroe Americana y OMICRON**
- Qué: los alias ya están en el PR #7. Falta la fila «MONROE AMERICANA» en
  `proveedores`.
- Terminado: migración idempotente (`insert … where not exists`) con
  rollback.
- Rama: `feat/compras-proveedores-monroe` · Estado: pendiente · Depende de:
  B1, firma de la migración.

**B3 · Archivos de más de 12 MB**
- Qué: las copias .xls pesan 42 MB. El PR #7 las deja en previa
  (`omitido_por_tamano`).
- Terminado: la pantalla de Drive lista los omitidos con el link a la carga
  manual, y la carga manual acepta el archivo de a hojas.
- Rama: `feat/ingesta-archivos-grandes` · Estado: pendiente · Depende de: B1.

**B4 · Ingesta incremental**
- Qué: hoy mira `modifiedTime > last_sync_at`. Un archivo editado se
  reprocesa entero, y uno que se movió de carpeta no se ve.
- Terminado: se compara `md5Checksum` o `version` por archivo, y sólo se
  reprocesa lo que cambió. Tests.
- Rama: `feat/ingesta-incremental` · Estado: pendiente · Depende de: H1.

**B5 · Las compras ingeridas se ven**
- Qué: `compras_lineas` no la lee ninguna pantalla.
- Terminado: listado en compras con filtro de cruzadas y sin cruzar, y
  «Ignorar».
- Rama: `feat/compras-cruce` · Estado: pendiente · Depende de: B1.

## C · Maestro por sucursal

**C1 · Aplicar el maestro de una sucursal**
- Qué: aplicar el maestro de Figueiras y el de Guzmán y González, cada uno
  a su sucursal. Nunca `sifaco_aplicar_maestro`.
- Terminado: función nueva con `p_sucursal`, que toca sólo
  `producto_stock_sifaco` y los precios de esa sucursal. Guarda lo anterior
  en una tabla de deshacer. Migración con rollback.
- Rama: `feat/maestro-por-sucursal` · Estado: pendiente · Depende de: firma
  de la migración.

**C2 · Previsualizar → aplicar → deshacer**
- Qué: UI en `/admin/operaciones/sifaco`. Hoy dice «El paso de aplicar al
  catálogo no está en esta versión».
- Terminado: previa por sucursal con altas, bajas y diferencias de precio,
  costo y stock. Aplicar con confirmación. Deshacer la última aplicación.
  Todo detrás de una bandera.
- Rama: `feat/maestro-por-sucursal` · Estado: pendiente · Depende de: C1.

## D · Precios

**D1 · PR #6: historial de precios (0295)**
- Qué: no mergea limpio contra main.
- Terminado: rama con main mergeado y CI en verde.
- Rama: `feat/precios-historial` · Estado: pendiente · Depende de: G1;
  firma de la 0295.

**D2 · Precio real desde facturas**
- Qué: ya está en el PR #6 (PDF con texto, la pestaña Compras, fotos
  confirmadas).
- Terminado: igual que D1.
- Rama: D1 · Estado: pendiente · Depende de: D1.

**D3 · PR #3: comparador detrás de bandera**
- Qué: trae su propia `0294_el_comparador_de_precios.sql`, que choca con la
  0294 de main, y un comparador que ya reemplazaron el #5 y el #6.
- Terminado: la idea de banderas pasa a G4 y el #3 se cierra como
  reemplazado.
- Rama: — · Estado: bloqueado por humano (cerrar el PR es decisión de Facu) ·
  Depende de: G4.

## E · Multisucursal

**E1 · `/hub?denied=1` no existe**
- Qué: `requireAdminHubAccess` manda ahí cuando el rol no alcanza, y
  `app/hub` no existe: termina en un 404.
- Terminado: va a `/admin` con un aviso de sin permiso.
- Rama: `fix/multisucursal-denegado` · Estado: pendiente · Depende de: —

**E2 · Selector de sucursal activa coherente**
- Qué: la cookie `sa_sucursal` existe, pero la home de `/admin` no filtra
  decisiones por ella.
- Terminado: las pantallas de la home respetan la sucursal activa;
  super_admin sin sucursal ve «todas»; tests de `getSucursalActiva`.
- Rama: `feat/multisucursal-activa` · Estado: pendiente · Depende de: A4.

**E3 · /pedidos y /admin coherentes**
- Qué: `users_pedidos` y `users_admin` son dos mundos de permisos.
- Terminado: una sola regla documentada de quién entra a qué, y tests de
  la redirección.
- Rama: `feat/multisucursal-activa` · Estado: pendiente · Depende de: E1.

**E4 · Pedidos sin sucursal**
- Qué: hay canales que no tienen una sucursal de despacho configurada.
- Terminado: la pantalla de canales permite asignarla y el aviso de la
  home lleva ahí.
- Rama: `feat/multisucursal-canales` · Estado: pendiente · Depende de: —

## F · Seguridad

**F1 · PIN débil**
- Qué: un PIN de 4 dígitos que se adivina primero.
- Terminado: el código rechaza PINs débiles al crearlos o cambiarlos (todos
  iguales, escaleras, repetidos, años, el N° de empleado), y el alta avisa
  si el PIN no se guardó. Facu cambia el del super admin (P3).
- Rama: `feat/seguridad-pin-debil` · Estado: en PR; el PIN del super admin,
  bloqueado por humano (P3) · Depende de: —

**F2 · `anon` ejecuta 9 funciones SECURITY DEFINER**
- Qué: hay que quitarle a `anon` el EXECUTE sobre esas funciones.
- Terminado: migración con el revoke por función y rollback, armada desde
  la lista real de la base. Vacía `scripts/definer-deuda.json` (11 según las
  migraciones). Antes de firmar: ver si `current_admin_role` y
  `hub_rol_activo` (las usan políticas RLS) las necesita `anon`.
- Rama: `feat/seguridad-revoke-anon` · Estado: bloqueado por humano (no se
  escribe a ciegas) · Depende de: P2.

**F3 · Chequeo que rompe el build**
- Qué: es la octava vez que aparece esta familia de error.
- Terminado: auditor estático sobre las migraciones (toda función
  `security definer` termina con su revoke a `public` y `anon` después del
  último `create`), en el build y en CI. Más adelante, la verificación en
  vivo con una función de solo lectura.
- Rama: `chore/auditar-definer` · Estado: en PR (estático, con 11 en deuda
  conocida); la parte en vivo, bloqueada por humano (P2) · Depende de: G1.

**F4 · Protección de contraseñas filtradas**
- Qué: un interruptor de Supabase Auth.
- Terminado: prendido.
- Rama: — · Estado: bloqueado por humano · Depende de: P4.

**F5 · Índices de las 346 foreign keys**
- Qué: foreign keys sin índice.
- Terminado: un script de solo lectura que genera los `create index
  concurrently` desde el catálogo, y una migración con los de las tablas
  que leen los crons lentos (`movimientos_stock(tipo, fecha)`,
  `tareas(created_at)` y los que salgan).
- Rama: `feat/seguridad-indices-fk` · Estado: pendiente (el script) /
  bloqueado por humano (la lista real) · Depende de: P2.

**F6 · RLS: 430 initplan y 259 multiple permissive**
- Qué: `auth.uid()` sin `(select …)` y políticas permisivas que se
  duplican.
- Terminado: migración por tabla, con rollback, desde los advisors.
- Rama: `feat/seguridad-rls-initplan` · Estado: bloqueado por humano ·
  Depende de: P2.

**F7 · Usuarios `@rls.test` vivos**
- Qué: revisar si quedaron de corridas viejas del auditor.
- Terminado: revisados todos (no los primeros 200); los que haya, borrados
  con firma.
- Rama: — · Estado: bloqueado por humano · Depende de: P2 o P9.

**F8 · El esquema que vive sólo en la base**
- Qué: `decisiones_pendientes`, `proveedores_detectar`,
  `sifaco_aplicar_maestro` y `rls_escrituras_que_dan_lectura` no están en
  ninguna migración.
- Terminado: su DDL volcado a `supabase/esquema-vivo/` como referencia, sin
  aplicar nada.
- Rama: `chore/esquema-vivo` · Estado: bloqueado por humano · Depende de:
  P2.

## G · Calidad y CI

**G1 · Workflow de CI**
- Qué: `npm test` + `tsc` + lint + build en cada PR, sin secretos.
- Terminado: corre en cada PR y queda en verde.
- Rama: `chore/ci-tests` · Estado: en PR · Depende de: —

**G2 · Config de lint**
- Qué: `.eslintrc.json` con `next/core-web-vitals`.
- Terminado: `npm run lint` sale en 0 y quedan sólo avisos.
- Rama: `chore/ci-tests` · Estado: en PR · Depende de: —

**G3 · Tests de la ingesta y del sync Woo**
- Qué: `lib/drive/correr.ts` y `lib/woo/sync.ts` no tienen tests.
- Terminado: tests con dobles de Drive, de Woo y de Supabase, sin red.
- Rama: `chore/tests-ingesta-woo` · Estado: pendiente · Depende de: H1.

**G4 · Banderas**
- Qué: un módulo único `lib/banderas.ts`.
- Terminado: las banderas de lo nuevo (maestro por sucursal, fuente FIND,
  etc.) se leen de ahí, apagadas por defecto, con tests.
- Rama: `chore/banderas` · Estado: pendiente · Depende de: —

**G5 · Logs de los crons**
- Qué: hoy ningún cron deja registro de su corrida.
- Terminado: un wrapper `correrCron()` que loguea JSON (nombre, inicio,
  duración, ok o error) y responde igual que antes. La tabla de corridas
  va aparte, con migración.
- Rama: `fix/crons-tandas` · Estado: en PR (7 crons envueltos; faltan los
  otros 14) · Depende de: —

**G6 · Variables de Supabase en Preview**
- Qué: hoy están limitadas a `feature/crm-redesign`.
- Terminado: ampliadas.
- Rama: — · Estado: bloqueado por humano · Depende de: P6.

## H · Fuentes intercambiables

**H1 · Interfaz `Fuente`**
- Qué: `lib/drive/correr.ts` está atado a `./google`.
- Terminado: `lib/ingesta/fuente.ts` con `listarCambios`, `descargar` y
  `marcarProcesado`; Drive como primera implementación, sin cambio de
  comportamiento; tests con una fuente falsa.
- Rama: `feat/fuentes-interfaz` · Estado: pendiente · Depende de: B1.

**H2 · Fuente FIND**
- Qué: FIND va a ser la fuente maestra.
- Terminado: esqueleto de la implementación detrás de la bandera
  `INGESTA_FUENTE=find`, que hoy responde «no configurada».
- Rama: `feat/fuentes-interfaz` · Estado: pendiente · Depende de: H1;
  credenciales de FIND (P10).

## I · Pulido

**I1 · loading.tsx y not-found.tsx**
- Qué: no hay ninguno en toda la app.
- Terminado: un `loading` y un `not-found` dentro del shell de NORA.
- Rama: `feat/pulido-estados` · Estado: pendiente · Depende de: —

**I2 · Lo que dice «Próximamente»**
- Qué: notificaciones, búsqueda, acciones rápidas, el dictado y la nav «En
  construcción».
- Terminado: o funciona, o se oculta detrás de una bandera; nada visible
  que no ande.
- Rama: `feat/pulido-proximamente` · Estado: pendiente · Depende de: G4.

**I3 · Estados vacíos y errores amigables**
- Qué: las pantallas más usadas (compras, sifaco, drive, pedidos).
- Terminado: cada una distingue «vacío», «no se pudo leer» y «sin
  permiso».
- Rama: `feat/pulido-estados` · Estado: pendiente · Depende de: —

## Fuera de alcance

- Cuponera y puntos de clientes: en pausa, no se tocan.
- PR #1 (guardrail de hooks de Claude) y PR #2 (docs): esperan decisión de
  Facu (P8).
