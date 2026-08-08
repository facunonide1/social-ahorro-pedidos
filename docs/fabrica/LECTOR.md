# El lector

La pieza que hace que la declaración **gobierne** en vez de sólo describir.

Hasta v0.61 la fábrica miraba a Social Ahorro y nadie le preguntaba nada. Desde
v0.62 un sector puede leer su definición de la base. Todo entra detrás de un
interruptor apagado.

**El criterio:** con el flag apagado, todo funciona exactamente igual que antes
de que la fábrica existiera. Con el flag prendido en un pool, ese pool funciona
exactamente igual pero leyendo su definición de la base. Si algo se ve distinto,
está mal.

---

## Qué lee, y qué no

| Lee hoy | No lee todavía |
| --- | --- |
| Títulos de pantalla | Permisos |
| | Acciones ejecutables |
| | Automatizaciones |
| | Cualquier cosa que decida qué puede hacer una persona |

Si el lector se equivoca en un título, se ve raro. Si se equivoca en un permiso,
alguien ve lo que no debe. Lo segundo espera al **escritor**, que es lo que
permitiría revertir un cambio sin un deploy.

### Lo que no se gobierna aunque esté declarado

Una pantalla con `titulo_dinamico: true` se titula con los datos de su fila —la
ficha de un documento muestra su tipo y su número—. Reemplazar eso por una
etiqueta fija sería quitarle información a la pantalla, no configurarla.

---

## Los tres estados

| Estado | Qué hace |
| --- | --- |
| `apagado` | El sector lee del código. Es exactamente lo de hoy. |
| `sombra` | Lee del código, **y** la fábrica calcula en paralelo qué habría devuelto y registra las diferencias. Sin afectar nada. |
| `prendido` | El sector lee de la declaración. |

**`sombra` es lo que hace que esto sea seguro.** Se puede dejar corriendo días en
producción, con tráfico real, y recién prender cuando quedó demostrado que la
declaración habría devuelto lo mismo.

Un pool con diferencias **no se prende**: primero se corrige la declaración.

---

## Orden de resolución

```
1 · ¿el flag del pool está en `prendido`?   si no → el sector usa su código
2 · ¿hay manifiesto publicado?               si no → código + fallback registrado
3 · ¿valida contra el esquema vigente?       si no → código + fallback registrado
4 · devolver la declaración
```

Cualquier falla devuelve `null`, que significa **"usá lo tuyo"**. El sector nunca
se rompe por esto: en el peor caso hace lo que hacía antes.

| Qué pasa | Resultado |
| --- | --- |
| La fábrica no responde | Código. Ni siquiera se registra: registrar necesita la misma base que falló |
| El manifiesto no existe o no está publicado | Código + fallback con el motivo |
| El manifiesto no valida contra 1.2.0 | Código + fallback con los errores |
| La declaración no incluye esa pantalla | Código |
| El título declarado está vacío | Código |

**La alerta va al portal de la fábrica, no al usuario de Social Ahorro.** Un
empleado no tiene por qué enterarse de que existe una fábrica.

### Los fallbacks se registran

Un fallback que nadie ve es un problema que nadie arregla. El panel muestra
cuántos hubo y por qué. **Si el número no es cero, hay algo mal**: el sector no
se rompió —para eso está el fallback— pero la declaración no se está aplicando.

Se registra una vez por día por pool/aspecto/detalle: una pantalla se abre muchas
veces y sería siempre el mismo problema repetido.

---

## Cómo se prende y se apaga

Desde `/fabrica/[proyecto]/lector`, con rol de armador o dueño. **Nunca por
variable de entorno**: el momento en que hace falta apagarlo es el peor momento
para necesitar un deploy.

El cambio tiene efecto **en la request siguiente**. El memo del lector dura lo
que dura una request, no lo que dura el proceso, justamente para eso.

Cada cambio queda registrado: quién, cuándo, de qué estado a cuál.

### El interruptor de pánico

Un solo botón que devuelve **todos** los pools a `apagado`. Existe como una sola
llamada porque el momento en que hace falta es exactamente el momento en que no
se puede depender de apagar diez interruptores uno por uno.

Pide escribir `APAGAR TODO` para confirmar. No se pierde nada: las declaraciones
quedan donde están, sólo dejan de aplicarse.

---

## Probarlo sin navegador

```bash
npx tsx scripts/fabrica-lector-probar.ts documentos
```

Recorre los tres estados, verifica que los títulos sean idénticos en los tres,
prueba la reversión en caliente y deja el pool como lo encontró. Sale con código
1 si algo no da.

Existe porque un lector que sólo se puede probar dentro de Next es un lector que
nadie prueba antes de prenderlo.

---

## Estado al cerrar v0.62

| Pool | Estado |
| --- | --- |
| Motor de documentos | **prendido** — 3 pantallas gobernadas, 0 diferencias, 0 fallbacks |
| Stock | **sombra** — sin pantallas cableadas todavía, así que no acumula nada |
| Los otros 8 | apagado |
