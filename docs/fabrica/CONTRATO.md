# El contrato de parámetros — CERRADO

Estado al cierre de v0.73. Este documento dice qué quedó terminado y qué sigue.

---

## La cifra

> **Presentación en 2 de 10 pools (17 pantallas) · 4 parámetros de 48**

Se calcula, no se escribe, y no se redondea para arriba. Vive en
`/fabrica/[slug]/estado`.

## El recuento, 48 = 17 + 31

| | Cuántos | Qué significa |
|---|---|---|
| **Hechos permanentes** | 12 | La pieza lo hace siempre que esté instalada |
| **Hechos condicionados** | 5 | Depende de cómo está armado ESTE negocio; no viaja con la pieza |
| **Con brecha** | 3 | Declarados, el código no los implementa |
| **Sensibles** | 18 | El lector no los devuelve: uno mal leído afloja un control o mueve plata |
| **No gobernables** | 6 | Declarados con su contrato; la variable de entorno sigue mandando |
| **Gobernados** | 4 | Y los cuatro con cableado completo y verificado |

El denominador creció de 38 a 48 mientras el numerador iba de 3 a 4. Así tiene
que ser: declarar lo que existía sin declarar empeora la proporción y mejora el
dato.

---

## Qué quedó cerrado

- **Todos clasificados.** Ningún parámetro sin decir si es hecho, configuración
  o brecha. El validador rechaza uno que no lo diga.
- **Todos con consumo declarado o excluido con motivo.** El relevamiento reporta
  tres estados y el tercero —ni declarado ni excluido— está en **0**.
- **Ninguna fuente doble sin resolver.** 0 conflictos.
- **Ningún consumidor sin verificar.** 27 verificados fuerte, 1 por ancla
  (declarado débil), 0 inexistentes, 0 ambiguos.
- **Consumidor y símbolo separados**, y el validador no deja confundirlos.
- **Verificación acotada a la función**, no al archivo.

## Qué queda abierto, y es poco

- **6 no gobernables**: declarados y sin cablear. Cablearlos es trabajo medido —
  cada uno tiene sus lugares de consumo con consumidor y símbolo.
- **1 ancla débil**: el badge del dock es una arrow anónima y no tiene nombre
  que anclar. Se cuenta aparte de las verificaciones fuertes.
- **3 con brecha**: el código no los implementa. No es deuda del contrato: es
  trabajo de construcción.
- **El formato no expresa relaciones entre parámetros.** `alerta_suba_pct` y
  `alerta_exceso_pct` son dos filtros de la misma alerta y el manifiesto no
  tiene cómo decirlo. Se avisa en el impacto, que es un parche, no el campo.

---

## Lo que sigue ya no es contrato: es alcance

En orden, y sin estimaciones de tiempo.

### 1 · Aspectos que el lector no gobierna

Hoy gobierna presentación, navegación y parámetros. No gobierna:

- **permisos** — quién ve qué. Choca con los intocables de Configuración.
- **acciones y autonomía del asistente** — un título mal se ve raro; una acción
  mal hace algo que nadie firmó.
- **automatizaciones**.
- **parámetros sensibles** — 18 de 31, la mayoría del contrato.

Es el que más superficie abre: mientras los sensibles no se lean, la fábrica
gobierna la mitad chica de lo que declara.

### 2 · Pools apagados

8 de 10. Cada uno prendido suma sus pantallas y sus parámetros a lo que gobierna
de verdad. Requiere verificación en sombra antes de prender, que ya está
construida.

### 3 · Sectores sin declarar

6 del censo. Son software que existe y la fábrica no conoce.

### 4 · Moldes y dirección visual

No hay ninguno. Es lo que permitiría que la fábrica *genere* en vez de sólo
gobernar — y es la única de las cuatro que cambia qué clase de herramienta es
esto.

---

## Las siete preguntas de control

Viven en [INDICADORES.md](INDICADORES.md). Se contestan por escrito antes de que
un indicador nuevo entre, y la séptima salió de que una verificación midiera
algo cierto pero al lado.

**Y la regla que las ordena a todas:** cada categoría nueva del formato nace con
errores de clasificación. La pregunta 6 encontró 5 de 17 hechos mal clasificados
en la categoría creada una sesión antes. Se aplica apenas se crea algo, no seis
sesiones después.
