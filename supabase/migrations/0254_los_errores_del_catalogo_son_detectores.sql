-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0254 · LOS ERRORES DEL CATALOGO SON DETECTORES                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Los seis errores del bloque B son exactamente lo que la v1.3 construyo: un
-- hecho, con plata al lado, ordenado por plata, con tope para que no sea
-- ruido, con descarte que le ensena al detector y con marcador.
--
-- Entonces no se arma una segunda lista de problemas: **entran al catalogo de
-- `detectores`**, en una familia nueva. Dos listas de errores del catalogo
-- serian dos lugares donde mirar lo mismo, y la que este desactualizada va a
-- ser siempre la que menos se mira.
--
-- Lo que ya existia y se reusa: `canal_estado` (la vista de la v0.9x, con
-- precio_mostrador, precio_calculado, costo, stock_sifaco y problema),
-- `canal_problemas` y `canal_candidatos`.
--
-- ── LA EXCEPCION QUE HAY QUE DECLARAR ───────────────────────────────────────
--
-- D.1 de la v1.3 dice que lo que no se puede costear no va arriba. Y B.1 dice
-- que los productos con receta publicados van **arriba de todo, en rojo**.
--
-- Los dos no pueden ser ciertos a la vez: el riesgo de una sancion no se puede
-- costear, asi que un hallazgo legal no tiene plata y quedaria en la lista
-- larga.
--
-- Gana B.1, y por un motivo que no es la gravedad sino la regla de oro 9: lo
-- legal-farmaceutico es intocable y esta **por encima del presupuesto de
-- interrupcion**. Un producto con receta publicado no puede esperar a que
-- haya lugar en la lista de hoy.
--
-- La excepcion vive en una columna, no en un `if` escondido en el publicador:
-- `siempre_arriba`. Y es la unica que la usa.
--
-- ── Y UNA CORRECCION A LA v1.3 ──────────────────────────────────────────────
--
-- La v1.3 dijo que `alter type ... add value` no se puede ejecutar desde un
-- bloque. Es falso: funciona cuando el tipo no se creo en la misma
-- transaccion, y `canal` se agrego a `detector_familia` asi. El motivo de
-- fondo para usar `detector text` sigue siendo bueno —una historia minima y
-- un tope son filas de una tabla, no valores de un enum— pero la razon
-- tecnica que se escribio entonces estaba mal.

alter table public.detectores
  add column if not exists siempre_arriba boolean not null default false;

comment on column public.detectores.siempre_arriba is
  'La excepcion al tope de D.3 y a la plata de D.1. Solo para terreno legal: '
  'el riesgo de una sancion no se puede costear y la regla de oro 9 esta por '
  'encima del presupuesto de interrupcion. Hoy la usa un solo detector.';

alter table public.canales_venta
  add column if not exists responsable_user_id uuid references auth.users(id) on delete set null;

comment on column public.canales_venta.responsable_user_id is
  'D.6 · Quien responde por este canal. Los errores del bloque B le generan '
  'tarea a el; si esta en null, la tarea queda sin responsable y el error lo '
  'dice en vez de perderse.';

do $$ begin
  alter type detector_familia add value if not exists 'canal';
exception when others then null; end $$;
