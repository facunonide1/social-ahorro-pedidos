# Obras sociales

*v1.1 · el hueco más grande que tenía el sistema*

## Qué resuelve

Entre el 50% y el 70% de lo que despacha la farmacia pasa por una obra social.
SIFACO factura. Lo que viene después —presentar, que te debiten, reclamar— no
lo cubría nadie.

Y ahí se pierde plata sin que nadie la cuente: **una farmacia puede estar
perdiendo del 3% al 8% de su facturación en débitos que nunca reclamó.** No
porque nadie quiera reclamarlos: porque llegan en un papel, se miran una vez y
se archivan.

## El límite que no se cruza

**NORA no registra al paciente, ni al médico, ni el contenido de la receta.**

Lo que registra es el **comprobante**: número, fecha, obra social, sucursal e
importe. Más qué productos se despacharon y a qué precio.

Una presentación es un hecho administrativo. Qué le recetaron a quién es
terreno clínico y no entra al sistema, ni de paso.

No es una intención: ninguna tabla tiene esas columnas, y
`npm run verificar:limite-convenios` se lo pregunta al catálogo de Postgres en
cada build. Si alguien agrega `nombre_paciente`, el build se rompe.

La pantalla de carga por foto lo dice en voz alta, porque es donde más tienta:
la liquidación en papel suele traer el apellido del afiliado en cada renglón.
Se le pide al modelo que no lo devuelva, y lo que devuelva igual se descarta
antes de llegar a la base.

## Tu día

**1 · El padrón, una vez.** Cada obra social con lo que decide la plata: qué
porcentaje cubre, hasta cuándo se puede presentar, a cuántos días paga, si
pide troquel físico o digital, cada cuánto se presenta, y **qué exige**.

Lo que exige es lo más importante y es lo que nadie escribe: son las reglas que
después explican los débitos. Un débito con la regla al lado deja de ser una
sorpresa y pasa a ser el incumplimiento de algo que estaba escrito.

Lo que no sabés se deja vacío. Un plazo en cero diría «hay que presentar el
mismo día»; vacío dice «no lo sé», y el sistema lo va a pedir cuando lo
necesite.

**2 · Armar la presentación.** Obra social, **tu sucursal** y el período. Se
le meten los comprobantes y el total lo calcula la base: no se tipea, así no
puede no cuadrar.

Lo que no entra queda en la lista de abajo **con el motivo**, y no desaparece.
Si desapareciera, nadie podría preguntar por qué no se presentó.

**3 · Mandar los troqueles.** Desde el celular, en Obras sociales → Troqueles.
Número de remito, cantidad y la foto.

Después, **el acuse**. Esto es lo más importante de todo el sector: un débito
por troquel faltante contra un remito con acuse se reclama con una foto; sin
acuse, no hay con qué discutir.

**El acuse se consigue al momento.** Cuando llega el débito —semanas después—
el acuse ya está o ya no está. Es la única tarea del sector donde llegar tarde
no se arregla.

**4 · Enviar.** Cuando se marca como enviada, se genera la tarea de control al
encargado de esa sucursal (regla de oro 5). La tarea dice qué controlar: que
los troqueles se hayan mandado y que el acuse esté guardado.

**5 · Cuando llega la liquidación.** Obras sociales → Liquidaciones. Por
archivo o por foto.

El formato no se conoce, así que el importador no asume ninguno: busca las
columnas por nombre, **te muestra cuál usó para cada cosa** y cuáles quedaron
sin usar, y recién después deja confirmar. Si no encuentra la columna de
importe, no guarda nada.

**6 · Reclamar lo que se puede.** Obras sociales → Débitos. Ordenado por plata.

## Cómo se decide si un débito se puede reclamar

Tres preguntas, en ese orden:

1. **Qué dice el motivo.** Un afiliado dado de baja no se reclama y no hay nada
   que mirar. Un producto fuera de vademécum tampoco: no estaba cubierto.
2. **Si el motivo dice «depende», de qué depende.** Para troquel faltante es el
   acuse del remito: si está, se reclama; si no está, no.
3. **Si todavía está a tiempo.** El plazo corre desde la liquidación.

Y hay un cuarto resultado que no es ni sí ni no: **«no se puede saber»**.
Cuando el motivo que mandó la obra social no se entendió, o cuando falta el
plazo, el sistema dice que no sabe y de qué depende.

Eso es deliberado. Un «no se puede reclamar» diría *lo miré y no se puede*, y
esa es justamente la plata que se pierde sin que nadie la mire.

## Los diez motivos

| Motivo | ¿Se reclama? | De qué depende |
|---|---|---|
| Troquel faltante | depende | el acuse del remito |
| Receta mal cargada | depende | que el comprobante coincida con el papel |
| Duplicada | depende | que el número no esté en otra presentación |
| Firma ilegible o faltante | depende | que exista el original firmado |
| Sin autorización previa | depende | que la autorización exista y tenga número |
| Fuera de vademécum | **no** | no estaba cubierto |
| Fuera de plazo | **no** | la pérdida más evitable de todas |
| Afiliado dado de baja | **no** | se verifica antes de despachar |
| Supera el tope | **no** | se carga el tope en el padrón |
| Otro | depende | que una persona lea el texto original |

Son un catálogo y no texto libre por una razón concreta: lo único que sirve es
poder sumarlos por motivo. «Troquel faltante» escrito de nueve formas son nueve
motivos de uno, y la pregunta que importa —cuál es el motivo que más se lleva—
no se puede contestar.

## Lo que el sistema no hace

**No acusa a nadie.** Muestra que una sucursal tiene tres veces el promedio en
el mismo motivo, y dice que eso puede ser un problema de proceso o puede ser
que despache tres veces más obra social. El número dice dónde mirar, no quién
tuvo la culpa.

**No borra un débito.** No hay forma de hacerlo: no existe la política en la
base y el build lo verifica. Un débito es lo que la obra social te sacó;
taparlo es exactamente lo que este sector viene a impedir. Se cierran como
perdidos, con el motivo.

**No le inventa un motivo a lo que no entiende.** Va a «Otro» con el texto
original. Un débito mal clasificado como «fuera de vademécum» queda marcado
como no reclamable para siempre y nadie lo vuelve a mirar.

**No se integra con ningún portal.** El portal es un link para abrir a mano.

## El agente Convenio

Nace en «sugiere» con el marcador vacío, como todos. Alcance de cadena: el
convenio es uno aunque la presentación se arme por sucursal.

Propone seis cosas: qué presentación vence y no está armada, qué débitos
reclamables vencen pronto, qué motivo creció contra el trimestre anterior, qué
sucursal debita más en el mismo motivo, y qué obra social empezó a debitar más.

**Su techo es «prepara» y no sube nunca.** No es prudencia genérica: una
presentación mal armada se manda y no se vuelve —la obra social la debita
entera y el período se pierde— y un reclamo mandado sin respaldo quema el
reclamo, porque no se puede reclamar dos veces lo mismo.

En «prepara» arma la presentación y la deja en borrador. La revisa y la manda
una persona.

## Qué falta para empezar

Dos cosas, las dos de Facundo:

1. **La lista de obras sociales con las que trabajan**, con el plazo de
   presentación de cada una y qué exige. Sin eso NORA no puede avisar antes de
   un cierre ni decir si un débito se puede reclamar.
2. **Un archivo de débitos de un trimestre.** Cualquier formato. El importador
   va a mostrar qué entendió antes de guardar nada, y lo que no entienda va a
   quedar a la vista en vez de desaparecer.
