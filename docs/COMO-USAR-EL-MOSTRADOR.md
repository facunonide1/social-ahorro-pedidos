# El mostrador

*v1.2 · la cuarta superficie del sistema*

Después del escritorio, el depósito y la calle. La única donde hay un cliente
esperando del otro lado.

**Se entra por `/mostrador`.** No tiene menú ni dock a propósito: cada cosa que
no es lo que estás buscando es una cosa que se toca por error.

---

## La línea que no se cruza

**El sistema ayuda con el producto. No ayuda con el tratamiento.**

| Te contesta | No te contesta |
|---|---|
| Qué monodroga tiene | Qué darle para el dolor de garganta |
| Qué otro tiene la misma | Si conviene un antibiótico |
| Qué presentaciones hay y a qué precio | Cuánto tomar y por cuántos días |
| Si requiere receta | Si se puede combinar con otra cosa |
| Si hay stock y dónde | Si es apto para alguien embarazada |
| Qué cubre cada convenio | Cualquier cosa sobre una persona |

No es prudencia excesiva: es quién puede hacer qué. Y el motivo práctico pesa
más que el legal — **si le preguntás a una pantalla qué darle a alguien, el
responsable dejó de ser una persona.**

Si escribís algo que suena a pregunta clínica, el sistema no busca: te dice que
eso lo contesta el farmacéutico y te lleva a llamarlo.

**Nunca se guarda** nombre de paciente, diagnóstico, síntoma ni el motivo por
el que alguien compra algo. No es una intención: ninguna tabla tiene esos
campos, y `npm run verificar:limite` se lo pregunta al catálogo de Postgres en
cada build. Si alguien agrega `motivo_consulta`, el build se rompe.

---

## Buscar

Escribí, escaneá o dictá. Tolera cómo se escribe de verdad:

| Escribís | Pasa |
|---|---|
| `ibu` | busca por prefijo — tres letras por similitud serían ruido |
| `ibuprofeno 600` | la palabra matchea la droga **y el 600 tiene que estar** |
| `ibupirac` | busca por parecido en el nombre comercial |
| el código de barras | exacto, y pasa por encima de todo |

Un `ibuprofeno 600` que te devuelve los de 400 primero se deja de usar en dos
días. Por eso el número no se aproxima.

## El orden, y por qué

Cada producto dice **por qué está ahí**:

> **Ibuprofeno 400 genérico · $4.120**
> vence en 38 días · deja más · hay 14

Lo que decide, en orden: vence pronto → deja más margen (sólo si no pidieron
marca) → sobra (más de 3 meses de cobertura) → está en oferta → se vende más.

Tres cosas pasan por encima:

- **Si pediste una marca, esa marca va primero.** El sistema sugiere, no
  reemplaza lo que el cliente pidió.
- **Si requiere receta, lo dice antes de ofrecerlo.**
- **Los controlados no salen en la lista.** Se buscan escaneando el envase.

### Y lo que no se puede ordenar

Hoy **nadie cargó una sola fecha de vencimiento**, así que el criterio que
debería ir primero no está ordenando nada. La pantalla lo dice abajo de la
lista en vez de mostrar un orden que parece completo.

Y **23.319 de 48.217 productos no tienen costo cargado**: a esos no se los
puede ordenar por margen, y la fila lo dice. No se asume que el margen sea
cero: cero sería una afirmación.

## Lo mismo, de otra forma

Tocá un producto y vas a ver qué otro tiene la misma composición, con **la
diferencia de precio al lado** — que es la objeción que te va a hacer el
cliente.

Es información del catálogo, no una recomendación. Si uno se puede cambiar por
el otro en un caso concreto, eso lo dice el farmacéutico.

**La mitad del catálogo no tiene monodroga cargada** (23.880 de 48.217). En
esos, la pantalla dice que no se pueden buscar equivalentes y por qué, en vez
de mostrar una lista vacía — una lista vacía se lee como «no hay
equivalentes», que es otra cosa y es falso.

## No hay acá

El caso que más venta recupera. **5.594 productos tienen stock en más de una
sucursal**: casi siempre está a doce cuadras.

Tocá «buscar en las otras sucursales» y elegí una de las salidas:

| Salida | Qué hace |
|---|---|
| Lo traigo para mañana | pide la transferencia y reserva la unidad allá |
| Te lo mando a tu casa | arma el pedido con reparto propio |
| Pasá por la otra sucursal | arma el pedido para retirar, con la dirección |

**«Lo tengo a la tarde» no aparece**: necesita reparto entre sucursales
configurado y hoy no hay ninguna zona ni ningún viaje cargado. Ofrecerlo sería
prometerle algo a alguien que está esperando.

Todo queda **reservado 48 horas** en la sucursal que lo tiene, para que no lo
vendan mientras viaja.

> **El stock es una foto diaria de SIFACO.** La pantalla te dice de cuándo es
> la de cada sucursal: «según el stock de hoy a las 9». Si el otro local lo
> vendió hoy, puede no estar. La reserva lo aparta en NORA, no en SIFACO.

Y la venta se hace en SIFACO. Esto deja el pedido y la reserva; no factura.

## Me lo pidieron y no había

**Es lo más importante que podés hacer en esta pantalla.**

Cuando alguien pide algo que no hay, esa información se pierde: nadie la anota.
Un toque y queda.

El texto ya viene escrito de la búsqueda. Lo único que falta es qué pasó:

- **Se fue** — ésta es la venta que se perdió de verdad
- **Se llevó otra cosa** — la venta no se perdió, cambió de producto
- **Le ofrecí traerlo** — quedó un pedido

Los tres son distintos y hasta ahora los tres se veían igual.

**Si lo que pidieron no está en el catálogo, se guarda el texto tal cual.** Eso
es lo que más sirve: dice qué marcas no se trabajan y la gente igual pide.

Dónde se ve después: Compras → Radar de demanda. Y lo que se pide tres veces o
más en 90 días entra al plan de compra marcado como **demanda real**, no como
pronóstico.

## El cliente

Por DNI, teléfono o nombre. Alta con nombre y teléfono: el resto se completa
después — pedirle todo a alguien que está esperando es la razón por la que
nadie carga clientes.

Qué se ve: qué compró la última vez, si tiene un pedido esperando retiro, y si
**por la frecuencia de sus compras** le toca volver. Eso último sale de que
vuelva cada 30 días, no de lo que compra: qué toma es una conclusión médica y
el sistema no la hace ni la guarda.

## Sin internet

**Una farmacia que se queda sin internet sigue vendiendo.**

Con internet, tocá «Guardar para usar sin conexión» una vez. Guarda en el
dispositivo los productos con stock de tu sucursal.

Lo que **sí** funciona sin internet:

- buscar en lo guardado
- registrar faltantes (quedan en cola y se mandan solos cuando vuelve)

Lo que **no**:

- el stock de las otras sucursales
- la cobertura de los convenios
- tomar un pedido o reservar
- el vencimiento, el margen y cuánto se vende (eso no se guarda en el
  dispositivo, así que el orden es más pobre y la pantalla lo dice)

**La pantalla siempre dice de cuándo es lo guardado.** Un catálogo sin fecha
miente por omisión: el precio de hace tres días se lee igual que el de ahora.

## Lo que ves y lo que no

Si atendés el mostrador, **no ves costos ni márgenes**: ves el orden, no el
porqué en plata. Donde un dueño lee «deja 52%», vos leés «deja más».

No es que la pantalla lo esconda: el número **no viaja** al dispositivo, y el
costo vive en otra tabla que tu usuario no puede leer.
