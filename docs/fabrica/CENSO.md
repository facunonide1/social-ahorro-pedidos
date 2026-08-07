# Censo de sectores — NORA HQ (proyecto 1)

Foto del sistema al 2026-08-07, tomada antes de declarar el primer pool.
Fuente viva: tabla `fab_censo_sectores`.

**Esto es observación, no diagnóstico.** Describe lo que hay. No se corrigió
nada de lo que se encontró.

---

## El número que importa

| Clasificación | Sectores | Pantallas | Qué significa |
| --- | ---: | ---: | --- |
| **genérico** | 9 | 95 | Sirve a cualquier rubro con configuración |
| **núcleo** | 4 | 29 | Infraestructura, no se desinstala |
| **a medida** | 2 | 13 | Solo de este proyecto |
| **vertical** | 1 | 6 | Específico de farmacia |
| **incompleto** | 1 | 0 | No está listo para declararse |

**Un solo sector es vertical de farmacia.** El 87% de las pantallas
(124 de 143) es genérico o núcleo. Eso es lo que hace viable la fábrica: lo
construido para Social Ahorro sirve casi entero para otro rubro.

Sobre los totales: el repo tiene **155 archivos `page.tsx`** (141 bajo `/admin`,
14 fuera). El censo atribuye **143** a un sector. La diferencia son pantallas
transversales que no pertenecen a ninguno (portada de `/admin`, login, logout,
home pública, bootstrap, brief público de ofertas) más un solapamiento
deliberado: las 5 pantallas del motor de documentos viven dentro de
`/admin/finanzas/` y por eso se cuentan dos veces — una como núcleo y otra
dentro de las 19 de Finanzas.

---

## Los 17 sectores

### Núcleo — no se desinstalan

| Sector | Ruta | Entidades | Pantallas | Datos |
| --- | --- | ---: | ---: | --- |
| **Configuración** | `/admin/configuracion` | 5 | 9 | 4 usuarios, 4 sucursales, 120 productos |
| **Inteligencia (NORA)** | `/admin/nora` | 10 | 7 | 6 configs, 3 avisos, 4 conversaciones |
| **Centro de Datos** | `/admin/centro-datos` | 9 | 8 | 5 perfiles, 3 exports |
| **Motor de documentos** | `/admin/finanzas/documentos` | 6 | 5 | 1 extracción real |

El motor de documentos se censa aparte de Finanzas a propósito: lo usan Compras
y Finanzas por igual, no pertenece a ninguno. Es infraestructura.

### Genéricos — sirven a cualquier rubro

| Sector | Ruta | Entidades | Pantallas | Estado de los datos |
| --- | --- | ---: | ---: | --- |
| **Stock** | `/admin/operaciones` | 18 | 19 | 480 items, 960 snapshots, 108 irregularidades |
| **Compras** | `/admin/compras` | 18 | 17 | 10 faltantes; órdenes y conciliaciones vacías |
| **Finanzas** | `/admin/finanzas` | 18 | 19 | 48 arqueos; cuentas por pagar vacías |
| **Personas** | `/admin/rrhh` | 14 | 7 | **1 empleado** contra 4 usuarios |
| **Clientes** | `/admin/clientes` | 13 | 10 | 150 clientes; CRM y puntos sin uso |
| **Ofertas** | `/admin/ofertas` | 10 | 11 | 9 ofertas, 21 items, 3 exports a SIFACO |
| **Comunicación** | `/admin/comunicacion` | 9 | 4 | **todo vacío** |
| **Tareas** | `/admin/tareas` | 8 | 5 | 12 tareas, 27 tipos |
| **Proveedores** | `/admin/proveedores` | 4 | 3 | **tabla vacía** |

### Vertical — específico de farmacia

| Sector | Ruta | Por qué es vertical |
| --- | --- | --- |
| **Compliance** | `/admin/compliance` | Controlados, ANMAT, libro recetario, director técnico. No se reutiliza fuera del rubro. |

### A medida — solo de este proyecto

| Sector | Ruta | Qué es |
| --- | --- | --- |
| **Pedidos** | `/dashboard` | E-commerce propio con WooCommerce, reparto y repartidor |
| **Cuponera** | `/cuenta` | El producto **original** del repo, anterior a NORA HQ. Convive sin integrarse. |

### Incompleto

| Sector | Estado |
| --- | --- |
| **Decisiones** | Placeholder: `rutaHome` es `'#'`, 0 módulos, 0 acciones. Declarado en el registry pero no existe. |

---

## Moldes de pantalla

Los cinco moldes previstos cubren **93 de 143** pantallas (65%):

| Molde | Pantallas |
| --- | ---: |
| lista maestra | 39 |
| tablero | 21 |
| ficha | 21 |
| wizard | 7 |
| bandeja | 5 |

### Cuatro moldes nuevos que emergen

No estaban previstos y aparecen de forma consistente. Cubren **24** más:

| Molde | Pantallas | Dónde |
| --- | ---: | --- |
| **CHAT** | 10 | Un asistente por sub-app: `/admin/*/asistente` |
| **FORMULARIO/CONFIG** | 9 | Configuración de reglas: segmentos, turnos, tipos de tarea |
| **FEED** | 3 | Avisos y bandeja de entrada: `/admin/nora/feed`, `/operaciones/alertas` |
| **CALENDARIO** | 2 | Vista temporal: calendario de pagos, de ofertas |

**CHAT es el más significativo**: 10 pantallas con la misma estructura, una por
sub-app. Es un molde de pleno derecho, no una excepción — y es exactamente el
molde que hoy no se puede declarar bien, porque el chat promete acciones que
sólo existen escritas a mano en cada sub-app.

### Las 26 que no encajan en ninguno

Quedaron en `otro`. Van a necesitar molde nuevo o rediseño al declararse; éstas
son las identificadas:

```
/admin/centro-datos              /admin/ia
/admin/clientes/duplicados       /admin/ia/resumen
/admin/compliance                /admin/ofertas/panel
/admin/compliance/recalls        /admin/ofertas/propuestas
/admin/compliance/sops           /admin/operaciones
/admin/compras/devoluciones      /admin/operaciones/inventarios
/admin/comunicacion/comunicados  /admin/recepciones
/admin/configuracion/general     /admin/rrhh
/admin/configuracion/triggers-tareas   /admin/sucursales
/admin/finanzas/cheques          /admin/sucursales/performance
/admin/finanzas/conciliacion     /admin/tareas/agenda
/admin/finanzas/documentos/lote  /admin/verificaciones
```

Varias son índices de sección que mezclan tablero con accesos rápidos — un
molde **PORTADA DE SECTOR** probablemente cubra buena parte.

---

## Lo que el censo encontró y no se tocó

1. **Comunicación está construido y nunca se usó.** Nueve tablas, cuatro
   pantallas, cero filas. Cero canales, cero mensajes.
2. **Proveedores está vacío** mientras Compras y Finanzas dependen de él. La
   ficha es rica (cuenta corriente, devoluciones, dossier de conciliaciones) y
   no tiene un solo proveedor.
3. **Personas tiene 1 empleado contra 4 usuarios admin.** El módulo existe pero
   no está poblado; la gamificación (niveles, badges) nunca corrió.
4. **Decisiones es un placeholder** declarado en el registry con ruta `'#'`.
5. **La cuponera legacy convive sin integrarse.** Es el producto original del
   repo: `coupons`, `offers`, `users` — tablas paralelas a las de NORA HQ que
   hacen lo mismo con otro nombre (`offers` vs `ofertas`).
6. **De ~180 tablas, solo 24 tienen datos.** La mayor parte del sistema está
   construida y esperando uso real.

Ninguno de estos puntos se corrigió: el censo observa.
