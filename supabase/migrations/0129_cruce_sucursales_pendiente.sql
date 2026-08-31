-- 0129 · El cruce de sucursales, preparado y SIN aplicar (v0.85)
--
-- SIFACO llama a las sucursales GUZ, FIG, ARA y TES. NORA las llama Central,
-- Norte, Sur y Este, con códigos SA-01 a SA-04.
--
-- NO SE DEDUCE. «Sucursal Central» no dice si es GUZ o si es FIG, y el stock de
-- la muestra tampoco alcanza: si el cruce queda mal, el día que llegue tabla3e
-- completo el stock de cada sucursal entra cambiado y nadie lo nota hasta que
-- alguien va al depósito y no encuentra lo que el sistema decía.
--
-- Los cuatro `update` quedan escritos. Cuando Facundo diga cuál es cuál, se
-- descomenta el correcto y listo — no hace falta una sesión de código.
--
--   SIFACO   stock en la muestra tabla3e (sección Z47)
--   GUZ      12.907
--   FIG      10.466
--   TES       2.342
--   ARA       1.199
--
-- Para verificar que quedó bien después de asignarlo:
--   select nombre, codigo, codigo_sifaco from sucursales order by nombre;

-- update public.sucursales set codigo_sifaco = 'GUZ' where codigo = 'SA-01';
-- update public.sucursales set codigo_sifaco = 'FIG' where codigo = 'SA-02';
-- update public.sucursales set codigo_sifaco = 'ARA' where codigo = 'SA-03';
-- update public.sucursales set codigo_sifaco = 'TES' where codigo = 'SA-04';

-- Mientras tanto, que la pantalla lo pueda decir sin adivinar.
comment on column public.sucursales.codigo_sifaco is
  'GUZ, FIG, ARA o TES. NULO a proposito: nadie dijo todavia cual es cual, y deducirlo por volumen de stock seria inventar. Los cuatro update estan escritos en la migracion 0129.';
