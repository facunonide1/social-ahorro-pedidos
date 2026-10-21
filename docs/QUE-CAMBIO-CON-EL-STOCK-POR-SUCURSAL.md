# Qué cambió con el stock por sucursal

Los números de compras cambiaron todos. No se reemplazan en silencio: acá está
qué decía cada uno, qué dice ahora y por qué.

**La causa es una sola**: el maestro de agosto traía el stock de Guzmán y se
leía como el de la cadena. Las tres pruebas están en
`docs/EL-MAESTRO-DE-AGOSTO-ERA-GUZMAN.md`.

---

## El encabezado del plan de compra

| | v0.94 (28/08) | v0.96 (14/10) | |
|---|---:|---:|---|
| Stock al costo | $266.374.988 | $460.256.766 | +73% |
| Consumo mensual | $205.787.414 | $208.940.383 | +1,5% |
| **Cobertura** | **1,29 meses** | **2,20 meses** | +71% |
| Sobrestock | $205,8 M · 4.169 ítems | $213,9 M · 4.046 ítems | |

El consumo casi no se movió —es el mismo negocio— y el stock subió 73%. Eso
dice que lo que cambió no fue el negocio: fue qué estábamos midiendo.

**La cobertura real de la cadena es 2,2 meses, no 1,29.** Con droguerías que
entregan al día siguiente, 2,2 meses de cobertura es bastante más plata quieta
de lo que se creía.

## Lo urgente

| | v0.94 | v0.96 |
|---|---:|---:|
| YA | — | 2.212 ítems · $46,8 M |
| Esta semana | — | 190 ítems · $16,5 M |
| **Urgente (las dos)** | **3.392 ítems · $100,8 M** | **2.402 ítems · $63,3 M** |

**990 ítems menos y $37,6 M menos.** No porque llegó mercadería: porque antes se
comparaba el stock de un local contra las ventas de cuatro, y eso exagera el
faltante de todo lo que está en las otras tres.

Los $100,8 M no eran un error de cálculo. La fórmula era correcta; el dato que
entraba decía otra cosa de la que parecía decir.

## Y lo que aparece por primera vez

| | |
|---|---:|
| Transferir en vez de comprar | **1.687 productos · $33,5 M** |
| …de los cuales el origen no lo vende | 1.565 de 2.909 pares |
| Quiebres reales por local | 2.765 |
| Stock quieto en el lugar equivocado | 621 productos · $9,1 M |
| Dormido acá pero vivo en la cadena | 2.969 productos · $57,1 M |
| Dormido en todas | 3.461 productos · $83,1 M |

De los $63,3 M urgentes, **$33,5 M se resuelven moviendo mercadería**. Eso no se
podía ni preguntar antes.

Y el dormido se partió en dos. De los $140 M que parecían stock muerto, $57,1 M
están dormidos **en un local** y la cadena los vende: ésos no se liquidan, se
transfieren. Liquidar y transferir son decisiones opuestas y hasta hoy el
sistema no podía distinguirlas.

## Lo mal repartido, en plata

| sucursal | stock | % stock | % consumo | cobertura | de más |
|---|---:|---:|---:|---:|---:|
| Guzmán | $264,7 M | 57,4% | **73,3%** | **1,40 mes** | **−$73,4 M** |
| Figueiras | $155,9 M | 33,8% | 21,7% | 2,79 mes | +$55,8 M |
| Tesei | $23,2 M | 5,0% | 2,9% | 3,15 mes | +$10,0 M |
| Arabia | $17,4 M | 3,8% | 2,1% | 3,16 mes | +$7,5 M |

Guzmán vende tres cuartas partes de la cadena y tiene poco más de la mitad del
stock. Le faltan **$73,4 M** y las otras tres tienen **$73,3 M de más** entre
ellas: casi exactamente la misma plata, del otro lado.

Nota sobre el 68%: en **unidades** Guzmán tiene el 68%; en **plata**, el 57%. Lo
que Guzmán tiene es más barato por unidad. Las dos medidas son ciertas y la que
decide una compra es la de plata.

## Los canales

4.606 productos publicados tienen fila de stock:

- **1.026 no tienen stock en ningún local.** Son los que venían contándose como
  «publicado sin stock» y siguen estando mal.
- **1.132 tienen todo su stock en un solo local.** Éstos son nuevos: según cuál
  sucursal despache, están disponibles o agotados. Hoy no se puede saber cuáles
  porque `sucursal_despacho_id` está sin declarar en los dos canales, y no se
  adivina (regla 8).
- 2.448 tienen stock en dos o más: ésos aguantan cualquier despacho.

Y los que no deberían estar publicados pasaron de 17 a **20**: el archivo nuevo
declara con receta a tres productos que teníamos como venta libre y estaban a la
vista del público. Uno es MEDEX INHALADOR.

## Qué sigue sin poder calcularse

1. **El punto de pedido por sucursal.** El archivo no lo trae. Por eso un
   quiebre es «vende acá y no tiene acá» y no «está por debajo del mínimo».
2. **Si una transferencia conviene en plata.** Mover tiene un costo —flete,
   tiempo, riesgo— que no está en ninguna parte.
3. **A qué precio vende cada droguería.** Sigue abierto desde v0.94: se arma con
   las facturas fotografiadas.
4. **La serie larga por sucursal.** El archivo trae cuatro meses y uno viene
   cortado. Los doce meses siguen siendo sólo de la cadena.
5. **Qué pasó entre archivo y archivo.** Esto es una foto del 14 de octubre.
