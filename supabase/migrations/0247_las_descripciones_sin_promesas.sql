-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0247 · LAS DESCRIPCIONES DE PRODUCTO                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Hay 7.737 publicaciones en los canales y el nombre que llevan sale del
-- codigo abreviado de SIFACO. Los nombres del canal estan razonables
-- —«Jabon Preparador con Clorhexidina 110 ml»— pero la descripcion esta
-- vacia, y el catalogo guarda «A CLORHEXIDINA JABON PREP. 110 ML».
--
-- ── LA REGLA DURA: NINGUNA PROMESA ──────────────────────────────────────────
--
-- La descripcion dice **que es**, no **para que sirve**.
--
--   «Jabon antiseptico con clorhexidina al 4%. Envase de 110 ml.»   si
--   «Ideal para la higiene prequirurgica de la piel.»               no
--
-- La segunda es una indicacion, y una indicacion es ejercicio profesional
-- —la misma frontera del mostrador en la v1.2. Pero el motivo practico pesa
-- mas que el legal: una descripcion que promete algo es una descripcion por
-- la que alguien compra, y si no cumple, el que respondio fue el sistema.
--
-- ── Y TAMPOCO EN PERFUMERIA ─────────────────────────────────────────────────
--
-- «Hidrata la piel durante 24 horas» no tiene riesgo sanitario y es
-- igualmente una promesa. Se prohibe igual, por una razon que no es legal:
-- **una regla con excepciones no se cumple.** El dia que la regla sea «sin
-- promesas salvo en perfumeria», alguien va a tener que decidir si un
-- suplemento es perfumeria, y la decision la va a tomar con apuro.
--
-- Una sola regla, para los 7.737.
--
-- ── POR QUE LA REGLA ES UNA PARED Y NO UNA INSTRUCCION ──────────────────────
--
-- Al modelo se le puede pedir que no prometa. Lo va a cumplir casi siempre.
-- «Casi siempre» sobre 7.737 descripciones son decenas de promesas
-- publicadas.
--
-- Entonces la regla vive en la base: `descripcion_promete()` la revisa y un
-- trigger impide aprobar una descripcion que prometa. Funcion como puerta,
-- trigger como pared — el patron de este proyecto.

create table if not exists public.producto_descripciones (
  producto_id   uuid primary key references public.productos_catalogo(id) on delete cascade,
  texto         text,
  estado        text not null default 'propuesta'
                check (estado in ('propuesta', 'aprobada', 'rechazada', 'no_se_puede')),
  -- F.4 · lo que no se puede describir queda sin describir y lo dice.
  por_que_no    text,
  -- De donde salio. Un texto generado que no dice con que se genero no se
  -- puede auditar cuando alguien pregunte por que dice lo que dice.
  fuente        text,
  modelo        text,
  -- F.2 · el lote con el que se confirma. Nada se publica de a uno.
  lote_id       uuid,
  generada_at   timestamptz not null default now(),
  aprobada_at   timestamptz,
  aprobada_por  uuid references auth.users(id) on delete set null,
  rechazada_motivo text
);

comment on table public.producto_descripciones is
  'F · Las descripciones comerciales. Una por producto. La regla dura —ninguna '
  'promesa— la hace cumplir un trigger y no el prompt: «casi siempre» sobre '
  '7.737 descripciones son decenas de promesas publicadas.';

create index if not exists desc_estado on public.producto_descripciones (estado, generada_at desc);
create index if not exists desc_lote on public.producto_descripciones (lote_id);

alter table public.producto_descripciones enable row level security;
drop policy if exists desc_ver on public.producto_descripciones;
create policy desc_ver on public.producto_descripciones
  for select to authenticated using (true);

-- ── LA PARED ────────────────────────────────────────────────────────────────
--
-- Las tres formas de prometer, y cada una tiene su propia trampa:
--
--   1 · el beneficio directo · «hidrata», «alivia», «mejora». Es la que el
--       modelo escribe sin darse cuenta porque asi se describe un producto en
--       cualquier catalogo del mundo.
--   2 · el para-que · «ideal para», «indicado para», «recomendado para». Mas
--       dificil de ver porque suena a informacion y es una indicacion.
--   3 · el superlativo · «el mejor», «unico», «garantizado». No es clinico y
--       es igual de insostenible: si no cumple, el que lo dijo fue el sistema.

create or replace function public.descripcion_promete(p_texto text)
returns table (frase text, familia text, por_que text)
language sql
immutable
as $$
  with reglas(patron, frase, familia, por_que) as (values
    -- 1 · el beneficio directo
    ('\m(hidrata|hidratante|humecta|nutre|nutritiva?|repara|regenera|revitaliza)\M', 'hidrata / nutre / repara', 'beneficio',
     'afirma un efecto sobre el cuerpo. Decir de que esta hecho no es lo mismo que decir que hace'),
    ('\m(alivia|calma|desinflama|cicatriza|cura|sana|elimina|combate|previene|protege)\M', 'alivia / cura / previene', 'beneficio',
     'es una afirmacion sanitaria. Lo dice el fabricante en el envase o un profesional, no el catalogo'),
    ('\m(mejora|fortalece|refuerza|estimula|aumenta|reduce|disminuye|adelgaza|blanquea)\M', 'mejora / fortalece / reduce', 'beneficio',
     'promete un resultado. El resultado depende de la persona y el sistema no lo sabe'),
    ('\m(suaviza|rejuvenece|ilumina|tonifica|reafirma|antiage|anti-?edad|antiarrugas)\M', 'suaviza / rejuvenece / antiage', 'beneficio',
     'promete un resultado estetico. La regla es una sola: tampoco en perfumeria'),
    -- 2 · el para-que
    ('\m(ideal para|indicado para|recomendado para|sirve para|util para|apto para tratar|para tratar|para aliviar|para el tratamiento)\M', 'ideal para / indicado para', 'indicacion',
     'es una indicacion. Indicar un tratamiento es ejercicio profesional, y el catalogo no atiende'),
    ('\m(ayuda a|contribuye a|favorece|promueve)\M', 'ayuda a / favorece', 'indicacion',
     'suena mas suave y promete lo mismo. «Ayuda a dormir» es una indicacion con otra forma'),
    -- 3 · el superlativo
    ('\m(el mejor|la mejor|unico|unica|insuperable|garantiza|garantizado|100 ?%|comprobado|clinicamente)\M', 'el mejor / garantizado / comprobado', 'superlativo',
     'no se puede sostener. Si no cumple, el que lo prometio fue el sistema'),
    ('\m(rapido alivio|accion rapida|efecto inmediato|resultados visibles|sin efectos adversos|natural y seguro)\M', 'acción rápida / resultados visibles', 'superlativo',
     'promete velocidad o seguridad, que son las dos cosas que menos se pueden prometer')
  )
  select r.frase, r.familia, r.por_que
    from reglas r
   where lower(translate(coalesce(p_texto, ''),
               'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) ~ r.patron;
$$;

comment on function public.descripcion_promete(text) is
  'La regla dura de F, en tres familias: el beneficio directo, el para-qué y '
  'el superlativo. Se compara sin acentos para que «única» y «unica» caigan '
  'igual. No es una lista de palabras prohibidas por prolijidad: cada una '
  'convierte una descripción en el motivo por el que alguien compra.';

create or replace function public.tg_descripcion_sin_promesas()
returns trigger
language plpgsql
as $$
declare v text;
begin
  -- Solo frena la aprobacion. Una propuesta puede prometer: para eso se
  -- revisa. Lo que no puede es quedar aprobada prometiendo.
  if new.estado = 'aprobada' then
    select string_agg(format('«%s» (%s)', frase, por_que), '; ')
      into v from descripcion_promete(new.texto);
    if v is not null then
      raise exception
        'Esta descripcion promete algo y no se puede aprobar: %. La descripcion dice que es el producto, no para que sirve.', v
        using errcode = 'check_violation';
    end if;
    if new.texto is null or btrim(new.texto) = '' then
      raise exception 'No se puede aprobar una descripcion vacia.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists descripcion_sin_promesas on public.producto_descripciones;
create trigger descripcion_sin_promesas
  before insert or update on public.producto_descripciones
  for each row execute function public.tg_descripcion_sin_promesas();

comment on function public.tg_descripcion_sin_promesas() is
  'La pared. Al modelo se le puede pedir que no prometa y lo va a cumplir casi '
  'siempre; «casi siempre» sobre 7.737 descripciones son decenas de promesas '
  'publicadas. Frena la aprobacion, no la propuesta: una propuesta que promete '
  'es justamente lo que hay que poder ver para rechazarla.';

-- Funcion de trigger: la llama Postgres, no una persona. (Es la septima vez
-- que este revoke hace falta en el proyecto; por eso lo verifica el build.)
revoke all on function public.tg_descripcion_sin_promesas() from public, anon, authenticated;

revoke all on function public.descripcion_promete(text) from public, anon;
grant execute on function public.descripcion_promete(text) to authenticated, service_role;
