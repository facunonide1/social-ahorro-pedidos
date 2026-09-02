# Pedidos y envíos · lo que falta cargar o decidir

v0.91-pedidos. Todo lo de acá está construido y funcionando: lo que falta es
**un dato que sólo puede poner una persona**. Mientras falte, la pantalla dice
qué falta en vez de mostrar un cero.

## 1. De qué sucursal despacha cada canal

`canales_venta.sucursal_despacho_id` está en `null` para los dos canales (Woo y
Mercado Libre). Mientras siga así, cada pedido que entra por el webhook queda sin
sucursal y aparece en el tablero pidiendo que alguien la elija.

**No se puede deducir del stock**: el stock de NORA es el total de las cuatro
sucursales, sin apertura. Elegir «la que tiene» sería inventar un dato.

Se carga en `/admin/canales`.

## 2. Las zonas de reparto

`zonas_reparto` está **vacía**: cero zonas. Sin zonas no se puede cobrar un envío
por distancia, ni comparar lo cobrado contra lo que cuesta, ni armar un viaje.

Cada zona necesita: nombre, **sucursal de la que sale**, barrios, tarifa, km
estimados y minutos estimados.

Se cargan en `/admin/pedidos/envios`.

## 3. El costo de la moto

`envios_config.costo_por_km` y `costo_por_hora`, por sucursal. Sin esos dos
números **no se puede decir si una zona pierde plata**, y la pantalla lo dice así
en vez de mostrar «0 zonas pierden plata», que es una afirmación distinta.

También ahí: envío gratis desde, monto mínimo y hora de corte.

## 4. Qué código de SIFACO es cada sucursal

`sucursales.codigo_sifaco` sigue en `null` en las cuatro. En NORA son SA-01 a
SA-04; en SIFACO son GUZ, FIG, ARA y TES. **Nadie declaró cuál es cuál**, y
adivinarlo por el orden sería inventarlo.

Hasta que se declare, el stock por sucursal no se puede leer aunque llegue el
archivo.

## 5. El archivo `tabla3e` completo

Es lo que destraba tres cosas de una vez:

- el stock abierto por sucursal;
- que la reserva pese sobre el local que despacha y no sobre el total;
- que NORA pueda **sugerir** de qué sucursal conviene que salga un pedido.

Hoy `tabla3e.csv` tiene 296 filas y vino filtrado por laboratorio.

## 6. Cuántos productos declara SIFACO en total

Abierto desde la sesión anterior. El maestro importado tiene 46.035 filas y hay
**164 códigos probados** que existen en SIFACO y no están en él
(`docs/EL-MAESTRO-ESTA-INCOMPLETO.md`). Si SIFACO declara 46.035 productos, el
archivo está completo y el problema es otro. Si declara más, la diferencia es el
agujero.

## 7. El plazo de la reserva

Está en 48 horas en el código y se puede cambiar sin tocar código por el contrato
de parámetros: `pedidos.horas_reserva`.

---

## Lo que NO se hizo, y por qué

| | Por qué |
|---|---|
| API de PedidosYa | Pedido explícitamente. El modelo está listo y el canal se carga a mano. |
| API de Mercado Libre / Mercado Envíos | Ídem. La forma de entrega está declarada y no se puede operar. |
| Integración de WhatsApp | Es la app común del negocio, sin API. El mensaje se prepara y una persona lo copia. |
| Ruta optimizada con mapa | Las direcciones de entrega son texto libre: falta geocodificarlas. Y los repartidores conocen la zona. |
| Cotización automática de correo | No hay cuenta de transporte configurada. Lo que sí hay: el peso y las medidas del bulto, y dónde registrar lo que el transporte terminó cobrando. |
| Deducir la sucursal de salida | El stock no está abierto por local. Sería inventarlo. |
| Ajustar stock o precios | Regla de oro 1: SIFACO manda. Cerrar una reserva no escribe en SIFACO. |
