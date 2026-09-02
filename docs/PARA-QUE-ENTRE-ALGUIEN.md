# Para que entre alguien del equipo

Escrito el 2026-09-02 (v0.92). Es lo que falta para que una persona que no sea
Facundo abra NORA el lunes y le sirva.

---

## Lo que se probó, y anduvo

Se creó un usuario de prueba con rol **encargado de sucursal** y una sucursal
asignada, se entró **con su sesión** —no con la llave de servicio, que ve todo y
no prueba nada— y se recorrió el circuito completo. Después se borró.

| | |
|---|---|
| Entra con usuario y contraseña | ✓ |
| Lee su propio rol y su sucursal | ✓ |
| Ve las 5 sucursales | ✓ |
| Ve el catálogo entero: 46.009 productos | ✓ |
| Busca en el catálogo desde su sesión | ✓ |
| Ve los 21 pedidos y las 48 tareas | ✓ |
| Crea una tarea | ✓ |
| La toma | ✓ |
| La completa con foto y queda **esperando verificación** (regla de oro 5) | ✓ |
| Aparece en la cola de `/admin/verificaciones` | ✓ |

Se puede volver a correr cuando haga falta:
`npx tsx --env-file=.env.local scripts/prueba-encargado.ts`

---

## Lo que apareció, y se arregló en esta sesión

**El rol `encargado_sucursal` estaba prácticamente tapiado.** En la matriz de
permisos es idéntico a `sucursal` —el código lo dice: `sucursal: matriz({...})
// = encargado_sucursal`— pero las pantallas listaban sólo `'sucursal'` en su
guarda. Un encargado nuevo se topaba con «no tenés permiso» en **Operaciones
entera**, Conteos, Stock de un producto, Recepciones, Faltantes, Mi equipo,
Comunicados y Gastos de sucursal.

Corregido en 14 pantallas: donde decía `'sucursal'` ahora dice
`'sucursal', 'encargado_sucursal'`.

**Las 9 pantallas «sin guarda» no eran un agujero.** Cuatro usan
`gateDocumentos`, dos son redirecciones y las otras tres también pasan por su
propio control. Se revisaron una por una.

---

## 1 · Carga de datos (nadie decide nada, sólo hay que cargarlo)

| Qué | Dónde | Sin esto |
|---|---|---|
| Las zonas de reparto, con su sucursal | `/admin/pedidos/envios` | No se puede cobrar un envío ni armar un viaje |
| Tarifa, km y minutos de cada zona | ídem | No se puede saber si una zona pierde plata |
| Costo de la moto por km y por hora | ídem | ídem |
| Sucursal de despacho de cada canal | `/admin/canales` | Todo pedido de la web entra sin sucursal |
| Los papeles de habilitación | `/admin/compliance/papeles` | Compliance no puede decir si está en orden |

## 2 · Decisiones de Facundo (nadie más las puede tomar)

1. **Quiénes entran y con qué rol.** Hoy hay 4 usuarios, los 4 `super_admin` y
   ninguno con sucursal. Los nombres y los roles los da Facundo; el sistema ya
   está probado para recibirlos.
2. **Qué código de SIFACO es cada sucursal** — GUZ, FIG, ARA y TES contra SA-01
   a SA-04. Nadie lo declaró y adivinarlo por el orden sería inventarlo.
3. **Cuántos productos declara SIFACO en total.** Si dice 46.035, el maestro
   está completo; si dice más, la diferencia es lo que falta
   (`docs/EL-MAESTRO-ESTA-INCOMPLETO.md`).
4. **Qué se hace con los 82 productos marcados `BORRAR`** en la nota de SIFACO.
5. **Los 2.648 productos con receta que tienen stock y código de barras.**
   Hay que cruzarlos contra lo que se subió a mano a los canales:
   `/admin/canales/regla-9`. NORA no puede verificar un archivo que no generó.

## 3 · Sesión de código (lo que falta construir)

| Qué | Por qué no está |
|---|---|
| Stock por sucursal | Falta el archivo `tabla3e` completo. Con él se destraban también la reserva por local y la sugerencia de despacho |
| API de PedidosYa y Mercado Libre | Decisión explícita: el modelo está listo, la integración no se hizo |
| WhatsApp conectado | Es la app común, sin API. Hoy el mensaje se copia y se pega |
| Ruta optimizada con mapa | Las direcciones de entrega son texto libre: falta geocodificarlas |
| Cotización automática de correo | No hay cuenta de transporte configurada |

---

## Lo primero, si hay que elegir una sola cosa

**Crear los usuarios con su rol y su sucursal.** Todo lo demás se puede cargar
después y el sistema lo dice cuando falta. Sin usuarios, nadie entra.
