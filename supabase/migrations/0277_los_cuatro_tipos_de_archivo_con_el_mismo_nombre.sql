-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0277 · LOS CUATRO TIPOS, CON EL MISMO NOMBRE EN LOS DOS LADOS           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- H.4 pide cuatro tipos de archivo: catalogo, ventas, liquidacion y errores.
--
-- `tipo_perfil_datos` tenia siete valores de antes —productos, stock, ventas,
-- clientes, ofertas, dif_stock, custom— y `archivo_importaciones.tipo` nacio
-- con los cuatro del enunciado. **Los dos lados usaban nombres distintos para
-- la misma cosa**, y `archivo_perfil_para` compara `tipo` con `tipo`: nunca
-- iba a encontrar un perfil de «catalogo» entre perfiles de «productos».
--
-- Es el error mas barato de cometer y el mas caro de encontrar: no falla,
-- simplemente no encuentra nunca y el formato aprendido no se aplica jamas.
-- La prueba lo mostro en la primera corrida.
--
-- Se agregan los tres que faltan al enum en vez de traducir entre los dos
-- vocabularios. Una tabla de traduccion entre «catalogo» y «productos» es una
-- cosa mas que se puede desincronizar.
--
-- (`productos` se deja: cinco perfiles del Centro de Datos ya lo usan.)

do $$ begin
  alter type tipo_perfil_datos add value if not exists 'catalogo';
exception when others then null; end $$;
do $$ begin
  alter type tipo_perfil_datos add value if not exists 'liquidacion';
exception when others then null; end $$;
do $$ begin
  alter type tipo_perfil_datos add value if not exists 'errores';
exception when others then null; end $$;
