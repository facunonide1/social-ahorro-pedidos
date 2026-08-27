-- 0112 · Los crons no calculan sobre datos de demostración (v0.81)
--
-- ── EL PROBLEMA ────────────────────────────────────────────────────────────
--
-- v0.80 encontró que el middleware mandaba todos los crons a /login: dieciséis
-- automatizaciones declaradas, cero ejecuciones, nunca. Se corrigió. La
-- consecuencia inmediata es que cuatro de ellas iban a arrancar a la mañana
-- siguiente a producir números sobre 7.620 ventas que no existen.
--
-- Un promedio calculado sobre datos inventados no se borra solo: queda guardado
-- por fecha, y dentro de tres meses nadie va a saber cuáles de esas filas eran
-- reales. Peor: alguien puede mirarlo y creerlo.
--
-- ── LA GUARDA ──────────────────────────────────────────────────────────────
--
-- No se les quita el agendado. Se les pone una condición: no corren mientras
-- sus fuentes tengan datos de demostración. Tres propiedades que se pidieron:
--
--   · reversible sin una sesión de código
--       update crons_calculo set forzar_encendido = true where cron = '...';
--   · visible, y con el motivo escrito
--       select cron, ultimo_resultado from crons_calculo;
--   · se enciende sola el día que haya datos reales
--       la condición se evalúa en cada corrida, no una vez.
--
-- Un cron que no está declarado en esta tabla corre: la guarda no es un
-- interruptor general, es una lista explícita de los que calculan.

create table if not exists public.crons_calculo (
  cron              text primary key,
  fuentes           text[] not null,
  motivo            text,
  forzar_encendido  boolean not null default false,
  ultima_evaluacion timestamptz,
  ultimo_resultado  text
);

comment on table public.crons_calculo is
  'Los crons que producen numeros guardados (metricas, rotacion, alertas, avisos). No corren mientras sus fuentes tengan datos de demostracion: un promedio calculado sobre ventas inventadas queda en un historico que despues nadie vuelve a mirar. Se auto-habilitan el dia que las fuentes queden limpias. Para forzar uno: update crons_calculo set forzar_encendido = true where cron = ...';

insert into public.crons_calculo (cron, fuentes, motivo) values
  ('metricas-nightly', array['tareas'],
   'Cumplimiento por sucursal y por empleado. Con tareas de demostracion en el medio, el porcentaje es falso y queda guardado por fecha.'),
  ('metricas-stock', array['movimientos_stock','stock_items'],
   'Rotacion y dias de stock restante. Se calcula sobre movimientos inventados.'),
  ('alertas-stock', array['stock_items','vencimientos','producto_rotacion'],
   'Alertas de quiebre y vencimiento sobre stock que no existe: manda a alguien a buscar mercaderia que nunca se perdio.'),
  ('nora-auditor', array['irregularidades_stock','vencimientos','arqueos_caja','clientes','ofertas','facturas_proveedor','transferencias_sucursal'],
   'El auditor emite avisos. Sobre datos de demostracion emite avisos de demostracion.')
on conflict (cron) do nothing;

create or replace function public.cron_calculo_puede_correr(p_cron text)
returns table (puede boolean, motivo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  t        text;
  n_demo   bigint;
  n_total  bigint;
  suma     bigint := 0;
  sucios   text[] := '{}';
begin
  select * into r from public.crons_calculo where cron = p_cron;

  if not found then
    return query select true, 'no declarado: corre'::text;
    return;
  end if;

  if r.forzar_encendido then
    update public.crons_calculo
       set ultima_evaluacion = now(), ultimo_resultado = 'forzado a mano'
     where cron = p_cron;
    return query select true, 'encendido a mano'::text;
    return;
  end if;

  foreach t in array r.fuentes loop
    execute format('select count(*), count(*) filter (where es_demo) from public.%I', t)
      into n_total, n_demo;
    suma := suma + n_total;
    if n_demo > 0 then
      sucios := sucios || format('%s (%s de %s)', t, n_demo, n_total);
    end if;
  end loop;

  if array_length(sucios, 1) > 0 then
    update public.crons_calculo
       set ultima_evaluacion = now(),
           ultimo_resultado = 'frenado: ' || array_to_string(sucios, ', ')
     where cron = p_cron;
    return query select false, ('todavia hay datos de demostracion en ' || array_to_string(sucios, ', '))::text;
    return;
  end if;

  if suma = 0 then
    update public.crons_calculo
       set ultima_evaluacion = now(), ultimo_resultado = 'frenado: fuentes vacias'
     where cron = p_cron;
    return query select false, 'no hay datos para calcular'::text;
    return;
  end if;

  update public.crons_calculo
     set ultima_evaluacion = now(), ultimo_resultado = 'corrio'
   where cron = p_cron;
  return query select true, 'fuentes limpias'::text;
end $$;
