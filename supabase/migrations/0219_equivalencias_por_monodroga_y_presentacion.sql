-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0219 · EQUIVALENCIAS                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── POR QUÉ ESTO NO CRUZA LA LÍNEA ──────────────────────────────────────────
--
-- **Es información de catálogo, no una recomendación.** Decir que dos
-- productos tienen la misma composición no es indicar un tratamiento: sale del
-- campo `droga_principal` del maestro de SIFACO, que es un dato del producto.
--
-- Lo que esto NO dice, y no va a decir: si uno se puede cambiar por el otro en
-- un caso concreto. Eso depende de la persona y lo contesta el farmacéutico.
--
-- ── LA DECISIÓN QUE IMPORTA: QUÉ CUENTA COMO MISMA MONODROGA ────────────────
--
-- `droga_principal` viene como una cadena compuesta: «ibuprofeno»,
-- «ibuprofeno+cafeina», «ibuprofeno+clorzoxazona». Son TRES composiciones
-- distintas.
--
-- Se exige la cadena COMPLETA igual. «ibuprofeno+cafeina» no es equivalente a
-- «ibuprofeno», y tratarlos como equivalentes sería lo más parecido a indicar
-- un tratamiento que puede hacer este sistema.
--
-- ── Y LA CONCENTRACIÓN ──────────────────────────────────────────────────────
--
-- No es una columna: vive adentro de `presentacion` («400 mg cáps.x 20») o del
-- nombre. Se extrae con una expresión regular al armar el índice y se guarda
-- en `mostrador_indice.concentracion`. Se pudo extraer en 25.143 productos.
--
-- Cuando no se pudo, el equivalente igual se muestra pero **marcado**: la
-- pantalla dice que la concentración no se pudo leer. No se asume que coincide.
--
-- ── Y EL GENÉRICO ───────────────────────────────────────────────────────────
--
-- No hay campo que diga «este es genérico». Lo que hay es un heurístico:
-- un genérico lleva el nombre de la droga en el nombre comercial. Son 2.627
-- productos. **La pantalla lo dice así**, no lo presenta como dato del maestro.

create or replace function public.mostrador_equivalencias(
  p_producto uuid,
  p_sucursal uuid,
  p_limite integer default 12
)
returns table (
  producto_id        uuid,
  sku                text,
  nombre             text,
  nombre_comercial   text,
  laboratorio        text,
  presentacion       text,
  concentracion      text,
  precio             numeric,
  -- B.4 · la diferencia de precio contra el que se estaba mirando. Es la
  -- objeción más común del mostrador y va al lado, no en otra pantalla.
  diferencia         numeric,
  diferencia_pct     numeric,
  stock              numeric,
  disponible         numeric,
  requiere_receta    boolean,
  en_oferta          boolean,
  relacion           text,
  -- Null cuando no se pudo leer la concentración de uno de los dos.
  misma_concentracion boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
with base as (
  select * from mostrador_indice where producto_id = p_producto
),
candidatos as (
  -- B.1 · misma monodroga. La cadena completa igual.
  select m.*, 'misma_composicion'::text as relacion
  from mostrador_indice m, base b
  where b.droga_principal is not null
    and m.droga_principal = b.droga_principal
    and m.producto_id <> b.producto_id
    and not m.es_controlado
  union
  -- B.2 · otras presentaciones del mismo producto: x10, x20, x30.
  select m.*, 'otra_presentacion'::text
  from mostrador_indice m, base b
  where b.comercial_norm is not null and b.comercial_norm <> ''
    and m.comercial_norm = b.comercial_norm
    and m.producto_id <> b.producto_id
    and not m.es_controlado
),
marcado as (
  select c.*,
    (c.comercial_norm is not null and c.droga_principal is not null
     and c.comercial_norm like '%' || convenio_normalizar(split_part(c.droga_principal, '+', 1)) || '%')
     as parece_generico
  from candidatos c
),
con_datos as (
  select
    m.producto_id, m.sku, m.nombre, m.nombre_comercial, m.laboratorio,
    m.presentacion, m.concentracion, m.requiere_receta,
    coalesce(o.precio_con_descuento, m.precio) as precio,
    (o.precio_con_descuento is not null) as en_oferta,
    coalesce(si.cantidad, 0) as stock,
    greatest(coalesce(si.cantidad, 0) - coalesce(rv.reservado, 0), 0) as disponible,
    case
      when m.relacion = 'otra_presentacion' then 'otra_presentacion'
      when m.parece_generico and not coalesce(bg.parece_generico, false) then 'generico'
      when not m.parece_generico and coalesce(bg.parece_generico, false) then 'de_marca'
      else 'misma_composicion'
    end as relacion,
    case
      when m.concentracion is null or b.concentracion is null then null
      else convenio_normalizar(m.concentracion) = convenio_normalizar(b.concentracion)
    end as misma_concentracion,
    coalesce(bo.precio_con_descuento, b.precio) as precio_base
  from marcado m
  cross join base b
  left join lateral (
    select (b.comercial_norm is not null and b.droga_principal is not null
            and b.comercial_norm like '%' || convenio_normalizar(split_part(b.droga_principal, '+', 1)) || '%')
            as parece_generico
  ) bg on true
  left join stock_items si on si.producto_id = m.producto_id and si.sucursal_id = p_sucursal
  left join lateral (
    select sum(r.cantidad) as reservado from reservas_stock r
     where r.producto_id = m.producto_id and r.sucursal_id = p_sucursal
       and r.estado = 'activa' and (r.vence_at is null or r.vence_at > now())
  ) rv on true
  left join lateral (
    select precio_con_descuento from ofertas_sifaco of
     where of.producto_id = m.producto_id and of.estado in ('vigente', 'sin_vencimiento')
     order by of.descuento_efectivo_pct desc nulls last limit 1
  ) o on true
  left join lateral (
    select precio_con_descuento from ofertas_sifaco of
     where of.producto_id = b.producto_id and of.estado in ('vigente', 'sin_vencimiento')
     order by of.descuento_efectivo_pct desc nulls last limit 1
  ) bo on true
)
select
  producto_id, sku, nombre, nombre_comercial, laboratorio, presentacion,
  concentracion, precio,
  case when precio is not null and precio_base is not null
       then round(precio - precio_base, 2) end,
  case when precio is not null and precio_base is not null and precio_base > 0
       then round((precio - precio_base) / precio_base * 100, 1) end,
  stock, disponible, requiere_receta, en_oferta, relacion, misma_concentracion
from con_datos
order by
  -- Lo que hay primero: un equivalente que no está no resuelve el mostrador.
  (disponible > 0) desc,
  -- Misma concentración antes que distinta, y lo que no se sabe al final: un
  -- equivalente con la concentración sin leer no se ofrece como si coincidiera.
  (misma_concentracion is true) desc,
  (misma_concentracion is null) asc,
  -- Y lo más barato primero, que es la pregunta que hace el cliente.
  precio asc nulls last
limit p_limite;
$$;

comment on function public.mostrador_equivalencias(uuid, uuid, integer) is
  'B · Equivalencias de catalogo. Exige la cadena completa de droga_principal igual: «ibuprofeno+cafeina» no es «ibuprofeno». La concentracion se compara cuando se pudo leer de las dos; si no, devuelve null y la pantalla lo dice.';

-- ── B.6 · CUANDO NO SE PUEDE SABER ──────────────────────────────────────────
--
-- Si el producto no tiene monodroga cargada, no se muestra una lista vacía: se
-- dice que no se pueden buscar equivalentes y por qué.
--
-- Son 23.880 de 48.217 productos los que no tienen monodroga. **La mitad del
-- catálogo.** Una lista vacía ahí se lee como «no hay equivalentes», que es
-- una afirmación distinta y falsa.

create or replace function public.mostrador_por_que_no_hay_equivalentes(p_producto uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when m.producto_id is null then
      jsonb_build_object('se_puede', false,
        'por_que', 'el producto no esta en el indice del mostrador')
    when m.droga_principal is null or btrim(m.droga_principal) = '' then
      jsonb_build_object('se_puede', false,
        'por_que', 'este producto no tiene monodroga cargada en el maestro de SIFACO, asi que no se puede buscar que otro tiene la misma composicion',
        'que_lo_arregla', 'que el maestro traiga la monodroga de este producto. Son ' ||
          (select count(*) from mostrador_indice where droga_principal is null)::text ||
          ' productos en la misma situacion, de ' ||
          (select count(*) from mostrador_indice)::text,
        'igual_se_puede', 'buscar otras presentaciones del mismo producto por nombre comercial')
    else
      jsonb_build_object('se_puede', true,
        'monodroga', m.droga_principal,
        'concentracion', m.concentracion,
        'concentracion_leida', m.concentracion is not null)
  end
  from (select * from mostrador_indice where producto_id = p_producto) m
  right join (select 1) z on true;
$$;

comment on function public.mostrador_por_que_no_hay_equivalentes(uuid) is
  'B.6 · Si se pueden buscar equivalentes y, cuando no, por que. Son 23.880 de 48.217 los productos sin monodroga: una lista vacia ahi se lee como «no hay equivalentes», que es una afirmacion distinta y falsa.';

revoke all on function public.mostrador_equivalencias(uuid, uuid, integer) from public, anon;
revoke all on function public.mostrador_por_que_no_hay_equivalentes(uuid) from public, anon;
grant execute on function public.mostrador_equivalencias(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.mostrador_por_que_no_hay_equivalentes(uuid) to authenticated, service_role;
