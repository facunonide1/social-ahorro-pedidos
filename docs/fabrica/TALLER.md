# El Taller

La superficie donde se decide **qué se aplica solo, qué necesita firma y qué
está prohibido**. Es lo que hace que la auto-modificación sea segura en vez de
peligrosa: sin carriles, todo cambio pesa lo mismo, y lo que pesa todo igual
termina aprobándose todo igual.

`/fabrica/[proyecto]/taller`

---

## Los carriles

Ver [CARRILES.md](./CARRILES.md) para la tabla completa. En resumen:

| | | |
| --- | --- | --- |
| 🟢 | se aplica solo | Reversible, sin efecto sobre plata, permisos ni cumplimiento |
| 🟡 | con firma | Espera decisión humana |
| 🔴 | prohibido | El Taller no lo propone. El intento queda registrado |

**El carril se deriva, no se elige.** Y hoy **todo pide firma**: el verde se
habilita por tipo de campo, a mano, cuando ya se vieron suficientes cambios de
ese tipo como para saber que son inocuos.

---

## Las cinco cosas

Toda propuesta declara:

1. **Qué cambia** — el diff en castellano
2. **Por qué** — con evidencia, no opinión
3. **A quién afecta** — pantallas y personas, contadas contra los permisos reales
4. **Carril** — derivado, con el motivo
5. **Costo de revertir** — visible **antes** de aprobar

La quinta no es negociable: aprobar rápido sólo es seguro si se sabe qué cuesta
deshacer.

---

## De dónde salen las propuestas

Dos orígenes, los dos manuales:

- un humano desde el editor de una declaración
- el verificador, cuando encuentra una diferencia entre declaración y código

**No hay propuestas sacadas del uso.** No por falta de ganas: no hay datos de
uso, y una propuesta inventada sin datos es una opinión con formato de dato.

---

## Higiene

| Regla | Por qué |
| --- | --- |
| Rechazada dos veces → no vuelve | Insistir con lo que ya se dijo que no es la forma más rápida de que dejen de leerse |
| Una pendiente idéntica bloquea la duplicada | |
| Rechazar exige decir por qué | Sin eso hay que adivinar en la siguiente |
| Aprobar no lo exige | El motivo ya viene en la propuesta; pedirlo dos veces convierte la firma en un trámite |
| Expiran a los 14 días | Se archivan, no se borran |

### La alerta que importa

Si sube la tasa de ignoradas, **el motor hace ruido** y se dice con esas
palabras. Una cola que nadie mira no es una cola, es un depósito.

---

## Verificación

No depende de que alguien navegue. Antes de esta sesión, Stock tenía 12
pantallas cableadas y 0 verificadas porque nadie las había abierto.

- **Botón por pool**: verificar ahora
- **Chequeo perezoso**: corre al abrir el Taller si hace más de un día

**No hay cron.** El plan del entorno no da crons finos, y ya se aprendió acá que
simular que algo corre solo es peor que decir cuándo corre.

### Lo que la verificación provocada NO puede hacer

Saber qué título tiene la pantalla **en su código**: eso vive en un literal
dentro del componente y sólo se conoce al renderizar.

| Pregunta | La contesta |
| --- | --- |
| ¿La declaración resuelve a algo usable? | verificación provocada |
| ¿El lector la está entregando? | verificación provocada (si el pool gobierna) |
| ¿Coincide con lo que muestra la pantalla? | **sólo la navegación** |

Ninguna reemplaza a la otra.

---

## Intentos prohibidos

Lo que cae en carril rojo entra como rechazado de entrada, con el límite que lo
bloqueó escrito, y se muestra en su propia sección. **La constitución visible
vale más que la silenciosa.**

---

## Dos bugs que encontró probarlo

**La constitución bloqueaba apretar el control.** La primera versión mandaba a
rojo cualquier cambio sobre un elemento constitucional, incluido *bajar* la
participación de una acción protegida. Bajarla es apretar el control, no
aflojarlo: prohibirlo sería impedir que un negocio sea más prudente que la
pieza.

**Proponer un título borraba los otros.** El diff del paso 3 mostró tres cambios
en una propuesta que tocaba uno: `titulos` es un objeto y el spread superficial
lo reemplazaba entero. De no haber mirado ese diff, aprobar la propuesta habría
devuelto dos pantallas al default sin que nadie lo pidiera. Es exactamente el
motivo por el que el diff se mira antes de aplicar.
