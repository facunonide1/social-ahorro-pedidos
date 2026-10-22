-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0248 · EL LOTE Y LA EXPORTACION · F.2, F.4 y F.5                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- (La cola de F.3 nacio aca y su cuerpo final queda en 0249, que le agrega el
--  filtro de `es_producto`.)
--
-- ── F.3 · EMPEZAR POR LOS MAS VISTOS, Y EL PROBLEMA CON ESO ─────────────────
--
-- No hay registro de vistas. Los canales no devuelven visitas y
-- `mostrador_sugerencias_log` tiene 0 filas.
--
-- Entonces se ordena por **unidades vendidas**, que es el proxy que si existe:
-- 4.448 de las 7.600 publicaciones registran venta. Y se dice, porque no es lo
-- mismo: un producto se puede ver mucho y no venderse, y ese es justamente el
-- que mas necesita una descripcion.
--
-- Lo que no tiene venta va despues, ordenado por stock parado: si hay plata
-- inmovilizada en algo que nadie compra, una descripcion es lo mas barato que
-- se puede probar.
--
-- (`canales_venta.id` es text y no uuid. Se consulto el esquema: el canal de
--  Woo se identifica con su slug.)

-- ── F.2 · LA CONFIRMACION POR LOTE ──────────────────────────────────────────
--
-- Nada se publica de a uno. Se revisa un lote y se confirma el lote.
--
-- ── POR QUE EL LOTE Y NO CADA UNA ───────────────────────────────────────────
--
-- Porque son 7.600. Aprobar de a una es garantizar que no se apruebe ninguna:
-- a las treinta, la persona empieza a apretar «aprobar» sin leer, y eso es
-- peor que no revisar — queda registrado como revisado.
--
-- Un lote de 20 se lee en dos minutos, y las que estan mal se sacan del lote.
--
-- ── Y POR QUE LA FUNCION DEVUELVE LO QUE RECHAZO ────────────────────────────
--
-- Si una descripcion del lote promete algo, la pared la frena. La funcion no
-- se cae: aprueba las otras y devuelve cual quedo afuera y por que. Un lote
-- que se cae entero por una descripcion obliga a buscarla a mano entre veinte.

create or replace function public.descripciones_aprobar_lote(p_lote uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_ok int := 0;
  v_frenadas jsonb := '[]'::jsonb;
  v_promesas text;
begin
  if p_lote is null then
    return jsonb_build_object('ok', false, 'por_que', 'falta el lote');
  end if;

  for r in
    select * from producto_descripciones
     where lote_id = p_lote and estado = 'propuesta'
  loop
    select string_agg(format('«%s»: %s', frase, por_que), '; ')
      into v_promesas from descripcion_promete(r.texto);

    if v_promesas is not null then
      v_frenadas := v_frenadas || jsonb_build_object(
        'producto_id', r.producto_id, 'texto', r.texto, 'por_que', v_promesas);
      update producto_descripciones
         set estado = 'rechazada', rechazada_motivo = v_promesas
       where producto_id = r.producto_id;
      continue;
    end if;

    update producto_descripciones
       set estado = 'aprobada', aprobada_at = now(), aprobada_por = auth.uid()
     where producto_id = r.producto_id;
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object(
    'ok', true, 'lote', p_lote, 'aprobadas', v_ok,
    'frenadas', jsonb_array_length(v_frenadas), 'detalle_frenadas', v_frenadas,
    'que_paso', case
      when v_ok = 0 and jsonb_array_length(v_frenadas) = 0 then
        'ese lote no tiene propuestas para aprobar'
      when jsonb_array_length(v_frenadas) = 0 then
        format('se aprobaron las %s del lote', v_ok)
      else
        format('se aprobaron %s y quedaron %s afuera porque prometían algo. Las frenadas quedan como rechazadas, con el motivo, y se pueden volver a generar.',
               v_ok, jsonb_array_length(v_frenadas))
    end);
end;
$$;

comment on function public.descripciones_aprobar_lote(uuid) is
  'F.2 · Confirma un lote. No se cae si una promete: aprueba las otras y '
  'devuelve cuál quedó afuera y por qué. Un lote que se cae entero por una '
  'obliga a buscarla a mano entre veinte.';

-- ── F.5 · LA EXPORTACION POR CANAL ──────────────────────────────────────────
--
-- Solo lo aprobado. Lo propuesto no sale, y eso es el sentido de que haya dos
-- estados.
--
-- Y el nombre que exporta es el del canal, no el de SIFACO: el canal ya tiene
-- un nombre legible y pisarlo con «A CLORHEXIDINA JABON PREP. 110 ML» seria
-- empeorar lo que ya esta bien.

create or replace function public.descripciones_exportar(p_canal text default null)
returns table (
  canal text, externo_id text, sku text, nombre text,
  descripcion text, aprobada_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select cv.nombre, cp.externo_id, cp.sku, cp.nombre,
         d.texto, d.aprobada_at
    from canal_publicaciones cp
    join canales_venta cv on cv.id = cp.canal_id
    join producto_descripciones d on d.producto_id = cp.producto_id
   where d.estado = 'aprobada'
     and (p_canal is null or cp.canal_id = p_canal)
   order by cv.nombre, cp.nombre;
$$;

comment on function public.descripciones_exportar(text) is
  'F.5 · Solo lo aprobado: lo propuesto no sale, y eso es para qué existen los '
  'dos estados. Exporta el nombre del canal y no el de SIFACO — el canal ya '
  'tiene un nombre legible.';

-- ── F.4 · LO QUE NO SE PUEDE DESCRIBIR ──────────────────────────────────────
--
-- Queda sin describir y lo dice. Son los casos donde el nombre no alcanza
-- para saber que es la cosa: «ZZP DISNEY CAPYBARA LATA (5087», cortado a los
-- 30 caracteres de SIFACO, sin laboratorio y sin rubro.
--
-- Inventar que es una lata de algo es exactamente lo que no se puede hacer.

create or replace function public.descripciones_sin_poder()
returns table (producto_id uuid, nombre_canal text, nombre_sifaco text, por_que_no text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.producto_id,
         (select cp.nombre from canal_publicaciones cp
           where cp.producto_id = d.producto_id limit 1),
         p.nombre_comercial, d.por_que_no
    from producto_descripciones d
    join productos_catalogo p on p.id = d.producto_id
   where d.estado = 'no_se_puede'
   order by 2;
$$;

comment on function public.descripciones_sin_poder() is
  'F.4 · Lo que no se puede describir, con el motivo. «ZZP DISNEY CAPYBARA '
  'LATA (5087» cortado a los 30 caracteres de SIFACO no dice qué es la cosa, '
  'e inventar que es una lata de algo es lo que no se puede hacer.';

create or replace function public.descripciones_resumen()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'publicaciones', (select count(*) from canal_publicaciones),
    'productos_publicados', (select count(distinct producto_id) from canal_publicaciones
                              where producto_id is not null),
    'sin_cruzar_con_el_catalogo', (select count(*) from canal_publicaciones
                                     where producto_id is null),
    'aprobadas', (select count(*) from producto_descripciones where estado = 'aprobada'),
    'propuestas', (select count(*) from producto_descripciones where estado = 'propuesta'),
    'rechazadas', (select count(*) from producto_descripciones where estado = 'rechazada'),
    'no_se_pueden', (select count(*) from producto_descripciones where estado = 'no_se_puede'),
    'sin_describir', (select count(distinct cp.producto_id) from canal_publicaciones cp
                       left join producto_descripciones d on d.producto_id = cp.producto_id
                      where cp.producto_id is not null and d.producto_id is null));
$$;

revoke all on function public.descripciones_aprobar_lote(uuid) from public, anon;
revoke all on function public.descripciones_exportar(text) from public, anon;
revoke all on function public.descripciones_sin_poder() from public, anon;
revoke all on function public.descripciones_resumen() from public, anon;
grant execute on function public.descripciones_aprobar_lote(uuid) to authenticated, service_role;
grant execute on function public.descripciones_exportar(text) to authenticated, service_role;
grant execute on function public.descripciones_sin_poder() to authenticated, service_role;
grant execute on function public.descripciones_resumen() to authenticated, service_role;
