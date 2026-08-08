# El chat de la fábrica

Vive dentro del Taller: `/fabrica/[slug]/taller`.

No abre en una pantalla propia a propósito. Lo que sale del chat cae en la misma
cola que está tres bloques más abajo, y quien conversa tiene que ver las dos
cosas sin cambiar de lugar. Un chat aparte se siente como un canal aparte, con
sus propias reglas, y este no las tiene.

---

## La regla que ordena todo

**NORA nunca promete lo que no puede hacer.**

Es el bug que apareció en el asistente de finanzas —prometió leer una foto que
el sistema todavía no sabía leer— y es el motivo por el que el lugar del chat
quedó reservado y vacío desde v0.58 hasta v0.66. Sin catálogo declarado, un
asistente sólo puede improvisar, y improvisar sobre la configuración de un
sistema es prometer.

De ahí sale todo el diseño: **el modelo contesta sólo desde lo declarado**. No
tiene conocimiento general de "lo que un sistema así podría hacer". Lo que no
está en el manifiesto no existe, y se dice que no existe.

---

## Qué puede

- **Explicar** la declaración de cualquier pool: qué gobierna, qué está apagado,
  qué está intocable, qué diferencias tiene abiertas.
- **Proponer** cambios de instalación: título de pantalla, qué se ve en el menú,
  nombre y descripción del pool, y los parámetros configurables (con la
  advertencia de que todavía no se leen).
- **Preguntar** antes de proponer, cuando la respuesta cambia lo que va a
  proponer.
- **Ofrecer alternativas**, incluida siempre la de no cambiar nada, con el
  argumento honesto a favor.
- **Decir que no**, con el motivo y con una salida.
- **Anotar un pedido de construcción** cuando lo que se pide no existe — y sólo
  si la persona dice que sí. Ver abajo.
- **Entender las dos formas de nombrar una pantalla**: el término del oficio y
  cómo le dice este negocio.
- **Avisar que un campo ya se cambió y se dio para atrás**, con cuántas veces.

El prompt se arma con el manifiesto **efectivo** del proyecto —la pieza con lo
de este negocio encima—, no con la semilla del repo: hablar desde la pieza
pelada sería hablar de valores que acá no rigen.

## Qué no puede

- **Aplicar.** No hay un botón de aplicar en el componente. Todo pasa por
  `proponer()`, deriva su carril igual que una propuesta escrita a mano, y lo
  firma una persona en el Taller.
- **Prender o apagar lectores.** Eso tiene su propio control, con su firma.
- **Crear pools o instalar nada.**
- **Revertir.** También vive en el Taller.
- **Tocar campos de pieza.** Desde un proyecto sólo se sobrescribe lo de
  instalación; lo demás va por la pieza compartida.
- **Proponer solo.** Responde a pedidos. No hay propuestas automáticas sacadas
  del uso, porque todavía no hay datos de uso.
- **Anotar un pedido sin que se lo pidan.** Ofrece y espera. Un pedido anotado
  porque el asistente creyó entender que hacía falta ensucia la cola con
  comentarios al pasar, y una cola con ruido se deja de mirar. Es la única regla
  del chat que **no se puede verificar en código**: desde acá no se distingue un
  "sí" de un "bueno, dale".

---

## Los cuatro motivos para decir que no

Se evalúan **de lo más grave a lo más circunstancial**. Si un pedido toca la
constitución y además el pool está apagado, lo que hay que decir es que toca la
constitución: lo otro se arregla prendiendo un flag, y decirlo invita a
insistir.

| # | Motivo | Cuándo | Qué se ofrece en su lugar |
|---|--------|--------|---------------------------|
| 1 | `constitucional` | Está en los intocables de la pieza | Nada por esta vía, ni con firma. Se explica qué protege el límite |
| 2 | `no_existe` | Pantalla, parámetro o comportamiento no declarado | Anotarlo como pedido de construcción. Sin prometer que se hace |
| 3 | `fuera_del_lector` | Se declara, el lector todavía no lo lee | Depende: ver abajo |
| 4 | `proyecto_no_listo` | El pool está apagado, en sombra o con diferencias abiertas | Dejar la propuesta lista para cuando se prenda |

**El cuarto es el más importante.** Proponer sobre un pool que no gobierna da la
ilusión de que el cambio se va a ver.

### Dentro del tercero hay dos

- **Los parámetros y las dimensiones** se declaran y todavía no se leen. La
  propuesta es legítima —deja la decisión tomada y firmada para cuando el lector
  la lea— y se advierte **antes**, no después.
- **Las acciones y la autonomía del asistente** no se proponen desde acá, ni con
  advertencia. Si un título sale mal se ve raro; si una acción sale mal, el
  sistema hace algo que nadie firmó.

### Por qué esto no vive en el prompt

Un modelo al que se le pide "no propongas cosas imposibles" casi siempre
obedece. *Casi siempre* no alcanza cuando el precio de fallar es prometerle a
alguien un cambio que no va a pasar. La negativa se decide en código
(`lib/fabrica/negativas.ts`), antes y después del modelo:

- **Antes**: el catálogo que ve el modelo ya viene filtrado por permiso. A quien
  sólo puede ver, la herramienta de proponer **ni se le ofrece**. No se le pide
  que se autolimite: no tiene con qué salirse.
- **Después**: si igual arma un pedido prohibido, `porQueNo()` lo corta y la
  persona lee el motivo real, no una disculpa del modelo.

El prompt igual los explica. Eso sirve para que la respuesta sea buena, no para
que sea segura. La seguridad no se delega al texto.

---

## Los dos nombres de cada pantalla

Desde el formato 1.5.0 hay dos, y no son lo mismo:

- **El término del oficio** vive en la pieza. Es el nombre de la cosa en el
  rubro: "Recartelado", "Inventarios".
- **El nombre de este negocio** vive en la instalación. Es cómo le dice el
  equipo: "Cartelería de precios", "Conteos de sucursal".

El chat entiende las dos. Si le preguntás por "inventarios" contesta que la
pantalla existe y que acá figura como "Conteos de sucursal".

Y distingue los dos casos cuando alguien quiere cambiar un nombre:

| Lo que dicen | Qué es | Dónde va |
|---|---|---|
| "acá le decimos distinto" | vocabulario, legítimo y permanente | override `vocabulario`; no borra el término del oficio |
| "la pieza dice algo que está mal, para todos" | un defecto de la pieza | se dice, y se ofrece anotarlo contra la pieza |

El segundo caso importa: taparlo con un override local esconde el defecto, y el
próximo negocio que instale la pieza se lo come.

---

## La cola de construcción

Cuando la respuesta es "eso no existe", NORA lo ofrece y —si le dicen que sí— lo
anota en `/fabrica/construccion` con:

- **el pedido en las palabras de la persona**, sin resumir: lo que se pierde al
  resumir es el motivo, que es lo único que después permite saber si dos pedidos
  son el mismo
- **qué falta**: molde · entidad · comportamiento · integración ·
  capacidad del lector
- **el contexto** que se supo, y la conversación de la que salió

La cola se ordena **por demanda, no por fecha**: primero lo que se pidió en más
proyectos distintos. Es la diferencia entre construir lo que hace falta y
construir lo que se pidió último.

No hay agrupación automática: el sistema sugiere pedidos parecidos por palabras
en común y una persona decide si son el mismo. Un motor semántico que se
equivoca fusiona dos pedidos distintos y borra el que menos gente pidió, que
suele ser el que más falta hace.

---

## La procedencia

Cada valor declarado guarda quién lo decidió, cuándo y por qué. El chat recibe
la lista de campos que **ya se cambiaron y se dieron para atrás**, con cuántas
veces, y tiene la instrucción de decirlo y preguntar qué cambió antes de
proponer sobre ellos.

No se niega por esto —a veces la tercera es la buena— pero mandarlo sin un
motivo nuevo es hacerle perder el tiempo a quien firma.

---

## El límite de alcance actual

**Lo único que el lector gobierna hoy son los títulos de pantalla y qué se ve en
el menú.** Todo lo demás se declara y el sistema sigue usando su código.

La lista vive en `GOBIERNA_HOY`, en `lib/fabrica/negativas.ts`, y no en un
comentario: el día que el lector lea algo más, esa constante cambia y el chat
deja de mentir sin que nadie tenga que acordarse de él.

De los diez pools, **dos tienen el lector prendido** (documentos y stock). En
los otros ocho el chat lo dice antes de proponer nada.

---

## El registro de conversaciones

Cada turno queda en `fab_chat_turnos`: qué se pidió, qué contestó NORA, si
propuso algo y con qué carril, y —cuando dijo que no— por cuál de los cuatro
motivos. Se ve al pie del Taller.

Se guardan **todos** los turnos, no sólo los que terminaron en propuesta. Un
registro donde sólo quedan los pedidos que salieron bien no sirve para medir
nada: lo interesante son los que dijeron que no.

**Por qué se guarda el motivo y no sólo el texto.** El texto sirve para leer una
conversación; el motivo sirve para contarlas. El día que "necesita algo que no
existe" sea el 40% de las negativas, eso no es un problema del chat: es la lista
de lo que hay que construir, ordenada por cuánta gente la pidió.

Para que se pueda contar, la negativa es una **herramienta declarada**
(`no_se_puede`), no una inferencia sobre la prosa. El modelo explica a su manera
y además clasifica lo que acaba de decir.

---

## La pregunta que va siempre

> ¿Esto es una decisión de **este** negocio, o la pieza está mal para todos los
> que la usan?

Va siempre, aunque el pedido parezca inequívoco. No se pregunta por permiso
—desde el Taller sólo se toca lo de este negocio y con eso alcanza para
hacerlo—: se pregunta porque si la pieza está mal para todos, taparlo con un
override local esconde el defecto en vez de arreglarlo, y el próximo negocio que
instale la pieza se come el mismo problema.

---

## Cómo probarlo

```bash
npx tsx scripts/fabrica-probar-negativas.ts   # las cuatro negativas, dos capas
npx tsx scripts/fabrica-probar-chat.ts        # los ocho pasos de v0.66
npx tsx scripts/fabrica-probar-v067.ts        # pedidos, vocabulario y procedencia
```

Ambos corren contra la base real a propósito. Un chat que sólo se probó contra
datos de mentira no probó lo único que importa: si dice la verdad sobre lo que
hay.

`fabrica-probar-chat.ts` usa **stock** y no documentos para los pasos 1 a 5. En
documentos ya hubo propuestas de título aplicadas y revertidas por las pruebas
de v0.65, y el chat las lee: con esa historia encima deja de preguntar lo que se
le quiere probar que pregunta y pasa a preguntar algo mejor —"¿sabés quién
revirtió las dos anteriores y por qué?"—, que es la respuesta correcta y arruina
la prueba igual.
