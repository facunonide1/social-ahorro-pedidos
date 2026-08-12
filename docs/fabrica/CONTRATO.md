# El alcance de la fábrica

Estado al cierre de v0.74. Qué gobierna el lector hoy, qué se declara y no se
lee, y qué falta. El contrato de parámetros quedó cerrado en v0.73 y su recuento
sigue abajo sin cambios.

---

## La cifra

> **Presentación en 2 de 10 pools (17 pantallas) · 4 parámetros de 48 · 1 automatización de 11**

Se calcula, no se escribe, y no se redondea para arriba. Vive en
`/fabrica/[slug]/estado`. El aspecto nuevo entra con su propio denominador: 11
automatizaciones declaradas, 1 gobernada de verdad.

**Gobernada quiere decir cableada.** Declarar el contrato no alcanza: la
automatización tiene que preguntarle a la fábrica antes de correr. Hoy sólo
`stock.recalcular_rotacion` lo hace, y es la única que cuenta.

---

## Qué gobierna el lector

| Aspecto | Desde | Alcance |
|---|---|---|
| **Presentación y navegación** | v0.62 | El título de cada pantalla y si aparece en el menú |
| **Parámetros** | v0.68 | Los ponderados inocuo u operativo, sin brecha y sin conflicto de fuente |
| **Automatizaciones** | v0.74 | Si corre o no corre |

La lista vive en `ASPECTOS_QUE_GOBIERNA` (`lib/fabrica/lector.ts`) y el chat la
lee de ahí: no hay una segunda lista escrita a mano que se pueda desactualizar.

### Qué se declara y el lector NO lee

- **Los permisos** — quién ve qué se resuelve en el código y en los intocables
  de Configuración.
- **Las acciones que alguien dispara y la autonomía del asistente** — un título
  mal se ve raro; una acción mal hace algo que nadie firmó.
- **Los parámetros sensibles** — 18 de 31, la mayoría del contrato.

---

## El recuento de automatizaciones, 11 de 54

De las 54 acciones que declaran los manifiestos, **43 no son automatizaciones**:
alguien las dispara. Es la pregunta 6 aplicada al aspecto nuevo apenas se creó
—¿la categoría existe?— y la respuesta fue que el 80% de lo que la comparte no
pertenece a ella.

| | Cuántas | Qué significa |
|---|---|---|
| **Agendadas y con ruta** | 10 | Lo más cerca que se llega sin datos de ejecución |
| **Con ruta y sin agendar** | 1 | `tareas.generar_recurrencias`: existe y no está en `vercel.json`. No corre |
| **Sin ruta** | 0 | |
| **Con brecha declarada** | 2 | El código no hace lo que la declaración dice |
| **Gobernadas (cableadas)** | 1 | `stock.recalcular_rotacion` |
| **Crons que corren y nadie declara** | 7 | Software que existe y la fábrica no conoce |

**Ninguna se declara "verificada".** Que el archivo exista y el cron esté
agendado no dice que Vercel lo haya disparado, ni que haya terminado, ni que
haya hecho lo declarado. Es la pregunta 7 aplicada a la verificación misma:
comprobar el archivo y llamarlo verificado sería medir algo cierto al lado de lo
que hace falta.

### Apagar no es deshacer

El contrato de automatización obliga a declarar `al_apagar`. Sin ese campo,
"apagala" se lee como "que no haya pasado", y alguien apagaría una campaña
creyendo que la des-envía. Lo que ya se envió, se calculó o se creó queda.

Por eso una automatización **nunca cae en carril verde**, ni con el interruptor
abierto: apagar siempre pide firma, y el costo que se firma dice qué queda hecho.

---

## El contrato de parámetros, 48 = 17 + 31

Cerrado en v0.73. Sin cambios en v0.74.

| | Cuántos | Qué significa |
|---|---|---|
| **Hechos permanentes** | 12 | La pieza lo hace siempre que esté instalada |
| **Hechos condicionados** | 5 | Depende de cómo está armado ESTE negocio; no viaja con la pieza |
| **Con brecha** | 3 | Declarados, el código no los implementa |
| **Sensibles** | 18 | El lector no los devuelve: uno mal leído afloja un control o mueve plata |
| **No gobernables** | 6 | Declarados con su contrato; la variable de entorno sigue mandando |
| **Gobernados** | 4 | Y los cuatro con cableado completo y verificado |

Todos clasificados, todos con consumo declarado o excluido con motivo, 0
conflictos de fuente, 0 consumidores sin verificar, consumidor y símbolo
separados, verificación acotada a la función y no al archivo.

---

## Lo que falta

En orden, y sin estimaciones de tiempo.

### 1 · Aspectos que el lector no gobierna

Quedan dos, y son los dos peligrosos: **permisos** y **acciones del asistente**.
También los **parámetros sensibles**, 18 de 31. Mientras no se lean, la fábrica
gobierna la mitad chica de lo que declara.

Automatizaciones era el tercero y se cerró en v0.74 justamente por eso: es
reversible, ya tenía niveles de participación declarados desde v0.59, y el daño
de equivocarse es acotado y visible.

### 2 · Cablear lo declarado

- **10 automatizaciones** declaradas con contrato y sin cablear.
- **6 parámetros no gobernables**: la variable de entorno sigue mandando.

En los dos casos el trabajo está medido: cada uno tiene su lugar de consumo
identificado. Declarar no es gobernar, y el estado los cuenta separados para que
la diferencia no se pierda.

### 3 · Brechas que son trabajo de Social Ahorro

- **2 automatizaciones con brecha**, la del CRM entre ellas: `correr_automatizaciones`
  guarda como enviado sin confirmación y el nivel declarado dice `prepara`.
- **3 parámetros con brecha**.

No es deuda del contrato: es construcción, y la hace Social Ahorro. La fábrica
lo declara y lo muestra; no lo arregla.

### 4 · Pools apagados

8 de 10. Cada uno prendido suma sus pantallas, sus parámetros y sus
automatizaciones a lo que gobierna de verdad. Requiere verificación en sombra
antes de prender, que ya está construida.

### 5 · Sectores sin declarar

6 del censo, más los 7 crons que corren y ningún pool declara.

### 6 · Moldes y dirección visual

No hay ninguno. Es lo que permitiría que la fábrica *genere* en vez de sólo
gobernar — y es la única de las seis que cambia qué clase de herramienta es esto.

---

## Las siete preguntas de control

Viven en [INDICADORES.md](INDICADORES.md). Se contestan por escrito antes de que
un indicador nuevo entre, y la séptima salió de que una verificación midiera
algo cierto pero al lado.

**Y la regla que las ordena a todas:** cada categoría nueva del formato nace con
errores de clasificación. La pregunta 6 encontró 5 de 17 hechos mal clasificados
en la categoría creada una sesión antes, y en v0.74 encontró que 43 de 54
acciones no pertenecían a la categoría que las contenía. Se aplica apenas se
crea algo, no seis sesiones después.
