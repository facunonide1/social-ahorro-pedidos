# Tablas ciegas

Por qué «RLS Enabled No Policy» no siempre es seguro, y cómo se distingue.

---

## El caso que lo mostró

`oferta_items` tenía RLS activa y ninguna política. La ficha de una oferta
mostraba **la oferta sin sus productos**. Una oferta vacía.

Y peor: el tablero de anomalías, que lee `anomalias`, habría dicho **«no hay
anomalías abiertas»** con trece mil cargadas. Un tablero ciego que por eso dice
que está todo bien.

Ninguna de las dos pantallas falló. No hubo error, ni warning, ni fila roja.
Devolvieron cero filas, y cero filas suman cero.

---

## Por qué pasa

RLS activa **sin políticas** no significa «acceso restringido». Significa que
nadie pasa, salvo `service_role`, que ignora RLS por diseño.

Y ahí está la trampa:

| quién | qué cliente usa | qué ve |
|---|---|---|
| el importador | `createAdminClient()` → `service_role` | **todo** |
| la pantalla | `createClient()` → sesión del usuario | **nada** |

El importador carga 46.009 productos, verifica que quedaron los 46.009, y
reporta éxito. Es verdad. La pantalla, el mismo día, muestra cero. También es
verdad. Las dos miran la misma tabla.

---

## Las cuatro clases

**CORRECTA** — RLS con políticas que hacen lo que corresponde. Son 183 de 203.

**CIEGA** — RLS sin políticas, y la lee una pantalla con la sesión del usuario.
El dato está y nadie lo ve. **Es un error.**

**INTENCIONAL** — RLS sin políticas, y sólo la toca un importador o un cron con
`service_role`. Es exactamente lo que se quiere: una pila de origen no tiene por
qué ser legible desde el navegador. Se declara en
`scripts/rls-intencional.json` **con el motivo**, para que el próximo que mire
el linter no lo tenga que deducir.

**ABIERTA** — sin RLS. Cualquiera con una sesión la lee. Hoy no hay ninguna.

---

## Lo que el linter no dice

El advisor de Supabase, «RLS Enabled No Policy», marca **ciegas e intencionales
exactamente igual**. Y son opuestas: una es un error de datos invisible y la
otra es la configuración correcta.

Apareció en v0.81, v0.83 y v0.84, y las tres veces se leyó como estado seguro.
Para las tablas de esas sesiones —`sifaco_maestro_staging`, los lotes de
importación— lo era. Para `producto_stock_sifaco`, que lee la pantalla de stock,
significaba que el stock estaba cargado y la pantalla mostraba `$0`.

**La diferencia no está en la tabla. Está en quién la lee.**

---

## Cómo se verifica ahora

`scripts/auditar-rls.mjs` cruza las dos cosas: las tablas sin políticas, que
salen de la base, contra quién las lee, que sale del código. Corre antes de cada
build (`npm run auditar:rls`) y **falla** si aparece una ciega nueva.

Lo que es intencional se declara con su motivo. Una excepción sin motivo es una
excepción que nadie va a poder revisar después.

## La regla, corta

> Si una pantalla lee una tabla, esa tabla necesita una política de lectura.
> Si la tabla la toca sólo un importador, no la necesita — y hay que decirlo por
> escrito.
