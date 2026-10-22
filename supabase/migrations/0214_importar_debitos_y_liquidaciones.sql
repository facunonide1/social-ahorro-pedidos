-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0214 · IMPORTAR DÉBITOS Y LIQUIDACIONES                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── EL FORMATO NO SE CONOCE ─────────────────────────────────────────────────
--
-- Facundo va a traer un archivo y nadie sabe qué columnas tiene. El importador
-- se construye como el de caja (v0.97): busca columnas por nombre entre los
-- nombres que se usan habitualmente, **muestra qué columnas entendió** y deja
-- confirmar antes de guardar nada.
--
-- Lo que NO hace es asumir un layout. Un importador que asume y falla en
-- silencio deja la mitad de los débitos afuera, y los débitos que faltan no se
-- notan: es plata que nunca apareció.
--
-- ── E.2 · LO QUE NO SE ENTIENDE NO SE INVENTA ───────────────────────────────
--
-- Si el texto del motivo no coincide con ningún motivo del catálogo, el débito
-- entra con motivo `otro` y el **texto original guardado tal cual**.
--
-- Inventarle un motivo para que encaje sería peor que dejarlo en `otro`: un
-- débito clasificado mal como `fuera_de_vademecum` queda marcado como no
-- reclamable para siempre, y nadie lo vuelve a mirar. En `otro` el sistema
-- dice que no sabe, y eso hace que alguien lo lea.

create table if not exists public.convenio_liquidaciones (
  id                    uuid primary key default gen_random_uuid(),
  convenio_id           uuid not null references public.convenios(id) on delete restrict,
  -- Null cuando la liquidación viene consolidada de la cadena. Cada débito
  -- igual tiene su sucursal: ahí es obligatoria.
  sucursal_id           uuid references public.sucursales(id) on delete restrict,
  periodo               text,
  fecha_liquidacion     date not null,

  origen                text not null default 'archivo',
  archivo_nombre        text,
  archivo_hash          text,
  -- E.3 · cuando entra por foto, la extracción del motor de documentos.
  extraccion_id         uuid references public.doc_extracciones(id) on delete set null,

  -- E.1 · QUÉ COLUMNAS SE LEYERON. Es lo que mira la persona antes de
  -- confirmar: sin esto, confirmar es firmar a ciegas.
  columnas_leidas       jsonb,
  -- E.4 · el reporte de la importación.
  filas_leidas          integer,
  filas_guardadas       integer,
  sin_motivo_reconocido integer,
  total_debitado        numeric(14,2),

  estado                text not null default 'borrador'
    check (estado in ('borrador', 'confirmada', 'descartada')),
  confirmada_por        uuid references auth.users(id) on delete set null,
  confirmada_at         timestamptz,
  notas                 text,
  es_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

create index if not exists convenio_liq_conv on public.convenio_liquidaciones (convenio_id, fecha_liquidacion desc);
-- El mismo archivo no se importa dos veces. Si el hash repite es el mismo
-- papel: importarlo de nuevo duplica cada débito.
create unique index if not exists convenio_liq_hash
  on public.convenio_liquidaciones (archivo_hash) where archivo_hash is not null;

comment on table public.convenio_liquidaciones is
  'El lote de una importacion de debitos. columnas_leidas es lo que mira la persona antes de confirmar: sin eso, confirmar es firmar a ciegas.';
comment on column public.convenio_liquidaciones.columnas_leidas is
  'Que columna del archivo se uso para cada campo, y cuales quedaron sin usar.';

alter table public.convenio_debitos
  drop constraint if exists convenio_debitos_liquidacion_fk;
alter table public.convenio_debitos
  add constraint convenio_debitos_liquidacion_fk
  foreign key (liquidacion_id) references public.convenio_liquidaciones(id) on delete set null;

-- ── EL MATCHEO DE MOTIVOS ───────────────────────────────────────────────────
--
-- Palabras que suelen aparecer en las liquidaciones reales, por motivo. No es
-- un diccionario completo y no pretende serlo: lo que no matchea va a `otro`
-- con su texto, que es el comportamiento correcto.
--
-- Se guarda en una tabla y no en código para que se pueda ampliar sin
-- redeployar: cuando llegue el primer archivo de verdad, los términos que use
-- esa obra social se agregan desde la pantalla. `convenio_id` permite que un
-- término signifique una cosa en una obra social y otra en otra — «COD 14» no
-- quiere decir lo mismo en dos liquidaciones distintas.

create table if not exists public.convenio_motivo_sinonimos (
  id           uuid primary key default gen_random_uuid(),
  motivo       text not null references public.convenio_debito_motivos(clave) on delete cascade,
  -- El texto a buscar, ya normalizado (minúsculas, sin acentos).
  termino      text not null,
  convenio_id  uuid references public.convenios(id) on delete cascade,
  aprendido_de uuid references public.convenio_liquidaciones(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists convenio_sinonimos_motivo on public.convenio_motivo_sinonimos (motivo);
create unique index if not exists convenio_sinonimos_unico
  on public.convenio_motivo_sinonimos (termino, coalesce(convenio_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.convenio_motivo_sinonimos is
  'Terminos que aparecen en las liquidaciones, por motivo. Lo que no matchea va a «otro» con su texto: no se inventa un motivo para que encaje.';

insert into public.convenio_motivo_sinonimos (motivo, termino) values
  ('troquel_faltante', 'troquel'),
  ('troquel_faltante', 'falta troquel'),
  ('troquel_faltante', 'sin troquel'),
  ('troquel_faltante', 'troquel ilegible'),
  ('troquel_faltante', 'cod barra'),
  ('receta_mal_cargada', 'mal cargada'),
  ('receta_mal_cargada', 'error de carga'),
  ('receta_mal_cargada', 'datos erroneos'),
  ('receta_mal_cargada', 'importe no coincide'),
  ('receta_mal_cargada', 'diferencia de importe'),
  ('fuera_de_vademecum', 'vademecum'),
  ('fuera_de_vademecum', 'no cubierto'),
  ('fuera_de_vademecum', 'producto no incluido'),
  ('fuera_de_vademecum', 'fuera de cobertura'),
  ('fuera_de_plazo', 'fuera de plazo'),
  ('fuera_de_plazo', 'presentacion tardia'),
  ('fuera_de_plazo', 'vencido el plazo'),
  ('fuera_de_plazo', 'extemporanea'),
  ('afiliado_de_baja', 'baja'),
  ('afiliado_de_baja', 'sin cobertura'),
  ('afiliado_de_baja', 'no afiliado'),
  ('afiliado_de_baja', 'padron'),
  ('duplicada', 'duplicada'),
  ('duplicada', 'duplicado'),
  ('duplicada', 'ya presentada'),
  ('duplicada', 'repetida'),
  ('firma_ilegible', 'firma'),
  ('firma_ilegible', 'sin firma'),
  ('firma_ilegible', 'conformidad'),
  ('sin_autorizacion_previa', 'autorizacion'),
  ('sin_autorizacion_previa', 'sin auditoria'),
  ('sin_autorizacion_previa', 'requiere auditoria'),
  ('supera_el_tope', 'tope'),
  ('supera_el_tope', 'excede cantidad'),
  ('supera_el_tope', 'supera maximo'),
  ('supera_el_tope', 'cantidad excedida')
on conflict do nothing;

-- Normaliza como el importador de caja: minúsculas, sin acentos, sin símbolos.
create or replace function public.convenio_normalizar(p text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select regexp_replace(
    lower(translate(coalesce(p, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
    '[^a-z0-9 ]', ' ', 'g');
$$;

-- El motivo que corresponde a un texto de liquidación.
--
-- Sin fila devuelta = no reconoció nada, y eso NO es un fallo: es la respuesta
-- correcta. El texto original lo guarda quien llama.
create or replace function public.convenio_motivo_de_texto(
  p_texto text,
  p_convenio uuid default null
)
returns table (motivo text, termino text, exacto boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (select convenio_normalizar(p_texto) as txt)
  select s.motivo, s.termino,
         -- `exacto` cuando el texto normalizado ES el término, no cuando lo
         -- contiene. Sirve para ordenar: «troquel» le gana a «sin troquel» si
         -- el texto dice exactamente «troquel».
         (t.txt = s.termino) as exacto
    from convenio_motivo_sinonimos s, t
   where t.txt <> ''
     and (s.convenio_id is null or s.convenio_id = p_convenio)
     and t.txt like '%' || s.termino || '%'
   order by (s.convenio_id is not null) desc, (t.txt = s.termino) desc, length(s.termino) desc
   limit 1;
$$;

comment on function public.convenio_motivo_de_texto(text, uuid) is
  'El motivo del catalogo que corresponde a un texto de liquidacion. Sin fila devuelta = no reconocio nada, y entonces va a «otro» con el texto original.';

-- ── E.4 · EL REPORTE DE LA IMPORTACIÓN ──────────────────────────────────────

create or replace function public.convenio_liquidacion_reporte(p_liquidacion uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'filas_leidas', l.filas_leidas,
    'filas_guardadas', (select count(*) from convenio_debitos d where d.liquidacion_id = l.id),
    'total_debitado', (select coalesce(sum(d.importe), 0) from convenio_debitos d where d.liquidacion_id = l.id),
    'sin_motivo_reconocido', (select count(*) from convenio_debitos d
                               where d.liquidacion_id = l.id and d.motivo = 'otro'),
    'por_motivo', (select coalesce(jsonb_agg(jsonb_build_object(
                      'motivo', x.motivo, 'nombre', m.nombre,
                      'cantidad', x.n, 'plata', x.plata) order by x.plata desc), '[]'::jsonb)
                    from (select d.motivo, count(*) as n, sum(d.importe) as plata
                            from convenio_debitos d where d.liquidacion_id = l.id
                           group by d.motivo) x
                    join convenio_debito_motivos m on m.clave = x.motivo),
    'reclamable', (select coalesce(sum(r.importe), 0) from convenio_recupero r
                    where r.id in (select d.id from convenio_debitos d where d.liquidacion_id = l.id)
                      and r.situacion = 'reclamable y sin reclamar'),
    'ya_vencido', (select coalesce(sum(r.importe), 0) from convenio_recupero r
                    where r.id in (select d.id from convenio_debitos d where d.liquidacion_id = l.id)
                      and r.situacion = 'se perdio por dejarlo vencer'),
    'columnas_leidas', l.columnas_leidas,
    'estado', l.estado
  )
  from convenio_liquidaciones l where l.id = p_liquidacion;
$$;

comment on function public.convenio_liquidacion_reporte(uuid) is
  'E.4 · Cuantos entraron, cuantos sin motivo reconocido, cuanto suma, y cuanto de eso es reclamable o ya vencio.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.convenio_liquidaciones    enable row level security;
alter table public.convenio_motivo_sinonimos enable row level security;

drop policy if exists convenio_liq_ver on public.convenio_liquidaciones;
create policy convenio_liq_ver on public.convenio_liquidaciones
  for select to authenticated
  using ((select hub_puede_ver('convenios'))
         and (sucursal_id is null or (select hub_ve_sucursal(sucursal_id))));

drop policy if exists convenio_liq_crear on public.convenio_liquidaciones;
create policy convenio_liq_crear on public.convenio_liquidaciones
  for insert to authenticated
  with check ((select hub_puede('convenios','crear'))
              and (sucursal_id is null or (select hub_ve_sucursal(sucursal_id))));

drop policy if exists convenio_liq_editar on public.convenio_liquidaciones;
create policy convenio_liq_editar on public.convenio_liquidaciones
  for update to authenticated
  using ((select hub_puede('convenios','editar')))
  with check ((select hub_puede('convenios','editar')));

drop policy if exists convenio_sinonimos_ver on public.convenio_motivo_sinonimos;
create policy convenio_sinonimos_ver on public.convenio_motivo_sinonimos
  for select to authenticated using ((select hub_puede_ver('convenios')));

drop policy if exists convenio_sinonimos_crear on public.convenio_motivo_sinonimos;
create policy convenio_sinonimos_crear on public.convenio_motivo_sinonimos
  for insert to authenticated with check ((select hub_puede('convenios','editar')));

revoke all on function public.convenio_motivo_de_texto(text, uuid) from public, anon;
revoke all on function public.convenio_liquidacion_reporte(uuid) from public, anon;
revoke all on function public.convenio_normalizar(text) from public, anon;
grant execute on function public.convenio_motivo_de_texto(text, uuid) to authenticated, service_role;
grant execute on function public.convenio_liquidacion_reporte(uuid) to authenticated, service_role;
grant execute on function public.convenio_normalizar(text) to authenticated, service_role;
