-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0272 · PUBLICAR Y DESPUBLICAR EN LOTE                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── E.5 · LA REGLA QUE ORDENA EL BLOQUE ─────────────────────────────────────
--
-- **Ninguna publicacion ni despublicacion se ejecuta.** NORA arma el lote, lo
-- firma una persona, y lo que sale es un archivo que alguien sube al canal.
--
-- No es prudencia: NORA no tiene credenciales de ningun canal. Lo que si
-- puede hacer —y es lo que hace— es que la decision quede tomada, firmada y
-- exportable, para que cargarla sea mecanico.
--
-- Por eso el estado es `firmado` y no `publicado`: **el sistema no sabe si se
-- publico.** Lo sabra la proxima sincronizacion, cuando el producto aparezca
-- en `canal_publicaciones`. Decir «publicado» cuando lo unico que paso es que
-- alguien firmo seria afirmar algo que ocurre afuera.

create table if not exists public.canal_lotes (
  id            uuid primary key default gen_random_uuid(),
  canal_id      text not null references public.canales_venta(id) on delete cascade,
  accion        text not null check (accion in ('publicar', 'despublicar')),
  estado        text not null default 'borrador'
                check (estado in ('borrador', 'firmado', 'exportado', 'descartado')),
  motivo        text,
  armado_por    uuid references auth.users(id) on delete set null,
  armado_at     timestamptz not null default now(),
  firmado_por   uuid references auth.users(id) on delete set null,
  firmado_at    timestamptz,
  exportado_at  timestamptz,
  plata_estimada numeric,
  como_se_calculo text
);

create table if not exists public.canal_lote_items (
  lote_id       uuid not null references public.canal_lotes(id) on delete cascade,
  producto_id   uuid not null references public.productos_catalogo(id) on delete cascade,
  sku           text,
  nombre        text,
  precio_sugerido numeric,
  plata         numeric,
  por_que       text,
  sacado        boolean not null default false,
  sacado_motivo text,
  primary key (lote_id, producto_id)
);

comment on table public.canal_lotes is
  'E.4 y E.5 · Un lote de publicacion o despublicacion. El estado llega hasta '
  '`exportado`, nunca a «publicado»: NORA no publica y no sabe si se publico. '
  'Eso lo dice la proxima sincronizacion del canal.';
comment on column public.canal_lote_items.sacado is
  'E.4 · Lo que la persona saco del lote al revisarlo, con el motivo. Un lote '
  'que no se puede recortar se firma entero o no se firma, y entonces no se '
  'firma.';

create index if not exists lotes_canal on public.canal_lotes (canal_id, estado, armado_at desc);
alter table public.canal_lotes enable row level security;
alter table public.canal_lote_items enable row level security;
drop policy if exists lotes_ver on public.canal_lotes;
drop policy if exists lote_items_ver on public.canal_lote_items;
create policy lotes_ver on public.canal_lotes for select to authenticated using (true);
create policy lote_items_ver on public.canal_lote_items for select to authenticated using (true);

-- ── E.1 · QUE CONVIENE PUBLICAR Y NO ESTA ───────────────────────────────────
--
-- Con margen positivo DESPUES de comision y envio. La v0.9x ya tenia
-- `canal_candidatos` (371 productos) y mira el margen a secas: sirve para la
-- tienda propia, que no cobra comision, y no para un marketplace.
--
-- Medido: **4.708 en PedidosYa y 2.192 en la tienda propia.** Y lo legal
-- nunca se propone, en ningun canal.

CREATE OR REPLACE FUNCTION public.canal_conviene_publicar(p_canal text, p_limite integer DEFAULT 200)
 RETURNS TABLE(producto_id uuid, sku text, nombre text, precio_mostrador numeric, costo numeric, precio_en_el_canal numeric, queda_para_el_negocio numeric, vende_3m numeric, stock numeric, plata_al_ano_si_se_vendiera_todo_ahi numeric, por_que text, el_supuesto text, de_cuantos_es_este integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cv as (select * from canales_venta where id = p_canal),
  candidatos as (
    select p.id, p.sku, p.nombre_comercial,
           p.precio_sugerido::numeric as mostrador,
           p.precio_costo_promedio::numeric as costo,
           coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                      where v.producto_id = p.id
                        and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vende_3m,
           coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                      where ps.producto_id = p.id and ps.sucursal_id is not null), 0)::numeric as stock
      from productos_catalogo p
     where p.activo and not p.es_demo and coalesce(p.es_producto, true)
       and p.precio_sugerido is not null and p.precio_costo_promedio is not null
       -- Lo legal no se propone publicar en ningun canal abierto, nunca.
       and not (p.requiere_receta or p.es_controlado or p.es_psicotropico
                or p.condicion_venta in ('requiere_receta','receta_archivada','estupefaciente_psico_ii'))
       -- Y lo que ya esta publicado ahi, tampoco.
       and not exists (select 1 from canal_publicaciones cp
                        where cp.canal_id = p_canal and cp.producto_id = p.id
                          and cp.estado = 'publish')
  ),
  calc as (
    select c.*, cv.comision_pct, cv.margen_extra_pct, cv.costo_envio, cv.envio_lo_paga,
           cv.catalogo_cargado, cv.nombre as canal,
           round(c.mostrador * (1 + cv.margen_extra_pct / 100.0), 2) as precio_canal,
           round(c.mostrador * (1 + cv.margen_extra_pct / 100.0) * (1 - cv.comision_pct / 100.0)
                 - c.costo
                 - case when cv.envio_lo_paga = 'negocio' then coalesce(cv.costo_envio, 0) else 0 end, 2) as queda
      from candidatos c cross join cv
  ),
  buenos as (
    select * from calc where queda > 0 and stock > 0
  )
  select b.id, b.sku, b.nombre_comercial, b.mostrador, b.costo,
         b.precio_canal, b.queda, b.vende_3m, b.stock,
         case when b.vende_3m > 0 then round(b.queda * b.vende_3m / 3.0 * 12, 2) end,
         format('deja $%s por unidad después de la comisión del %s%%%s, hay %s en stock y vende %s unidades cada 3 meses',
                plata_texto(b.queda), b.comision_pct,
                case when b.envio_lo_paga = 'negocio' and coalesce(b.costo_envio, 0) > 0
                     then format(' y del envío de $%s', plata_texto(b.costo_envio)) else '' end,
                round(b.stock), round(b.vende_3m)),
         case when b.vende_3m > 0
              then 'la plata al año supone que lo que hoy vende pasaría a venderse por este canal, y eso es lo que hay que decidir. Lo que no depende de ningún supuesto es que deja plata por unidad'
              else 'no se proyecta plata: no registra venta en 3 meses' end,
         (select count(*)::integer from buenos)
    from buenos b
   order by case when b.vende_3m > 0 then b.queda * b.vende_3m else 0 end desc, b.queda desc
   limit p_limite;
$function$
;
comment on function public.canal_conviene_publicar(text, integer) is
  'E.1 · Lo que conviene publicar y no esta, por canal. `canal_candidatos` de '
  'la v0.9x mira el margen a secas: sirve para la tienda propia, que no cobra '
  'comision, y no para un marketplace. Lo legal nunca se propone.';

revoke all on function public.canal_conviene_publicar(text, integer) from public, anon, authenticated;
grant execute on function public.canal_conviene_publicar(text, integer) to service_role;
