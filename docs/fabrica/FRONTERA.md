# La frontera entre la Fábrica y Social Ahorro

La Fábrica convive con NORA HQ en el mismo repo, pero es otro producto. Este
documento define exactamente dónde termina uno y empieza el otro, para que la
prueba se pueda repetir en cada sesión sin volver a razonarla.

## Las cuatro reglas

1. **La fábrica LEE Social Ahorro, nunca escribe.** Ninguna migración `fab_*`
   altera, renombra ni agrega columnas a una tabla existente.
2. **Namespace propio y exclusivo:** tablas `fab_*`, rutas bajo `/fabrica`,
   código en `lib/fabrica/`, `components/fabrica/` y `app/fabrica/`.
3. **Dependencia en un solo sentido, con UNA excepción declarada** (ver abajo).
4. **Prueba de extracción:** en cualquier momento se tiene que poder llevar la
   carpeta de la fábrica y las tablas `fab_*` a un repo propio sin romper
   Social Ahorro.

---

## Lo que cambió en v0.62

Hasta v0.61 nada de Social Ahorro importaba de la fábrica. Para que una
declaración **gobierne**, algún punto tiene que consultarla — eso es inevitable.
Lo que sí se puede elegir es que sea **uno solo**.

### El punto de contacto

```
lib/os/definicion.ts     ← el ÚNICO archivo de Social Ahorro que importa la fábrica
```

Un import, dos usos, una función:

```ts
tituloDePantalla(pool, ruta, enCodigo) → string
```

`enCodigo` es a la vez el argumento y el fallback. La función **nunca lanza** y
**nunca devuelve vacío**: si la fábrica no responde, si el flag está apagado, si
el manifiesto no existe o no valida, devuelve el texto que ya estaba en el
código. En el peor caso la pantalla se ve exactamente como antes.

### Los consumidores

Cuatro archivos de Social Ahorro modificados en total, y ninguno de ellos
importa la fábrica: importan `lib/os/definicion.ts`.

| Archivo | Qué cambió |
| --- | --- |
| `lib/os/definicion.ts` | **nuevo** — el punto de contacto |
| `app/(admin)/admin/finanzas/documentos/page.tsx` | un literal pasó a ser una llamada, con el mismo literal de fallback |
| `app/(admin)/admin/finanzas/documentos/lote/page.tsx` | ídem |
| `app/(admin)/admin/finanzas/documentos/revision/[id]/page.tsx` | ídem |
| 12 pantallas de `app/(admin)/admin/operaciones/` **(v0.63)** | ídem — Stock cableado |

Más la excepción de navegación de v0.58 (`components/os/os-shell.tsx`), que sigue
siendo un `<Link>`.

**16 archivos en total, y ninguno importa la fábrica.** Todos le hablan a
`lib/os/definicion.ts`. El patrón es siempre el mismo:

```tsx
const titulo = await tituloDePantalla('stock', '/admin/operaciones/alertas', 'Alertas de stock')
//                                                                            ^ el literal de antes,
//                                                                              que también es el fallback
```

**Verificado el 2026-08-08 con 24 pantallas cableadas:** sacando la fábrica y
dejando `definicion.ts` en `return enCodigo`, Social Ahorro compila con 0
errores de tipos y build verde.

### Cómo se saca la fábrica

Se borra el import de `lib/os/definicion.ts` y su cuerpo pasa a
`return enCodigo`. Las tres pantallas siguen compilando porque nunca importaron
la fábrica: le hablan al punto de contacto.

**Probado el 2026-08-08, no supuesto:** se movieron `lib/fabrica/`,
`app/fabrica/`, `components/fabrica/` y `scripts/fabrica-*` fuera del repo, se
reemplazó el cuerpo de `definicion.ts` por el fallback, y Social Ahorro compiló
con **0 errores de tipos y build verde**. Ver el bloque de verificación abajo.

## Qué se lleva la fábrica si se muda

```
app/fabrica/                    9 archivos
components/fabrica/             2 archivos
lib/fabrica/                    5 archivos
docs/fabrica/                   este documento y el censo
supabase/migrations/            0093, 0094, 0095
tablas                          fab_* (7)
funciones                       fab_es_dueno, fab_puede_ver, fab_puede_armar,
                                fab_tablas_existentes, fab_tablas_con_prefijo
```

## La superficie de dependencia (fábrica → núcleo)

Estos son **todos** los imports que la fábrica hace hacia afuera. Si crece esta
lista, crece el costo de mudarse; si aparece una flecha en el otro sentido, la
frontera se rompió.

| Import | Qué aporta | Al extraer |
| --- | --- | --- |
| `@/lib/supabase/server` | cliente de sesión y cliente de administración | se copia, son 30 líneas genéricas |
| `@/lib/utils` (`cn`) | merge de clases | se copia |
| `@/components/ui/badge` | primitiva visual | se copia (shadcn) |
| `@/components/shared/page-header` | cabecera estándar | se copia |
| `@/lib/os/subapps` | registry de navegación de NORA HQ | **no se copia**: es el objeto verificado |
| `@/lib/ai/tool-meta` | catálogo de herramientas del asistente | **no se copia**: es el objeto verificado |

Las dos últimas son el caso interesante: la fábrica las importa **porque son el
sujeto de la verificación**, no porque las necesite para funcionar. En un repo
propio, la fábrica leería el registry del proyecto que administra por otro
medio (API, archivo declarado, esquema). El comparador es lo único acoplado al
proyecto observado, y está aislado en un solo archivo:
`lib/fabrica/comparador.ts`.

## La excepción autorizada

Un único archivo de Social Ahorro está modificado:
`components/os/os-shell.tsx` — un `<Link href="/fabrica">` en el header. Es la
excepción permitida de navegación. Cero cambios de lógica.

La Fábrica **no** está en `lib/os/subapps.ts`: no es una sub-app de NORA OS. No
tiene dock, ni ⌘K, ni Mission Control, y su propia puerta
(`fab_usuarios_proyecto`) decide quién entra — ser `super_admin` del admin no
alcanza.

## Cómo se verifica

```bash
# 1 · ¿Alguien afuera importa de la fábrica?
grep -rn "@/lib/fabrica" app components lib --include="*.ts" --include="*.tsx" \
  | grep -v "^lib/fabrica/\|^components/fabrica/\|^app/fabrica/"
#    Debe devolver EXACTAMENTE una línea: lib/os/definicion.ts
#    Dos o más = la frontera se rompió. Parar y reportar.

# 2 · ¿Alguna migración fab_* altera algo ajeno?
grep -inE "alter table|drop table|drop column|rename" supabase/migrations/00*_fabrica*.sql \
  | grep -viE "fab_"
#    Debe devolver vacío

# 3 · PRUEBA DE EXTRACCIÓN, de verdad
mv lib/fabrica app/fabrica components/fabrica /tmp/       # sacar la fábrica
mv scripts/fabrica-*.ts /tmp/                             # y sus scripts de consola
# reemplazar el cuerpo de lib/os/definicion.ts por `return enCodigo`
rm -rf .next && npx tsc --noEmit && npm run build          # tiene que dar verde
mv /tmp/{lib,app,components}-fabrica ...                   # restaurar
```

El paso 3 hay que correrlo, no razonarlo. Los tipos generados en `.next/`
guardan las rutas del build anterior: sin borrar `.next` da 26 errores falsos
sobre rutas de la fábrica que ya no existen.

Los `scripts/fabrica-*.ts` también se van, y hasta v0.66 el procedimiento no los
nombraba. No es un detalle de prolijidad: `npm run build` los tipa igual que al
resto, así que dejarlos rompe el build con veinte errores que parecen de la
frontera y no lo son. Son archivos de la fábrica: se extraen con ella.
