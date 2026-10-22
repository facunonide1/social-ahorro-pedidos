-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0279 · UN CANAL SE DA DE ALTA, NO SE PROGRAMA                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Si sumar Rappi necesita una migracion, el sector es deuda.
--
-- ── LO QUE FALTABA PARA QUE NO HAGA FALTA CODIGO ────────────────────────────
--
-- `canales_venta` ya tenia comision, recargo, envio, impuesto, sucursal de
-- despacho, horarios, tiempo prometido y responsable. Faltaban cuatro cosas
-- de G.2 y G.3, y una de G.4:
--
--   · la comision FIJA por operacion. Muchas plataformas cobran un
--     porcentaje mas un fijo, y con solo el porcentaje el calculo da bien en
--     los montos grandes y mal en los chicos — que son la mayoria.
--   · la comision POR CATEGORIA. Mercado Libre cobra distinto segun el
--     rubro, y un promedio esconde exactamente los productos que no
--     convienen.
--   · las retenciones.
--   · **a cuantos dias acredita.** No cambia el margen y cambia la caja, y
--     son dos cosas distintas: un canal puede convenir y asfixiar.
--   · G.4 · como entra cada cosa, por separado. Un canal puede tener el
--     catalogo por archivo y los pedidos por API, y declarar «por archivo» a
--     secas obliga a elegir mal.
--
-- ── G.3 · Y UNA QUE NO ES UNA OPCION ────────────────────────────────────────
--
-- `permite_receta` existe y nace en falso, y en los canales abiertos se queda
-- en falso. **La regla de oro 9 no es una opcion de configuracion**: la
-- columna existe para un canal cerrado entre farmacias, no para que alguien
-- apague el control con un clic.

alter table public.canales_venta
  add column if not exists comision_fija numeric not null default 0,
  add column if not exists comision_por_categoria jsonb,
  add column if not exists retenciones_pct numeric not null default 0,
  add column if not exists acredita_en_dias integer,
  add column if not exists permite_receta boolean not null default false,
  add column if not exists permite_controlados boolean not null default false,
  add column if not exists categorias_excluidas text[],
  add column if not exists entrada_catalogo text
    check (entrada_catalogo in ('archivo', 'api', 'a_mano', 'no_entra')),
  add column if not exists entrada_pedidos text
    check (entrada_pedidos in ('archivo', 'api', 'a_mano', 'no_entra')),
  add column if not exists entrada_liquidaciones text
    check (entrada_liquidaciones in ('archivo', 'api', 'a_mano', 'no_entra')),
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

comment on column public.canales_venta.comision_fija is
  'G.2 · El fijo por operacion, ademas del porcentaje. Con solo el porcentaje '
  'el calculo da bien en los montos grandes y mal en los chicos, que son la '
  'mayoria.';
comment on column public.canales_venta.comision_por_categoria is
  'G.2 · {"perfumeria": 18, "medicamentos": 13}. Un promedio esconde '
  'exactamente los productos que no convienen.';
comment on column public.canales_venta.acredita_en_dias is
  'G.2 · No cambia el margen y cambia la caja. Son dos cosas distintas: un '
  'canal puede convenir y asfixiar.';
comment on column public.canales_venta.permite_receta is
  'G.3 · Falso por defecto, y en los canales abiertos se queda en falso. La '
  'regla de oro 9 no es una opcion de configuracion: esto existe para un '
  'canal cerrado entre farmacias, no para apagar el control.';

update public.canales_venta set
  entrada_catalogo = case id when 'woo' then 'api' when 'mostrador' then 'api' else 'archivo' end,
  entrada_pedidos = case id when 'woo' then 'api' else 'a_mano' end,
  entrada_liquidaciones = 'archivo';

-- El mostrador no recibe pedidos ni liquidaciones: se vende ahi. Decir que su
-- API «nunca trajo un dato» es cierto y no es un problema, y un tablero que
-- marca en rojo algo que esta bien hace que nadie mire el rojo.
update public.canales_venta
   set entrada_pedidos = 'no_entra', entrada_liquidaciones = 'no_entra'
 where tipo = 'mostrador';

CREATE OR REPLACE FUNCTION public.canal_alta(p_id text, p_nombre text, p_tipo text, p_comision_pct numeric DEFAULT 0, p_recargo_pct numeric DEFAULT 0, p_sucursal uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rol text;
begin
  select u.rol into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is null then
    return jsonb_build_object('ok', false, 'por_que', 'no hay una sesión activa con permiso');
  end if;
  if v_rol not in ('super_admin', 'gerente') then
    return jsonb_build_object('ok', false,
      'por_que', format('el rol «%s» no da de alta canales: abrir un canal compromete al negocio con una plataforma', v_rol));
  end if;
  if p_id is null or btrim(p_id) = '' or p_nombre is null or btrim(p_nombre) = '' then
    return jsonb_build_object('ok', false, 'por_que', 'faltan el identificador o el nombre');
  end if;
  if exists (select 1 from canales_venta where id = p_id) then
    return jsonb_build_object('ok', false, 'por_que', format('ya hay un canal con el id «%s»', p_id));
  end if;

  insert into canales_venta (
    id, nombre, tipo, activo, comision_pct, margen_extra_pct,
    costo_envio, envio_lo_paga, impuesto_pct,
    sucursal_despacho_id, configurado,
    catalogo_cargado, catalogo_como_se_carga,
    comision_confirmada, comision_de_donde,
    entrada_catalogo, entrada_pedidos, entrada_liquidaciones,
    permite_receta, permite_controlados,
    creado_por, notas)
  values (
    btrim(p_id), btrim(p_nombre), p_tipo, true,
    coalesce(p_comision_pct, 0), coalesce(p_recargo_pct, 0),
    0, 'cliente', 0, p_sucursal, false,
    false, 'subiendo el catálogo del canal por el importador, en Canales → Importar',
    false, format('lo cargó %s al dar de alta el canal y todavía no se verificó contra una liquidación',
                  coalesce((select e.nombre_completo from empleados e
                             where e.user_id = auth.uid() and e.activo limit 1), 'alguien')),
    'archivo', 'a_mano', 'archivo',
    false, false,
    auth.uid(),
    'Dado de alta desde la pantalla. Nace sin catálogo y con la comisión sin confirmar: no nace en cero, nace diciendo que no sabe.');

  return jsonb_build_object(
    'ok', true, 'canal', p_id,
    'que_le_falta', jsonb_build_array(
      'el catálogo: subirlo por el importador',
      format('confirmar la comisión del %s%% contra una liquidación real', coalesce(p_comision_pct, 0)),
      'un responsable, o los errores del catálogo van a quedar sin dueño',
      'el costo del envío y quién lo paga',
      'el horario y el tiempo de preparación que promete',
      'a cuántos días acredita'),
    'que_pasa_ahora',
      format('«%s» quedó dado de alta y aparece en el tablero diciendo qué le falta. No va a mostrar números inventados: lo que no sabe lo dice.', p_nombre));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.canales_conexiones()
 RETURNS TABLE(canal_id text, canal text, que text, como text, ultimo_dato timestamp with time zone, dias_sin_mover integer, anda boolean, que_hacer text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with umbral as (
    select coalesce((select max(valor)::int from compras_parametros
                      where clave = 'dias_maestro_viejo'), 7) as dias
  ),
  c as (
    select cv.id, cv.nombre, cv.tipo, x.que, x.como,
      case x.que
        when 'catálogo' then
          case when cv.tipo = 'mostrador'
               then (select max(aplicado_at) from sifaco_importaciones where aplicado_at is not null)
               else (select max(leido_at) from canal_publicaciones cp where cp.canal_id = cv.id) end
        when 'pedidos' then
          (select max(created_at) from orders o
            where coalesce(o.canal_externo_id, o.origin::text) = cv.id)
        else
          (select max(subido_at) from archivo_importaciones ai
            where ai.canal_id = cv.id and ai.tipo = 'liquidacion')
      end as ultimo
    from canales_venta cv
    cross join lateral (values
      ('catálogo', coalesce(cv.entrada_catalogo, 'no declarado')),
      ('pedidos', coalesce(cv.entrada_pedidos, 'no declarado')),
      ('liquidaciones', coalesce(cv.entrada_liquidaciones, 'no declarado'))
    ) as x(que, como)
    where cv.activo
  ),
  con_estado as (
    select c.*,
      case when c.como = 'no_entra' then null
           when c.ultimo is null then false
           else (current_date - c.ultimo::date) <= (select dias from umbral) end as anda
      from c
  )
  select e.id, e.nombre, e.que, e.como, e.ultimo,
         case when e.ultimo is not null then (current_date - e.ultimo::date) end,
         e.anda,
         case
           when e.como = 'no_entra' then
             format('nada: %s no recibe %s a propósito', e.nombre, e.que)
           when e.como = 'no declarado' then
             'declarar cómo entra: por archivo, por API o a mano. Sin eso no se puede saber si está atrasado'
           when e.ultimo is null and e.como = 'archivo' then
             format('subir el primer archivo de %s por el importador', e.que)
           when e.ultimo is null and e.como = 'api' then
             format('conectar la cuenta: la API de %s nunca trajo un dato', e.nombre)
           when e.ultimo is null then
             format('cargar los primeros datos de %s a mano', e.que)
           when (current_date - e.ultimo::date) > (select dias from umbral) and e.como = 'api' then
             format('revisar la conexión: hace %s días que no entra un dato y debería entrar solo',
                    current_date - e.ultimo::date)
           when (current_date - e.ultimo::date) > (select dias from umbral) then
             format('subir un archivo nuevo: el último es de hace %s días',
                    current_date - e.ultimo::date)
           else null
         end
    from con_estado e
   order by (e.anda is false) desc nulls last, e.nombre, e.que;
$function$
;
comment on function public.canal_alta(text, text, text, numeric, numeric, uuid) is
  'G.1 y G.6 · Un canal nuevo nace declarado vacio: sin catalogo, con la '
  'comision sin confirmar, y con la lista de lo que le falta. No nace en '
  'cero — nace diciendo que no sabe.';
comment on function public.canales_conexiones() is
  'G.5 · Cual anda, cuando movio un dato y QUE HACER si no. La ultima parte '
  'es la que falta en todos los tableros de conexiones: decir que algo esta '
  'rojo sin decir que se hace es un semaforo, no una herramienta.';

revoke all on function public.canal_alta(text, text, text, numeric, numeric, uuid) from public, anon;
revoke all on function public.canales_conexiones() from public, anon, authenticated;
grant execute on function public.canal_alta(text, text, text, numeric, numeric, uuid) to authenticated, service_role;
grant execute on function public.canales_conexiones() to service_role;

-- ── LA DECIMA EXCEPCION ─────────────────────────────────────────────────────
--
-- `canal_alta` guarda `creado_por` con auth.uid() y mira el rol: cumple la
-- condicion que el verificador de 0271 comprueba. Diez excepciones, y las
-- diez son la misma cosa — acciones que una persona firma.
--
-- El `_dump_defs` que se uso para escribir estos archivos de migracion sin
-- tipear los cuerpos a mano se borra: era andamio.

drop function if exists public._dump_defs(text[]);
