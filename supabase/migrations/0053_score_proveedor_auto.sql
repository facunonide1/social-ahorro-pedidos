-- 0053 · Score automático de proveedor (0-10) desde proveedor_score_eventos.
create or replace function public.recalcular_score_proveedor(prov uuid)
returns void language plpgsql as $fn$
declare s numeric;
begin
  select greatest(0, round(10 - avg(
    case tipo when 'ok' then 0 when 'entrega_tarde' then 3 when 'faltante' then 4
              when 'danado' then 3 when 'frio_roto' then 5 else 0 end * peso), 1))
  into s from public.proveedor_score_eventos where proveedor_id = prov;
  update public.proveedores set score_actual = s where id = prov;
end $fn$;
create or replace function public.tg_score_evento()
returns trigger language plpgsql as $fn$
begin perform public.recalcular_score_proveedor(NEW.proveedor_id); return NEW; end $fn$;
drop trigger if exists score_evento_recalc on public.proveedor_score_eventos;
create trigger score_evento_recalc after insert on public.proveedor_score_eventos
  for each row execute function public.tg_score_evento();
