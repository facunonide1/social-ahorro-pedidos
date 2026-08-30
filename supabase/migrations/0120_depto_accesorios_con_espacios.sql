-- 0120 · «Accesorios / Varios», con espacios (v0.83)
--
-- El relevamiento lo transcribió como «Accesorios/Varios». El archivo lo
-- escribe con espacios alrededor de la barra. Son 1.439 productos que habrían
-- caído en la categoría «otros» sin que nadie se enterara: la traducción no
-- falla, simplemente no encuentra y usa el default.
--
-- Lo cazó la vista previa, que cuenta los departamentos sin declarar antes de
-- aplicar. Es la segunda vez en esta sesión que ese contador evita un dato mal
-- cargado en silencio — la primera fueron tres niveles de control.

insert into public.sifaco_depto_categoria (nom_depto, categoria, nota) values
  ('Accesorios / Varios', 'otros', 'el archivo lo escribe con espacios; el relevamiento lo transcribio sin ellos')
on conflict (nom_depto) do nothing;
