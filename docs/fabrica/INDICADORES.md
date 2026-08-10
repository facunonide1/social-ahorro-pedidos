# Los indicadores de la fábrica

## La regla

> **Cuando algo da cero, hay que poder distinguir si es cero porque está bien o
> cero porque no miró.**

Y su reverso, que costó igual de caro:

> **Una alarma vieja es tan mala como un cero mentiroso.**

Hasta v0.66 aparecieron **cinco** indicadores que mentían. Los cinco se
encontraron **por casualidad**, probando otra cosa. En v0.67 se buscaron a
propósito y aparecieron **ocho más**. En v0.68, arreglando uno de ellos, aparecieron **dos más**. En v0.69, extendiendo el sistema a comportamiento, **dos más**. Eso deja de ser mala suerte y pasa a ser
un patrón: en un sistema que mide su propia salud, el modo de falla por defecto
no es romperse, es tranquilizar.

Un indicador que se rompe se arregla. Uno que miente se cree.

---

## Las cuatro preguntas

Todo indicador nuevo las contesta por escrito antes de entrar:

1. **¿Puede mostrar un número cuando no midió nada?**
   Si la respuesta es sí, el número tiene que ser `null` y no `0`.
2. **¿Distingue "cero porque está bien" de "cero porque no miró"?**
   Si no, hace falta un tercer estado. `no_verificado` no es un caso raro: es la
   respuesta más común de un sistema que recién arranca.
3. **¿Tiene corte temporal donde corresponde?**
   Un evento anterior al último cambio de declaración puede estar resuelto por
   ese cambio. Todos los indicadores usan el mismo corte (`corteDe()`); si uno
   lo usara y otro no, el panel se contradiría a sí mismo. Y si hay dedupe, su
   ventana **no puede ser más vieja que el corte** — ver el hallazgo 13.
4. **¿Consulta el esquema real o asume nombres de columnas?**
   Un `.select()` con una columna que no existe **no lanza**: devuelve `data`
   en `null`, y todo conteo derivado da cero. Es la forma más barata de fabricar
   un cero mentiroso, y ya pasó cuatro veces.

Y una quinta que salió de v0.67:

5. **¿Está comparando dos cosas que pueden ser la misma por construcción?**
   Comparar el título *efectivo* contra el literal del código es una tautología
   cuando el override se escribió copiando ese literal. Siempre da cero, y el
   cero no dice nada.

---

## Los diecisiete que mintieron

| # | Indicador | Qué decía | Por qué mentía | Cuándo |
|---|-----------|-----------|----------------|--------|
| 1 | Modo sombra | "sin diferencias" | Con el manifiesto inválido volvía sin comparar y sin registrar | v0.65 |
| 2 | Cobertura | diez ceros | Ninguna pantalla había consultado nunca; el cero era "no miró" | v0.64 |
| 3 | Conteo de diferencias | "25 sin resolver" | Sin corte temporal: arrastraba alarmas de antes de limpiarlas | v0.66 |
| 4 | Conteo de eventos | ceros parejos | `registrado_at` no existe, la columna es `ocurrido_at`; el select falló mudo | v0.66 |
| 5 | Verificación provocada | "0 diferencias" | No conoce el literal del componente, y no lo decía | v0.66 |
| 6 | Comparación en sombra | "14/14 idénticas" | Comparaba el título **efectivo** contra el código: tautología | v0.67 |
| 7 | Origen de un valor | "de este proyecto" | Un override idéntico a la pieza se marcaba como decisión | v0.67 |
| 8 | Interruptor del lector | `{ ok: true }` | Un estado inexistente vaciaba el update y contestaba que sí | v0.67 |
| 9 | Salud del Taller | "0% ignoradas" | Sin propuestas devolvía 0, que se lee como salud perfecta | v0.67 |
| 10 | Resumen de "verificar ahora" | "0/8 · 0 · 0 problemas" | Se comía el "el lector está apagado" cuando había pantallas declaradas | v0.67 |
| 11 | Validador de manifiesto | *(nada)* | **Lanzaba** con un manifiesto corrupto; el lector lo atrapaba y el pool quedaba como si el flag estuviera bajo, sin registrar fallback | v0.67 |
| 12 | El corte temporal | "0 diferencias" | El corte era **por pool**: tocar una ruta borraba las alarmas de las otras | v0.67 → **arreglado en v0.68** |
| 13 | Corte + dedupe juntos | "0 diferencias" y no volvían | El corte las escondía y el dedupe de 24 h impedía re-registrarlas: diez diferencias vivas, invisibles por un día | v0.67 |
| 14 | Conteo de diferencias | "37 diferencias" | Al pasar el corte a por campo empezó a contar EVENTOS y no campos: 37 eventos, 10 problemas. Inflar es tan malo como esconder | v0.68 |
| 15 | Leer el valor gobernante | "17 diferencias" | Observar y afirmar pasaban por la misma puerta: un script que sólo quería MIRAR pasaba `'FALLBACK'` como literal del código y eso quedaba en el log como diferencia real. 14 eventos inventados | v0.68 |
| 16 | Diff de una propuesta | "No cambia nada." | El diff sólo miraba pantallas: un cambio de PARÁMETRO llegaba a la cola con `queCambia: []`, sobre lo único que altera el comportamiento | v0.69 |
| 17 | Huella de una propuesta | "ya se rechazó dos veces" | `JSON.stringify(o, keys)` FILTRA, no ordena: todas las propuestas de un mismo tipo compartían huella | v0.69 |

El **11** es el peor de la lista: un manifiesto roto en la base se veía
exactamente igual que un pool que nadie prendió.

El **13** es el que enseñó más, porque no está en ninguna de las dos piezas: está
en cómo se combinan. El corte descarta los eventos anteriores al último cambio de
declaración; el dedupe se niega a registrar algo que "ya está". Por separado los
dos son correctos. Juntos hacían desaparecer diez diferencias vivas por 24 horas.
Arreglado: la ventana del dedupe nunca es más vieja que el corte, porque un
cambio de declaración empieza la cuenta de nuevo.

El **12 se arregló en v0.68**: el corte pasó a ser por CAMPO, usando
`fab_procedencia`, que sabe qué campo cambió y cuándo. Una diferencia sólo se
considera resuelta si cambió el campo que la produjo, y sólo si el cambio fue en
la PIEZA — un override de instalación no toca lo que se compara, así que no puede
resolver nada.

El **16 es el que peor mentía de los diecisiete**, por lo que decía: una propuesta
que cambiaba un parámetro llegaba a la cola diciendo **"No cambia nada"**, sobre
un cambio que altera el comportamiento del sistema. El diff se escribió cuando la
fábrica gobernaba presentación y nadie lo extendió cuando empezó a gobernar
comportamiento. No es un cero que dice "hay poco": dice "no hay nada".

El **17** es el más silencioso. `JSON.stringify(objeto, claves)` no ordena las
claves: las FILTRA, en todos los niveles. Así que
`{configurable:{dias_aviso_vencimiento:45}}` y
`{configurable:{control_por_zonas:false}}` producían la misma huella
`{"configurable":{}}`, y dos rechazos de cualquier cambio de parámetro
bloqueaban para siempre cualquier otro del mismo pool. Se descubrió porque una
prueba no pudo proponer un valor que nunca se había propuesto.

El **14 y el 15 salieron de arreglar el 12**, y eso también es un patrón: cada
arreglo de un indicador es la mejor oportunidad para crear el siguiente. El 14 es
el mismo error del otro lado —pasó de esconder 10 a inflar a 37— y el 15 es la
quinta pregunta en otra forma: el canal de observación y el de afirmación no
pueden ser el mismo. Quien mira no afirma nada.

Los ocho de v0.67 se encontraron a propósito. Tres los destapó el chat
trabajando —se negó a proponer sobre un pool impecable, y tenía razón según lo
que el indicador le decía—, y dos los destapó la prueba adversaria.

---

## Los que se auditaron y están bien

| Indicador | 1 · ¿número sin medir? | 2 · ¿distingue el cero? | 3 · ¿corte? | 4 · ¿esquema real? |
|-----------|---|---|---|---|
| `coberturaDe()` | no: `no_verificado` | sí, tres veredictos | sí, `corteDe()` | sí |
| `verificarPool()` | no: siempre trae `motivo` | sí, y dice qué **no** puede verificar | n/a (mide el ahora) | sí |
| `estadoDelLector()` | no | sí | sí, **por campo** desde v0.68 | sí, verificado contra la tabla |
| `tituloGobernante()` | no: `null` si no gobierna | sí | n/a | n/a — y NO registra nada: sólo mira |
| `salud()` | ya no: `null` | sí, desde v0.67 | n/a | n/a (en memoria) |
| `chequearCenso()` | no: recorre los manifiestos del repo, no puede leer nada y callarse | sí: un sector ausente sale como error | n/a | sí |
| `carrilDeCampo()` | no: lo desconocido cae en rojo | sí | n/a | n/a |
| `parecidosA()` | no | sí, probado contra un casi-idéntico | n/a | sí |
| `colaDeConstruccion()` | no: cuenta miembros reales | sí | n/a | sí |
| `procedenciaDe()` | no: "procedencia no registrada" ≠ vacío | sí | n/a | sí |
| `revisarCableado()` | no: cuatro estados, y `sin_declarar` ≠ "está bien" | sí, y el denominador excluye lo no verificable | n/a | n/a — sólo lee archivos |
| `efectoDe()` | no: distingue "no sé calcularlo" de "hoy no hay datos" | sí | n/a | sí |
| `bitacora()` | no | sí: guarda **todos** los turnos, no sólo los que salieron bien | n/a | sí |

---

## La prueba adversaria

```bash
npx tsx scripts/fabrica-indicadores-adversario.ts
```

21 casos. Le pone a cada indicador una situación donde no hay nada que medir
—pool inexistente, pool apagado, manifiesto corrupto, cola vacía, override que
no cambia nada, estado que no existe— y verifica que **no** devuelva un número
tranquilizador. Sale 1 si alguno miente.

Dos de los diecisiete de la tabla los encontró esta prueba en su primera corrida, y dos más aparecieron al extender el sistema a comportamiento.

Desde v0.68 hay un bloque que ejercita **corte y dedupe juntos**, no cada pieza
por separado: el hallazgo 13 no estaba en ninguna de las dos, estaba en la
combinación, y probarlas de a una es lo que lo dejó pasar.

**Cada caso trae su contraprueba.** Verificar que algo da cero cuando no hay
nada no alcanza: hay que verificar que da distinto de cero cuando sí hay. Si no,
el indicador podría estar devolviendo cero siempre y la prueba pasaría igual —
que es exactamente el defecto que se está buscando, cometido por la prueba.

---

## Cómo se agrega un indicador

1. Contestar las cinco preguntas por escrito, en el comentario de la función.
2. Devolver `null` —no `0`— cuando no hay nada que medir.
3. Si mide eventos, usar `corteDe()`.
4. Consultar el esquema real antes de escribir un nombre de columna.
5. Agregar su caso —y su contraprueba— a `fabrica-indicadores-adversario.ts`.
6. Agregarlo a la tabla de arriba.
