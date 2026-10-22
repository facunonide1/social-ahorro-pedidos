# Por qué el auditor ahora falla por omisión

*v0.99 · bloque E*

## Es la tercera vez

Tres versiones seguidas, el mismo error con tres caras distintas:

| | Dónde | Qué pasó |
|---|---|---|
| v0.95 | RLS | Políticas permisivas que daban lectura de más |
| v0.97 | RLS | 130 políticas `FOR ALL` que anulaban el filtro por sucursal |
| v0.98 | Consultas | Un corte silencioso de 1.000 filas en código nuevo |

Cada vez había un auditor. Cada vez el auditor verificaba su capa y dejaba
pasar la de al lado. La v0.98 lo dijo así: el auditor de cortes sólo miraba
las tablas que **tenía escritas en una lista a mano**. Una tabla que no
estaba en la lista no se revisaba, y no revisar se veía igual que estar bien.

## Lo que cambió

El auditor ya no tiene lista. Saca las relaciones de la base —`listar_relaciones()`
más un conteo por cada una, en `scripts/contar-relaciones.mjs`— y guarda el
resultado en `scripts/conteo-relaciones.json`.

Y lo importante:

```js
function filasDe(tabla) {
  if (tabla.startsWith('fab_')) return 0   // frontera declarada, no omisión
  const n = TABLAS_GRANDES[tabla]
  if (n === undefined) return Infinity     // falla por omisión
  if (n < 0) return Infinity               // no se pudo contar
  return n
}
```

Una tabla que el auditor no conoce se trata como si fuera enorme. Si alguien
crea una tabla nueva y no vuelve a contar, el build falla. Antes, el build
pasaba y la tabla quedaba sin revisar para siempre.

La única excepción son las tablas `fab_*`, que son de la Fábrica y están
declaradas afuera a propósito: eso es una frontera, no un olvido.

## Lo que apareció cuando dejó de omitir

**25 relaciones** que el auditor venía ignorando enteras. Entre ellas:

| Relación | Filas |
|---|---|
| `stock_disponible_sucursal` | 192.868 |
| `stock_items` | 192.464 |
| `stock_disponible` | 48.217 |
| `reco_compras` | 48.206 |
| `transferir_antes_de_comprar` | 2.909 |

`stock_items` tenía 480 filas de demostración hasta la v0.96. Después de
cargar el maestro por sucursal pasó a 192.464. Cinco pantallas venían
cortando en 1.000 desde entonces, dos versiones.

Los hallazgos sin aceptar pasaron de **1 a 46**. Se arreglaron **11 consultas**
que devolvían de menos y se aceptaron **12** con un motivo escrito caso por
caso. Dos de las arregladas las había escrito yo mismo en este mismo bloque,
una de ellas en el ejecutor de agentes: el monto que se compara contra el tope
—o sea, lo que decide si un agente actúa solo— salía subestimado.

## La verificación de coherencia

El corte de la v0.98 lo destapó un cruce escrito a mano para el informe: el
código decía 635 productos, la base decía 1.687. Ahora eso es
`npm run verificar:coherencia` y lo corre el build.

Cada chequeo llama **la misma función que llama la pantalla** y compara el
número contra el mismo hecho por otro camino. Un chequeo que escribe su propia
consulta no prueba nada: prueba su consulta.

En su primera corrida encontró un bug vivo. `agentes_resumen(null)` tardaba
~20 segundos; el rol `authenticated` tiene `statement_timeout = 8s`;
`lectura.ts` no miraba el error y `resumen ?? {}` dejaba todo en cero. **Abasto
aparecía apagado diciendo «el plan de compra no tiene nada urgente»** cuando
había 2.402 ítems urgentes por $63,2 millones.

Es el mismo error de siempre con otra ropa. En la v0.98 el cero venía de un
corte de 1.000 filas; acá venía de un timeout. Desde la pantalla se leen igual:
los dos dicen «lo miré y no hay» cuando lo que pasó es «no lo pude saber».

El arreglo está en la migración 0204: el resumen se calcula una vez por día y
se guarda, la pantalla lee una fila, y si nunca se calculó devuelve **null**,
no cero. La pantalla muestra de cuándo son los números.

## El candado que decía registrar

E.5 pedía verificar que ningún otro trigger tuviera el patrón de la v0.98:
escribir el registro y después lanzar la excepción que lo revierte.

Hay uno, y es el mismo. En la v0.98 se arregló la **puerta**
(`agente_definir_nivel`, que devuelve el rechazo sin lanzar). La **pared**
—el trigger `tg_agente_config_constitucion`— quedó con el patrón viejo.

Probado, no supuesto:

```
antes=1 después=1 -> el registro SE PERDIÓ
```

Y el mensaje decía «El intento quedó registrado».

En Postgres no hay transacción autónoma: una pared que rechaza no puede dejar
nada escrito. Así que no lo promete más. Ahora dice la verdad —que esa
escritura fue directa a la tabla y por eso no queda asentada— y apunta a la
pantalla, que sí registra.

Y para que no vuelva, `triggers_que_registran_y_revierten()` lo busca en todos
los triggers vivos. Tiene que devolver cero filas. Lo corre el build.
