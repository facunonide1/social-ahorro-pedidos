-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0276 · H.7 y H.8 · EL CRUCE, QUE ES PARA LO QUE SIRVE                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Subir un archivo no sirve de nada. Lo que sirve es compararlo contra lo que
-- NORA ya sabe, y que las diferencias aparezcan con el monto, el producto y
-- la fecha — **sin acusar a nadie**, igual que el control de caja de la v0.97
-- y los doce detectores de la v1.3.
--
-- Es la misma regla de siempre: **el sistema describe el hecho, nunca la
-- causa.** Que la liquidacion diga $1.000 menos de lo que NORA calculo puede
-- ser una comision distinta, una venta que NORA no registro, una devolucion,
-- o un error de la plataforma. El cruce dice que faltan $1.000.
--
-- Los cuatro tipos cruzan contra cosas distintas:
--
--   catalogo    → contra `canal_publicaciones` y el maestro
--   ventas      → contra `orders`
--   liquidacion → **contra lo que NORA calculo que te tenian que pagar**, que
--                 es el unico cruce que puede decir si la comision es la
--                 pactada
--   errores     → contra nada: se cargan como rechazos, y el detector B.4 de
--                 este mismo tag estaba esperando exactamente eso

create table if not exists public.archivo_diferencias (
  id             uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references public.archivo_importaciones(id) on delete cascade,
  canal_id       text references public.canales_venta(id) on delete set null,
  tipo           text not null,
  clave          text not null,
  producto_id    uuid references public.productos_catalogo(id) on delete set null,
  sku            text,
  fecha          date,
  -- Los dos lados, siempre. Una diferencia sin los dos numeros no se puede
  -- revisar: hay que poder ver cual de los dos esta mal.
  dice_el_archivo text,
  dice_nora       text,
  monto          numeric,
  hecho          text not null,
  que_no_dice    text not null,
  estado         text not null default 'abierta'
                 check (estado in ('abierta', 'resuelta', 'descartada')),
  creada_at      timestamptz not null default now()
);

create index if not exists archivo_dif_imp on public.archivo_diferencias (importacion_id, estado);
alter table public.archivo_diferencias enable row level security;
drop policy if exists archivo_dif_ver on public.archivo_diferencias;
create policy archivo_dif_ver on public.archivo_diferencias for select to authenticated using (true);

comment on table public.archivo_diferencias is
  'H.8 · Las diferencias del cruce, con el monto, el producto y la fecha. Los '
  'DOS lados siempre: una diferencia sin los dos numeros no se puede revisar. '
  'Y cada una dice lo que NO dice, igual que los detectores de la v1.3.';

CREATE OR REPLACE FUNCTION public.archivo_cruzar(p_importacion uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imp record;
  v_n int := 0;
  v_canal record;
begin
  select * into v_imp from archivo_importaciones where id = p_importacion;
  if not found then
    return jsonb_build_object('ok', false, 'por_que', 'esa importación no existe');
  end if;
  select * into v_canal from canales_venta where id = v_imp.canal_id;

  delete from archivo_diferencias where importacion_id = p_importacion;

  if v_imp.tipo = 'catalogo' then
    -- Lo que el archivo dice que esta publicado y NORA no tiene, y al reves.
    insert into archivo_diferencias (
      importacion_id, canal_id, tipo, clave, sku, dice_el_archivo, dice_nora,
      monto, hecho, que_no_dice)
    select p_importacion, v_imp.canal_id, 'catalogo_falta_en_nora',
           'falta_nora:' || (f.datos ->> 'sku'), f.datos ->> 'sku',
           format('publicado a $%s', coalesce(f.datos ->> 'precio', 's/d')),
           'no figura publicado en este canal',
           null,
           format('El archivo de %s dice que %s está publicado y NORA no lo tiene en ese canal.',
                  coalesce(v_canal.nombre, v_imp.canal_id),
                  coalesce(f.datos ->> 'sku', 'un producto')),
           'No dice cuál de los dos tiene razón: puede ser que la sincronización esté atrasada o que el archivo sea viejo.'
      from archivo_filas f
     where f.importacion_id = p_importacion and f.se_entendio
       and (f.datos ->> 'sku') is not null
       and not exists (select 1 from canal_publicaciones cp
                        where cp.canal_id = v_imp.canal_id
                          and cp.sku = (f.datos ->> 'sku'));
    get diagnostics v_n = row_count;

    -- Y el precio distinto, que es el caso que mas aparece.
    insert into archivo_diferencias (
      importacion_id, canal_id, tipo, clave, producto_id, sku,
      dice_el_archivo, dice_nora, monto, hecho, que_no_dice)
    select p_importacion, v_imp.canal_id, 'catalogo_precio_distinto',
           'precio:' || cp.sku, cp.producto_id, cp.sku,
           '$' || plata_texto((f.datos ->> 'precio')::numeric),
           '$' || plata_texto(cp.precio::numeric),
           round((f.datos ->> 'precio')::numeric - cp.precio::numeric, 2),
           format('%s figura a $%s en el archivo de %s y a $%s en NORA: %s de diferencia.',
                  cp.sku, plata_texto((f.datos ->> 'precio')::numeric),
                  coalesce(v_canal.nombre, v_imp.canal_id),
                  plata_texto(cp.precio::numeric),
                  plata_texto(abs((f.datos ->> 'precio')::numeric - cp.precio::numeric))),
           'No dice cuál es el precio correcto. SIFACO es la autoridad de precio, pero lo que el cliente ve es lo que está publicado en el canal.'
      from archivo_filas f
      join canal_publicaciones cp
        on cp.canal_id = v_imp.canal_id and cp.sku = (f.datos ->> 'sku')
     where f.importacion_id = p_importacion and f.se_entendio
       and (f.datos ->> 'precio') ~ '^[0-9.,]+$'
       and cp.precio is not null
       and abs((f.datos ->> 'precio')::numeric - cp.precio::numeric) > 0.01;

  elsif v_imp.tipo = 'liquidacion' then
    -- **Que vendiste contra que te pagaron.** Es el cruce que mas plata
    -- mueve y el unico que puede decir si la comision es la pactada.
    insert into archivo_diferencias (
      importacion_id, canal_id, tipo, clave, fecha,
      dice_el_archivo, dice_nora, monto, hecho, que_no_dice)
    select p_importacion, v_imp.canal_id, 'liquidacion_comision_distinta',
           'comision:' || coalesce(f.datos ->> 'fecha', f.nro_fila::text),
           nullif(f.datos ->> 'fecha', '')::date,
           format('comisión de $%s sobre $%s = %s%%',
                  plata_texto((f.datos ->> 'comision')::numeric),
                  plata_texto((f.datos ->> 'monto')::numeric),
                  round(100.0 * (f.datos ->> 'comision')::numeric
                        / nullif((f.datos ->> 'monto')::numeric, 0), 1)),
           format('la comisión pactada es %s%%', v_canal.comision_pct),
           round((f.datos ->> 'comision')::numeric
                 - (f.datos ->> 'monto')::numeric * v_canal.comision_pct / 100.0, 2),
           format('La liquidación de %s cobró %s%% de comisión y lo pactado es %s%%: son $%s de diferencia sobre $%s de venta.',
                  coalesce(v_canal.nombre, v_imp.canal_id),
                  round(100.0 * (f.datos ->> 'comision')::numeric
                        / nullif((f.datos ->> 'monto')::numeric, 0), 1),
                  v_canal.comision_pct,
                  plata_texto(abs((f.datos ->> 'comision')::numeric
                        - (f.datos ->> 'monto')::numeric * v_canal.comision_pct / 100.0)),
                  plata_texto((f.datos ->> 'monto')::numeric)),
           'No dice que la plataforma esté cobrando de más. La comisión pactada en NORA puede estar desactualizada — de hecho no está confirmada contra ninguna liquidación, y esta es la primera.'
      from archivo_filas f
     where f.importacion_id = p_importacion and f.se_entendio
       and (f.datos ->> 'comision') ~ '^[0-9.,]+$'
       and (f.datos ->> 'monto') ~ '^[0-9.,]+$'
       and (f.datos ->> 'monto')::numeric > 0
       and abs((f.datos ->> 'comision')::numeric
               - (f.datos ->> 'monto')::numeric * v_canal.comision_pct / 100.0) > 1;
    get diagnostics v_n = row_count;

  elsif v_imp.tipo = 'errores' then
    -- No cruza: carga. El detector B.4 esta esperando exactamente esto.
    insert into canal_rechazos (canal_id, sku, motivo, detalle, rechazado_at, importacion_id)
    select v_imp.canal_id, f.datos ->> 'sku',
           coalesce(f.datos ->> 'motivo', 'sin motivo declarado'),
           f.crudo::text, nullif(f.datos ->> 'fecha', '')::timestamptz, p_importacion
      from archivo_filas f
     where f.importacion_id = p_importacion and f.se_entendio;
    get diagnostics v_n = row_count;

  elsif v_imp.tipo = 'ventas' then
    -- Que vendio la plataforma que NORA no registro.
    insert into archivo_diferencias (
      importacion_id, canal_id, tipo, clave, fecha,
      dice_el_archivo, dice_nora, monto, hecho, que_no_dice)
    select p_importacion, v_imp.canal_id, 'venta_no_registrada',
           'venta:' || coalesce(f.datos ->> 'id_externo', f.nro_fila::text),
           nullif(f.datos ->> 'fecha', '')::date,
           format('venta de $%s', plata_texto((f.datos ->> 'monto')::numeric)),
           'no hay ningún pedido con ese identificador',
           (f.datos ->> 'monto')::numeric,
           format('%s registra una venta de $%s el %s que NORA no tiene.',
                  coalesce(v_canal.nombre, v_imp.canal_id),
                  plata_texto((f.datos ->> 'monto')::numeric),
                  coalesce(f.datos ->> 'fecha', 'sin fecha')),
           'No dice que falte plata: dice que ese pedido no está en NORA. Puede no haberse sincronizado nunca.'
      from archivo_filas f
     where f.importacion_id = p_importacion and f.se_entendio
       and (f.datos ->> 'monto') ~ '^[0-9.,]+$'
       and not exists (select 1 from orders o
                        where o.woo_order_id::text = (f.datos ->> 'id_externo')
                           or o.codigo = (f.datos ->> 'id_externo'));
    get diagnostics v_n = row_count;
  end if;

  return jsonb_build_object(
    'ok', true, 'tipo', v_imp.tipo, 'diferencias', v_n,
    'que_pasa_ahora', case v_imp.tipo
      when 'errores' then format('Se cargaron %s rechazos. El detector de «rechazado por la plataforma» estaba esperando exactamente esto: ahora puede correr.', v_n)
      when 'liquidacion' then format('%s líneas donde la comisión cobrada no coincide con la pactada. No dice que la plataforma cobre de más: la comisión pactada en NORA no está confirmada y ésta es la primera liquidación.', v_n)
      else format('%s diferencias, cada una con los dos lados y con lo que no dice.', v_n)
    end);
end;
$function$
;
comment on function public.archivo_cruzar(uuid) is
  'H.7 y H.8 · El cruce contra lo que NORA sabe. Las diferencias llevan los '
  'dos lados, el monto y lo que NO dicen: «faltan $1.000» puede ser una '
  'comision distinta, una venta no registrada, una devolucion o un error de '
  'la plataforma, y el cruce describe el hecho, no la causa.';

revoke all on function public.archivo_cruzar(uuid) from public, anon, authenticated;
grant execute on function public.archivo_cruzar(uuid) to service_role;
