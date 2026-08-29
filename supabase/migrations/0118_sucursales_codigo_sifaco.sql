-- 0118 · Las cuatro sucursales, con su código de SIFACO (v0.83)
--
-- tabla3e confirma que SIFACO las llama GUZ, FIG, ARA y TES. NORA las llama
-- Sucursal Central, Norte, Sur y Este, con códigos SA-01 a SA-04.
--
-- NO SE ASIGNA EL CRUCE. «Sucursal Central» no dice si es GUZ o si es FIG, y
-- adivinarlo por el volumen de stock sería inventar: si el cruce queda mal, el
-- día que llegue el tabla3e completo el stock de cada sucursal entra cambiado y
-- nadie lo va a notar hasta que alguien vaya al depósito.
--
-- La columna queda declarada y vacía. La llena una persona, con una línea:
--   update sucursales set codigo_sifaco = 'GUZ' where codigo = 'SA-01';
--
-- Esto es lo que pide B.6: el modelo preparado para abrir por sucursal sin
-- rehacer nada, el día que SIFACO exporte tabla3e completo.

alter table public.sucursales
  add column if not exists codigo_sifaco text;

create unique index if not exists sucursales_codigo_sifaco_key
  on public.sucursales(codigo_sifaco) where codigo_sifaco is not null;

comment on column public.sucursales.codigo_sifaco is
  'GUZ, FIG, ARA o TES: como llama SIFACO a cada sucursal en tabla3e. Queda NULL hasta que una persona diga cual es cual — NORA no lo puede deducir de "Sucursal Central".';

create table if not exists public.sifaco_sucursales (
  codigo text primary key,
  stock_muestra integer,
  nota text
);

insert into public.sifaco_sucursales (codigo, stock_muestra, nota) values
  ('GUZ', 12907, 'stock en la muestra tabla3e (seccion Z47), no es el total'),
  ('FIG', 10466, null),
  ('ARA', 1199,  null),
  ('TES', 2342,  null)
on conflict (codigo) do nothing;

comment on table public.sifaco_sucursales is
  'Los cuatro codigos de sucursal que usa SIFACO, declarados. El cruce contra public.sucursales va en sucursales.codigo_sifaco y lo decide una persona: los nombres de NORA (Central, Norte, Sur, Este) no dicen cual es cual.';
