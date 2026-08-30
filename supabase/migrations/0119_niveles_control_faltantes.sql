-- 0119 · Tres niveles de control que el relevamiento no tenía (v0.83)
--
-- El informe decía cinco niveles y 3.625 productos. El archivo trae OCHO y
-- 3.649. Los tres que faltaban:
--
--   (Estupefaciente II)    1 producto
--   (Estupefaciente III)   9 productos
--   (Succinilcolina)      14 productos
--
-- Son 24 productos que, sin esto, entraban al catálogo como productos comunes.
-- Es terreno legal (regla de oro 9): la vista previa los detecta y frena el
-- aplicado antes de que eso pase — para eso estaba `psi_sin_mapear`.
--
-- (Succinilcolina) NO es una lista de ANMAT: es el nombre de una droga. SIFACO
-- la marca aparte, y eso alcanza para saber que esos catorce productos exigen
-- un circuito distinto, que es para lo que sirve la marca. La clasificación
-- legal la confirma el farmacéutico; NORA no la inventa.

insert into public.sifaco_nivel_control (psi_sifaco, nivel, orden, nota) values
  ('(Estupefaciente II)',  'estupefaciente_ii',  2, 'aparecio en el archivo del 28-ago-26: 1 producto'),
  ('(Estupefaciente III)', 'estupefaciente_iii', 3, 'aparecio en el archivo del 28-ago-26: 9 productos'),
  ('(Succinilcolina)',     'succinilcolina',     6, 'NO es una lista de ANMAT: es el nombre de una droga. SIFACO la marca aparte y por eso el producto exige un circuito distinto. La clasificacion legal la tiene que confirmar el farmaceutico: 14 productos')
on conflict (psi_sifaco) do nothing;

update public.sifaco_nivel_control set orden = 4 where psi_sifaco = '(Psicotrópico II)';
update public.sifaco_nivel_control set orden = 5 where psi_sifaco = '(Psicotrópico III)';
update public.sifaco_nivel_control set orden = 7 where psi_sifaco = '(Psicotrópico IV)';
update public.sifaco_nivel_control set orden = 8 where psi_sifaco = '(Venta Vigilada)';
