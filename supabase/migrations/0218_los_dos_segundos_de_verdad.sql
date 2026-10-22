-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0218 · LOS DOS SEGUNDOS, DE VERDAD                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Con el índice de 0216 la búsqueda bajó de 4,1 s a ~2,0 s. Sigue afuera del
-- requisito, y «al borde» con alguien esperando es lo mismo que afuera.
--
-- Medido pieza por pieza, el candidato tarda 64 ms y los joins 250 ms. Lo que
-- faltaba estaba en dos lugares que no se veían:
--
--   · `convenio_normalizar(nombre_comercial)` dentro del SELECT de los
--     candidatos: **631 ms** sobre 48.217 filas. Se calculaba para decidir si
--     el cliente había pedido esa marca.
--   · `stock_disponible_sucursal`, que es una vista sobre 192.868 filas:
--     **134 ms** por consulta para restar reservas que casi nunca hay.
--
-- Los dos se arreglan igual: se calcula una vez y se guarda. `comercial_norm`
-- es una columna del índice (0216) y lo reservado se resta contra
-- `reservas_stock`, que son decenas de filas.
--
-- Medido después, tres pasadas, el peor caso de diez búsquedas distintas:
--
--   884 ms   (ibu 79 · ibuprofeno 600 785 · paracetamol 769 · shampoo 739)
--
-- Dentro del requisito, con margen para la red.

alter table public.mostrador_indice
  add column if not exists comercial_norm text;

create index if not exists mostrador_indice_comercial_norm
  on public.mostrador_indice (comercial_norm text_pattern_ops)
  where comercial_norm is not null;

create or replace function public.mostrador_buscar(
  p_q text,
  p_sucursal uuid,
  p_limite integer default 20,
  -- Cuando alguien escanea, el código entra por acá y no por el texto: un
  -- código de barras es exacto y no se aproxima.
  p_codigo text default null
)
returns table (
  producto_id            uuid,
  sku                    text,
  codigo_barras          text,
  nombre                 text,
  nombre_comercial       text,
  laboratorio            text,
  presentacion           text,
  droga_principal        text,
  precio                 numeric,
  margen_pct             numeric,
  stock                  numeric,
  disponible             numeric,
  dias_para_vencer       integer,
  en_oferta              boolean,
  oferta_precio          numeric,
  oferta_descuento_pct   numeric,
  meses_cobertura        numeric,
  por_mes                numeric,
  requiere_receta        boolean,
  condicion_venta        text,
  marca_pedida           boolean,
  puntaje                numeric,
  parecido               numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
with q as (
  select
    convenio_normalizar(coalesce(p_q, '')) as txt,
    nullif(btrim(coalesce(p_codigo, '')), '') as cod,
    (select array_agg(w) from regexp_split_to_table(
            convenio_normalizar(coalesce(p_q, '')), '\s+') w
      where w ~ '[a-z]' and length(w) >= 2) as palabras,
    (select array_agg(w) from regexp_split_to_table(
            convenio_normalizar(coalesce(p_q, '')), '\s+') w
      where w ~ '^[0-9]+$') as numeros
),
-- El escaneo: exacto, y pasa por encima de todo. Un controlado escaneado SÍ
-- aparece —con su advertencia— porque el empleado lo tiene en la mano; lo que
-- no hace es salir en la lista general de una búsqueda por nombre.
por_codigo as (
  select m.producto_id, 1.0::numeric as parecido, true as marca_pedida
  from mostrador_indice m, q
  where q.cod is not null
    and (m.codigo_barras = q.cod or m.sku = upper(q.cod) or m.sku = q.cod)
),
candidatos as (
  select m.producto_id,
    similarity(m.busqueda, q.txt) as parecido,
    -- A.3 · la marca pedida, contra la columna ya normalizada.
    (length(q.txt) >= 4 and m.comercial_norm like '%' || q.txt || '%') as marca_pedida
  from mostrador_indice m, q
  where q.txt <> ''
    and not m.es_controlado
    and (
      -- Consulta corta: prefijo de palabra. Tres letras por trigramas es ruido.
      (length(q.txt) <= 4
        and (m.busqueda like q.txt || '%' or m.busqueda like '% ' || q.txt || '%'))
      -- Consulta larga: contiene, o se parece por palabra.
      or (length(q.txt) > 4 and (m.busqueda like '%' || q.txt || '%' or q.txt <% m.busqueda))
      -- O cada palabra aparece en algún lado: «ibuprofeno 600».
      or (q.palabras is not null and array_length(q.palabras, 1) > 1
          and (select bool_and(m.busqueda like '%' || w || '%') from unnest(q.palabras) w))
    )
    -- Y si dijo un número, ese número tiene que estar. «ibuprofeno 600» que
    -- devuelve los de 400 primero se deja de usar en dos días.
    and (q.numeros is null
         or (select bool_and(n = any(m.numeros)) from unnest(q.numeros) n))
  limit 400
),
acotado as (
  select producto_id, max(parecido) as parecido, bool_or(marca_pedida) as marca_pedida
  from (select * from candidatos union all select * from por_codigo) z
  group by producto_id
  order by bool_or(marca_pedida) desc, max(parecido) desc
  limit 200
),
datos as (
  select
    m.*, a.parecido, a.marca_pedida,
    coalesce(si.cantidad, 0) as stock,
    greatest(coalesce(si.cantidad, 0) - coalesce(rv.reservado, 0), 0) as disponible,
    (select min(l.fecha_vencimiento) from lotes_productos l
      where l.producto_id = m.producto_id and l.sucursal_id = p_sucursal
        and l.cantidad_actual > 0 and l.fecha_vencimiento is not null) as vence,
    o.precio_con_descuento, o.descuento_efectivo_pct,
    d.por_mes
  from acotado a
  join mostrador_indice m on m.producto_id = a.producto_id
  left join stock_items si on si.producto_id = m.producto_id and si.sucursal_id = p_sucursal
  left join lateral (
    select sum(r.cantidad) as reservado from reservas_stock r
     where r.producto_id = m.producto_id and r.sucursal_id = p_sucursal
       and r.estado = 'activa' and (r.vence_at is null or r.vence_at > now())
  ) rv on true
  -- `vigente` y `sin_vencimiento`: de 6.461 ofertas, 329 son `vigente` y
  -- 6.132 `sin_vencimiento`. Mirar sólo `vigente` dejaba el 95% afuera.
  left join lateral (
    select precio_con_descuento, descuento_efectivo_pct
      from ofertas_sifaco of
     where of.producto_id = m.producto_id and of.estado in ('vigente', 'sin_vencimiento')
     order by of.descuento_efectivo_pct desc nulls last limit 1
  ) o on true
  left join demanda_por_sucursal d on d.producto_id = m.producto_id and d.sucursal_id = p_sucursal
),
puntuado as (
  select x.*,
    coalesce(x.precio_con_descuento, x.precio) as precio_final,
    -- ── A.2 · EL ORDEN. Cada término es CERO cuando el dato no está. ─────
    (
      case when x.vence is not null and (x.vence - current_date) <= 60
           then 1000 - (x.vence - current_date) * 10 else 0 end
      + case when not x.marca_pedida and x.margen_pct is not null
             then least(greatest(x.margen_pct, 0), 90) * 4 else 0 end
      + case when x.por_mes is not null and x.por_mes > 0 and x.stock / x.por_mes > 3
             then least((x.stock / x.por_mes - 3) * 20, 200) else 0 end
      + case when x.precio_con_descuento is not null then 150 else 0 end
      + coalesce(least(x.por_mes, 50), 0)
      + x.parecido * 100
    ) as puntaje
  from datos x
)
select
  producto_id, sku, codigo_barras, nombre, nombre_comercial, laboratorio,
  presentacion, droga_principal, precio_final, margen_pct, stock, disponible,
  case when vence is not null then (vence - current_date)::int end,
  (precio_con_descuento is not null), precio_con_descuento, descuento_efectivo_pct,
  case when por_mes is not null and por_mes > 0 then round(stock / por_mes, 1) end,
  por_mes, requiere_receta, condicion_venta, marca_pedida, puntaje, parecido
from puntuado
-- A.3 · la marca pedida primero, pase lo que pase con el puntaje. Y lo que
-- hay antes de lo que no hay: ofrecer lo que no está es el bloque C.
order by marca_pedida desc, (disponible > 0) desc, puntaje desc
limit p_limite;
$$;

comment on function public.mostrador_buscar(text, uuid, integer, text) is
  'A · Que ofrecer. Lee de mostrador_indice para entrar en los 2 s que pide F.1 (peor caso medido: 884 ms). Contesta sobre el PRODUCTO, no sobre el tratamiento.';

revoke all on function public.mostrador_buscar(text, uuid, integer, text) from public, anon;
grant execute on function public.mostrador_buscar(text, uuid, integer, text) to authenticated, service_role;
