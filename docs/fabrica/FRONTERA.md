# La frontera entre la Fábrica y Social Ahorro

La Fábrica convive con NORA HQ en el mismo repo, pero es otro producto. Este
documento define exactamente dónde termina uno y empieza el otro, para que la
prueba se pueda repetir en cada sesión sin volver a razonarla.

## Las cuatro reglas

1. **La fábrica LEE Social Ahorro, nunca escribe.** Ninguna migración `fab_*`
   altera, renombra ni agrega columnas a una tabla existente.
2. **Namespace propio y exclusivo:** tablas `fab_*`, rutas bajo `/fabrica`,
   código en `lib/fabrica/`, `components/fabrica/` y `app/fabrica/`.
3. **Dependencia en UN SOLO SENTIDO.** La fábrica puede importar del núcleo de
   Social Ahorro. Nada de Social Ahorro importa de la fábrica.
4. **Prueba de extracción:** en cualquier momento se tiene que poder llevar la
   carpeta de la fábrica y las tablas `fab_*` a un repo propio sin tocar una
   línea de Social Ahorro.

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
# 1 · Qué archivos de Social Ahorro se tocaron
git diff --diff-filter=MDR --name-status <base> HEAD
#    Debe devolver como mucho components/os/os-shell.tsx

# 2 · ¿Alguien afuera importa de la fábrica?
grep -rn "fabrica" app components lib --include="*.ts" --include="*.tsx" \
  | grep -v "^lib/fabrica/\|^components/fabrica/\|^app/fabrica/" \
  | grep -iE "import|from '@/"
#    Debe devolver vacío

# 3 · ¿Alguna migración fab_* altera algo ajeno?
grep -inE "alter table|drop table|drop column|rename" supabase/migrations/00*_fabrica*.sql \
  | grep -viE "fab_"
#    Debe devolver vacío
```

Si el punto 2 devuelve algo, la frontera se rompió: parar y reportar.
