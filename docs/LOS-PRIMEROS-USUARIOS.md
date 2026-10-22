# Los primeros usuarios

*v0.99 · bloque F*

## Lo que hay que cargar, y quién lo carga

Los datos los carga Facundo desde el sistema. Acá quedan las pantallas listas
y verificadas, y una lista de qué falta: **/admin/primer-dia**.

Esa pantalla no es un tutorial. Es un estado, con dos reglas:

1. **Ningún paso se marca solo por existir la pantalla.** Se marca cuando hay
   datos. «La pantalla de usuarios está hecha» no es «hay usuarios».
2. **Lo que no se puede contar va en «no se pudo saber»**, ni hecho ni
   pendiente. Una lista de pendientes que se pone verde sola es peor que no
   tener lista.

Los seis pasos: el maestro de SIFACO, las personas con rol y sucursal, los
farmacéuticos con matrícula, el tope de efectivo de cada sucursal, las
primeras 200 fechas de vencimiento, y los agentes con sus números calculados.
Los dos primeros frenan al resto.

## El tope de efectivo no se podía cargar

La pantalla de control de caja decía, desde la v0.97: *«El tope lo define el
dueño en Configuración»*. En Configuración no estaba el campo. La acción que
guarda la configuración de caja guardaba el fondo fijo y nada más, así que
`tope_efectivo` quedaba en null para siempre y NORA no avisaba nunca.

Ahora está, al lado del fondo fijo. Y vacío sigue siendo distinto de cero:
vacío es «no avisa», cero sería «no puede quedar ni un peso en la caja».

## Los diez pasos del día, probados de verdad

`npm run probar:dia-encargado` crea un encargado de prueba, entra con **su
sesión** y recorre el día entero. El usuario y todo lo que escribe se borran al
terminar, pase lo que pase.

| | Paso | Qué se verifica |
|---|---|---|
| 1 | Entra | Lee su rol y su sucursal |
| 2 | El catálogo | Ve los 48.217, no los primeros mil |
| 3 | Reparte tareas | Crea y asigna |
| 4 | Lo que necesita su firma | Sólo las decisiones de su sucursal |
| 5 | Lo que falta | Los quiebres de su sucursal y los números de los agentes |
| 6 | Pide una transferencia | Y **no** puede pedir una entre dos sucursales ajenas |
| 7 | Llegó mercadería | Queda registrada y la ve |
| 8 | Carga un vencimiento desde el celular | Cae en **su** sucursal y el contador lo cuenta |
| 9 | Cierra la caja | Sella el conteo a ciegas; con diferencia queda observada |
| 10 | Sube el maestro | Ve las importaciones |

Más lo que **no** tiene que ver: los arqueos de otra sucursal, lo de tesorería.

Con RLS, «no puede» no da error: devuelve cero filas. Por eso cada vez que se
prueba que algo no se ve, se compara contra lo que ve `service_role`. Sin esa
comparación, una tabla vacía se lee igual que una tabla protegida.

### Los dos caminos

Algunos pasos se escriben desde el navegador con la sesión del usuario: ahí
manda la RLS. Otros pasan por una ruta de API que verifica el rol y después
escribe con el cliente de servicio: ahí manda la lista de roles de la ruta y la
RLS no interviene.

La prueba sigue el camino que sigue la aplicación, cada uno con su guardia.
Probar RLS donde la app usa una ruta daría un «MAL» falso; probar la ruta donde
la app usa la sesión dejaría pasar un agujero de verdad.

## Lo que encontró, y lo que queda anotado

**Arreglado:** un encargado no podía pedir una transferencia por RLS. Las
políticas de escritura de `transferencias_sucursal` listan el rol `sucursal` y
no `encargado_sucursal`, que son dos roles distintos. La aplicación andaba
igual porque la ruta usa el cliente de servicio — pero el manual del encargado
dice que lo que sobra en otra sucursal «no se compra, se pide», y por RLS no
podía pedirlo.

La migración 0207 no lo agrega a la lista que ya estaba: esa lista no mira la
sucursal, y agregarlo ahí le habría dado alcance de cadena sin que se notara.
Le da una política propia, limitada a transferencias donde su sucursal es una
de las dos puntas.

**Anotado, no tocado:** hay **17 tablas** donde el rol `sucursal` puede
escribir y `encargado_sucursal` no está nombrado:

```
avisos_faltante · canales · devolucion_items · devoluciones_proveedor
empleado_ausencias · empleado_turnos · empleados · gastos_operativos
lotes_productos · movimientos_caja · movimientos_stock · recepcion_items
recepciones_mercaderia · stock_sucursal · transferencia_items
transferencias_sucursal · caja_turnos
```

Hoy ninguna rompe la aplicación: todas las pantallas que un encargado usa pasan
por rutas que verifican el rol y escriben con el cliente de servicio, y esas
rutas sí lo incluyen. Pero significa que **la guardia real de esos pasos es la
ruta, no la base**. Una ruta con cliente de servicio que es la única puerta es
una puerta que se rompe sola el día que alguien escriba una consulta directa.

No se tocaron las 17 porque no todas corresponden —un encargado no debería
escribir `gastos_operativos` ni `canales`— y decidir cuáles sí es una decisión
del dueño, no una corrección técnica. Queda escrito para que se decida, no para
que se olvide.
