# Las 68 columnas del maestro, una por una

Comparación de `data/sifaco/pla_3d_24.csv` (46.035 filas, 68 columnas) contra
`sifaco_maestro_staging` y contra `productos_catalogo`. Hecha el 2026-09-02.

**Ninguna columna se perdió leyendo el archivo**: las 68 llegan a staging (51 como
columna propia, 7 dentro de `extra`, y las 13 de ventas mensuales como `vta_este`
+ `vta_meses`). El corte estaba entre staging y el catálogo.

## Lo que se recuperó en esta sesión

| Columna | Filas con valor | Adónde fue |
|---|---:|---|
| `ult_vta` | 14.551 | `productos_catalogo.ult_venta` |
| `ult_cpa` | 15.112 | `productos_catalogo.ult_compra` |
| `fec_alta` | 46.003 | `productos_catalogo.fecha_alta` |
| `fec_actu` | 42.837 | `productos_catalogo.precio_actualizado` |
| `registro` | 24.448 | `registro_sanitario` |
| `categoria` | 6.639 | `clasificacion_abc` |
| `seccion` | 5.823 | `seccion` |
| `ubic` | 947 | `ubicacion` |
| `unidades` | 24.436 | `unidades_por_envase` |
| `tip_uni` | 24.165 | `tipo_unidad` |
| `prod_nom` | 46.035 | `nombre_comercial` |
| `varios` | 3.307 | `nota_sifaco` |
| `familia` | 24.325 | `vademecum_data.familia` |
| `forma` | 24.172 | `vademecum_data.forma` |
| `potencia` | 38.018 | `vademecum_data.potencia` |
| `uni_pot` | 24.174 | `vademecum_data.uni_pot` |

### Las cuatro fechas son el hallazgo grande

Estaban en **cero filas de staging** cuando el archivo trae hasta 46.003. No es
que no se copiaran al catálogo: **no llegaron ni a staging**. Es el mismo bug que
en v0.88 se comió la fecha de fin de 329 ofertas — `fechaSifaco` no reconocía el
formato ISO y `2026-08-24` devolvía null. Se arregló para las ofertas; el maestro
nunca se volvió a importar, así que su mitad del bug siguió ahí cuatro versiones.

`ult_venta` es el dato con el que se decide qué producto está muerto. NORA no lo
tenía.

## Ya estaban copiadas (16, desde v0.83)

`codigo`→`sku` · `descrip`→`nombre` · `descripx`→`descripcion` ·
`nom_depto`→`categoria` · `nom_grupo`→`subcategoria` · `nom_lab`→`laboratorio` ·
`prod_pres`→`presentacion` · `droga`→`droga_principal` · `psi`→ los cuatro campos
de control · `prec_vta`→`precio_sugerido` · `costo`→`precio_costo_promedio` ·
`margen`→`margen_pct` · `rubro`→`rubro` · `barras`,`barras2`→`producto_codigos_barras` ·
`stock`,`pun_ped`,`st_min`→`producto_stock_sifaco` · `este`+12 meses→`producto_ventas_mensuales`

Y en v0.91: `vl`→`condicion_venta`/`canal_abierto`, `publico`→`precio_sugerido`.

## No corresponde copiarlas

| Columna | Por qué |
|---|---|
| `num_lab`, `num_depto`, `num_grupo` | Son los ids internos de SIFACO. El nombre es lo que se usa y ya está. |
| `iva_prod`, `iva_depto`, `utilidad` | Fiscales. `margen_pct` ya está; nada en NORA calcula sobre estas. |
| `pami` (46.035), `pre_pami` (8.201), `ioma` (46.035) | Coberturas sociales. El dato es real y **no lo usa nada de NORA todavía**. Queda en staging, declarado. |
| `dmv_30` (4.245) | Demanda media 30 días de SIFACO. NORA calcula la suya desde las ventas mensuales. |
| `gcom` (46.035) | Grupo comercial de SIFACO, sin uso en NORA. |
| `od` (17), `aux1` (2) | Prácticamente vacías. |
| `categ_3`, `segme_3`, `ssegm_3`, `marca_3`, `unine_3`, `ppedir` | **Vacías en el archivo: 0 filas con valor.** No hay nada que copiar. |

## Dos cosas que quedaron a la vista

**`subcategoria` guarda un solo valor.** Se cargó de `nom_grupo`, que vale
«Farmacia Normal» en las 46.035 filas. La columna existe, está llena, y no
distingue nada. No se tocó: cambiarla es una decisión de cómo se quiere agrupar
el catálogo, no un arreglo.

**82 productos tienen `BORRAR` escrito en `varios`.** Ahora están en
`nota_sifaco` y se pueden buscar. Alguien los marcó para dar de baja en SIFACO.
