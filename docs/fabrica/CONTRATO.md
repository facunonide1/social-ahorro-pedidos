# El alcance de la fábrica

Estado al cierre de v0.75. Qué gobierna el lector hoy, qué se declara y no se
lee, y qué falta. El contrato de parámetros quedó cerrado en v0.73 y su recuento
sigue abajo sin cambios.

---

## La cifra

> **Presentación en 2 de 10 pools (17 pantallas) · 4 parámetros de 48 · 4 automatizaciones de 15**

Se calcula, no se escribe, y no se redondea para arriba. Vive en
`/fabrica/[slug]/estado`.

Las 4 automatizaciones son **las cuatro de Stock**: la primera vez que la fábrica
gobierna un dominio entero de un pool y no una muestra.

---

## Estado por aspecto

### Presentación y navegación — desde v0.62

17 pantallas gobernadas sobre los 2 pools con el lector prendido. Los otros 8
declaran sus pantallas y nadie las lee.

**Falta:** prender los 8 pools apagados.

### Parámetros — desde v0.68

4 gobernados de 48. El denominador se compone 17 hechos + 31 configurables; de
los 31, **18 son sensibles y el lector no los devuelve** — uno mal leído afloja
un control o mueve plata.

**Falta:** los 6 no gobernables (declarados y sin cablear), los 3 con brecha
—que son trabajo de Social Ahorro— y la decisión de fondo sobre los sensibles.

### Automatizaciones — desde v0.74, dominio completo en v0.75

| | Cuántas |
|---|---|
| **Declaradas** | 15 |
| **Cableadas** — el código le pregunta a la fábrica | 15 |
| **Gobernadas** — cableada Y con el lector prendido | 4 |
| Con brecha declarada | 2 |
| Agendadas y con ruta | 14 |
| Con ruta y sin agendar | 1 |

**Cableada no es gobernada, y confundirlas hace decir 15 de 15.** Con el lector
del pool apagado el código pregunta, la fábrica no contesta y la automatización
corre igual. Son dos columnas distintas en el estado, a propósito.

**Falta:** prender los pools de las otras 11.

---

## El recuento de automatizaciones, 15 de 58

De las 58 acciones que declaran los manifiestos, **43 no son automatizaciones**:
alguien las dispara. Es la pregunta 6 aplicada al aspecto apenas se creó.

En v0.75 se relevaron los 7 crons que corrían sin que ningún pool los declarara:

- **4 se declararon** — métricas del día, reporte semanal (Inteligencia), gastos
  fijos (Finanzas) y controles de zona (Stock).
- **3 no**, y decirlo es la respuesta correcta: `calcular-objetivos` es del
  sector **personas** y los dos de comunicación del sector **comunicacion**, y
  ninguno de los dos está declarado. Meterlos en el pool que más se les parezca
  dejaría un manifiesto diciendo que un pool se hace cargo de tablas que no son
  suyas.

**Ninguna se declara "verificada".** Que el archivo exista y el cron esté
agendado no dice que Vercel lo haya disparado, ni que haya terminado, ni que
haya hecho lo declarado. Lo que sí se puede desde v0.75 es comparar el `agendada`
declarado contra `vercel.json`: da **0 desincronizadas**. Eso tampoco es que corra.

### Apagar no es deshacer

El contrato obliga a declarar `al_apagar`. Sin ese campo, "apagala" se lee como
"que no haya pasado", y alguien apagaría una campaña creyendo que la des-envía.

Desde v0.75 hay un segundo campo por el mismo motivo: **`tambien_manual`**. Los
gastos fijos tienen un GET para el cron y un POST para tesorería; apagar la
automatización apaga el cron y no apaga el botón. Sin decirlo, "apagala" volvía a
leerse como "que no pase" por otra puerta.

Una automatización **nunca cae en carril verde**, ni con el interruptor abierto.

### Lo que se gobierna es la automatización, no la acción

Todas las guardas van en la rama del cron, nunca en el cuerpo compartido con un
POST manual. En v0.74 la única cableada tenía la guarda adentro de `run()`, así
que apagarla apagaba también el botón de una persona: eso es gobernar una acción,
y no es lo declarado ni lo que la fábrica puede hacer hoy.

---

## El contrato de parámetros, 48 = 17 + 31

Cerrado en v0.73. Sin cambios.

| | Cuántos | Qué significa |
|---|---|---|
| **Hechos permanentes** | 12 | La pieza lo hace siempre que esté instalada |
| **Hechos condicionados** | 5 | Depende de cómo está armado ESTE negocio |
| **Con brecha** | 3 | Declarados, el código no los implementa |
| **Sensibles** | 18 | El lector no los devuelve |
| **No gobernables** | 6 | Declarados; la variable de entorno sigue mandando |
| **Gobernados** | 4 | Con cableado completo y verificado |

---

## Artefactos de prueba — desde v0.75

Todo lo que escribe un script de prueba nace marcado, y las lecturas que
alimentan indicadores lo excluyen. Dos veces hubo que limpiar con SQL a mano lo
que generaron las propias pruebas, y la segunda vez esa basura **bloqueó un
cambio real** por la regla de dos rechazos con la misma huella.

- La marca va **al crear**, no al terminar: las corridas que ensucian son las que
  se mueren a la mitad.
- En producción no se ven; **adentro de una prueba sí** — un test que no puede
  ver lo que escribió no verifica nada.
- La deduplicación de propuestas es la única que filtra siempre: ensuciar un
  número es una cosa y bloquear una decisión es otra.
- Arrastre de v0.75: **74 artefactos viejos** sin marcar, 73 borrados. El que
  quedó es el override que gobierna Stock hoy, escrito por la restauración de una
  prueba: una fila vigente no se borra aunque haya nacido de una prueba.

---

## Lo que falta

En orden, y sin estimaciones de tiempo.

### 1 · Aspectos que el lector no gobierna

Quedan los dos peligrosos: **permisos** y **acciones del asistente**. Y los
**parámetros sensibles**, 18 de 31.

- **Permisos** — quién ve qué. Choca con los intocables de Configuración.
- **Acciones del asistente** — un título mal se ve raro; una acción mal hace algo
  que nadie firmó.

### 2 · Los 8 pools apagados

Es lo que más mueve la cifra hoy: 11 automatizaciones ya cableadas y 8 pools de
pantallas esperan sólo eso. Requiere verificación en sombra antes de prender, que
ya está construida.

### 3 · Los 6 sectores sin declarar

`personas`, `comunicacion`, `compliance`, `pedidos`, `cuponera` y lo que quede
sin clasificar. Son software que existe y la fábrica no conoce — y ahora se sabe
que ahí adentro corren 3 crons que nadie declara.

### 4 · Brechas, que son trabajo de Social Ahorro

2 automatizaciones y 3 parámetros. La fábrica las declara y las muestra; no las
arregla.

### 5 · Moldes y dirección visual

No hay ninguno. Es lo único de esta lista que cambia qué clase de herramienta es
esto: permitiría que la fábrica *genere* en vez de sólo gobernar.

---

## Qué del formato no alcanzó para un dominio entero

Gobernar una automatización de muestra y gobernarlas todas no pidieron lo mismo:

- **El contrato no decía por dónde más entra lo mismo.** Apareció con los gastos
  fijos: `tambien_manual`, en 2.2.0.
- **Dos automatizaciones pueden compartir una ruta**, y el formato no tiene cómo
  decirlo: se deduce de que `donde_corre` se repita. Alertas de stock y avisos de
  vencimiento viven en el mismo cron y se gobiernan por separado.
- **El manifiesto no se compara con su versión anterior.** Uno que pierde todas
  sus automatizaciones valida igual, y el lector contesta "no sé nada de eso"
  por cada una. Desde v0.75 queda registrado; impedirlo necesita que el escritor
  mire la versión previa, no sólo el esquema.
- **El formato no expresa relaciones entre parámetros**, que sigue abierto de
  v0.73.

---

## Las siete preguntas de control

Viven en [INDICADORES.md](INDICADORES.md).

**Y la regla que las ordena a todas:** cada categoría nueva del formato nace con
errores de clasificación. La pregunta 6 encontró 5 de 17 hechos mal clasificados
en la categoría creada una sesión antes; en v0.74, que 43 de 54 acciones no
pertenecían a la categoría que las contenía; y en v0.75, que 3 de 7 crons no
pertenecen a ningún pool declarado.

**Y la que salió de v0.74 y volvió a aparecer en v0.75:** dos listas que hay que
mover juntas son un error esperando. En v0.75 se borró una —el mapa de rutas del
relevamiento, que repetía el `donde_corre` del contrato— y quedaron dos, las dos
verificadas contra la realidad en vez de contra la memoria: el cableado contra el
código de cada ruta, y el `agendada` declarado contra `vercel.json`.
