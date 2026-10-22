import { createAdminClient } from '@/lib/supabase/server'

/**
 * F.4 · QUÉ FALTA PARA EMPEZAR CON GENTE DE VERDAD.
 *
 * ── QUÉ ES ESTA PANTALLA ────────────────────────────────────────────────────
 *
 * El sistema está construido y vacío de personas. Esta pantalla es la lista de
 * lo que falta para que un lunes a la mañana cuatro encargados entren y
 * trabajen. No es un tutorial ni un onboarding: es un estado.
 *
 * ── LAS DOS REGLAS ──────────────────────────────────────────────────────────
 *
 * 1. Ningún paso se marca solo por existir la pantalla. Se marca cuando hay
 *    datos. «La pantalla de usuarios está hecha» no es «hay usuarios».
 *
 * 2. Lo que no se puede contar va en null y lo dice. Un paso que no se pudo
 *    verificar NO se muestra como hecho ni como pendiente: se muestra como no
 *    verificado, que es la verdad.
 *
 * Esta segunda regla es la que hace que valga la pena. Una lista de pendientes
 * que se pone verde sola es peor que no tener lista.
 */

export type EstadoPaso = 'hecho' | 'falta' | 'parcial' | 'no_se_pudo_saber'

export interface Paso {
  clave: string
  titulo: string
  /** Qué significa que esté hecho, en una línea. */
  que_es: string
  estado: EstadoPaso
  /** El número que respalda el estado. Null si no se pudo contar. */
  cuantos: number | null
  de_cuantos: number | null
  /** Qué hacer ahora. Vacío si está hecho. */
  que_hacer: string
  href: string
  /** Si bloquea a los que vienen después. */
  bloquea: boolean
}

const n = (x: unknown) => (x == null ? null : Number(x))

export async function primerDia(): Promise<{ pasos: Paso[]; listo: boolean }> {
  const adm = createAdminClient()

  const [
    sucs, usuarios, farmaceuticos, farmConMat, topes, maestros, lotes, resumen, config,
  ] = await Promise.all([
    adm.from('sucursales').select('id, nombre, es_ecommerce', { count: 'exact' }).eq('activa', true),
    adm.from('users_admin').select('id, rol, sucursal_id', { count: 'exact' }).eq('activo', true),
    adm.from('empleados').select('id', { count: 'exact', head: true })
      .eq('activo', true).eq('es_farmaceutico', true),
    adm.from('empleados').select('id', { count: 'exact', head: true })
      .eq('activo', true).eq('es_farmaceutico', true).not('matricula', 'is', null),
    adm.from('config_caja_sucursal').select('sucursal_id, tope_efectivo'),
    adm.from('sifaco_importaciones').select('aplicado_at')
      .not('aplicado_at', 'is', null).order('aplicado_at', { ascending: false }).limit(1),
    adm.rpc('vencimientos_avance', { p_sucursal: null }).maybeSingle(),
    adm.rpc('agentes_resumen', { p_sucursal: null }),
    adm.from('agente_config').select('agente, accion, nivel'),
  ])

  // Las físicas. El ecommerce no tiene caja ni encargado de mostrador: pedirle
  // un tope de efectivo sería un pendiente que nunca se puede cerrar.
  const fisicas = ((sucs.data ?? []) as any[]).filter((s) => !s.es_ecommerce)
  const pasos: Paso[] = []

  // ── 1 · EL MAESTRO ──────────────────────────────────────────────────────
  const ultimoMaestro = (maestros.data ?? [])[0]?.aplicado_at ?? null
  pasos.push({
    clave: 'maestro',
    titulo: 'El maestro de SIFACO, con las cuatro sucursales',
    que_es: 'Sin esto no hay catálogo, ni stock por sucursal, ni nada que los agentes puedan mirar.',
    estado: ultimoMaestro ? 'hecho' : 'falta',
    cuantos: ultimoMaestro ? 1 : 0, de_cuantos: 1,
    que_hacer: ultimoMaestro
      ? ''
      : 'Subir el maestro por sucursal y aplicarlo. Es lo primero: todo lo demás se apoya en esto.',
    href: '/admin/centro-datos/sifaco',
    bloquea: true,
  })

  // ── 2 · LAS PERSONAS ────────────────────────────────────────────────────
  //
  // Se cuentan los que NO son dueños: un sistema con cuatro super_admin y
  // nadie más no está en marcha, está en construcción.
  const todos = (usuarios.data ?? []) as any[]
  const operativos = todos.filter((u) => u.rol && u.rol !== 'super_admin')
  const conSucursal = operativos.filter((u) => u.sucursal_id)
  pasos.push({
    clave: 'usuarios',
    titulo: 'Las personas, con su rol y su sucursal',
    que_es: 'Cada encargado, cajero y repositor con su usuario. El rol y la sucursal deciden qué ve: sin sucursal, un encargado ve la cadena entera.',
    estado: operativos.length === 0 ? 'falta'
      : conSucursal.length < operativos.length ? 'parcial' : 'hecho',
    cuantos: conSucursal.length, de_cuantos: operativos.length || null,
    que_hacer: operativos.length === 0
      ? 'Crear los usuarios reales. Los nombres los pone el dueño; la pantalla ya exige rol y sucursal para los roles que lo necesitan.'
      : conSucursal.length < operativos.length
        ? `Hay ${operativos.length - conSucursal.length} persona(s) sin sucursal asignada.`
        : '',
    href: '/admin/configuracion/usuarios',
    bloquea: true,
  })

  // ── 3 · LOS FARMACÉUTICOS ───────────────────────────────────────────────
  //
  // Regla de oro 9: lo legal-farmacéutico no se toca. Sin matrícula cargada,
  // la cobertura no se puede controlar.
  const farm = n(farmaceuticos.count)
  const conMat = n(farmConMat.count)
  pasos.push({
    clave: 'farmaceuticos',
    titulo: 'Los farmacéuticos, con matrícula',
    que_es: 'Sin matrícula cargada no se puede controlar la cobertura, que es obligación legal y no es negociable.',
    estado: farm == null ? 'no_se_pudo_saber'
      : farm === 0 ? 'falta'
      : (conMat ?? 0) < farm ? 'parcial' : 'hecho',
    cuantos: conMat, de_cuantos: farm,
    que_hacer: farm == null
      ? 'No se pudo contar cuántos farmacéuticos hay. Revisar la ficha de empleados.'
      : farm === 0
        ? 'Marcar en cada ficha quién es farmacéutico y cargarle el número de matrícula.'
        : (conMat ?? 0) < farm
          ? `Hay ${farm - (conMat ?? 0)} farmacéutico(s) sin matrícula cargada.`
          : '',
    href: '/admin/rrhh/empleados',
    bloquea: false,
  })

  // ── 4 · LOS TOPES DE CAJA ───────────────────────────────────────────────
  const topesPorSuc = new Map(((topes.data ?? []) as any[]).map((t) => [t.sucursal_id, t.tope_efectivo]))
  const conTope = fisicas.filter((s) => topesPorSuc.get(s.id) != null)
  pasos.push({
    clave: 'topes',
    titulo: 'El tope de efectivo de cada sucursal',
    que_es: 'A partir de cuánto NORA avisa que hay que llevar plata a la caja fuerte. Sin tope, no avisa nunca.',
    estado: !fisicas.length ? 'no_se_pudo_saber'
      : conTope.length === 0 ? 'falta'
      : conTope.length < fisicas.length ? 'parcial' : 'hecho',
    cuantos: conTope.length, de_cuantos: fisicas.length || null,
    que_hacer: conTope.length < fisicas.length
      ? `Falta el tope de ${fisicas.filter((s) => topesPorSuc.get(s.id) == null).map((s) => s.nombre).join(', ')}. Vacío no es cero: vacío es «no avisa».`
      : '',
    href: '/admin/finanzas/caja',
    bloquea: false,
  })

  // ── 5 · LAS PRIMERAS 200 FECHAS ─────────────────────────────────────────
  const av = (lotes.data ?? null) as any
  const cargados = n(av?.cargados)
  const objetivo = n(av?.objetivo) ?? 200
  pasos.push({
    clave: 'vencimientos',
    titulo: 'Las primeras 200 fechas de vencimiento',
    que_es: 'Vigía no puede avisar de lo que vence si nadie le dijo cuándo vence. No hacen falta las 48.000: con las 200 que más rotan alcanza para que empiece.',
    estado: cargados == null ? 'no_se_pudo_saber'
      : cargados === 0 ? 'falta'
      : cargados < objetivo ? 'parcial' : 'hecho',
    cuantos: cargados, de_cuantos: objetivo,
    que_hacer: (cargados ?? 0) < objetivo
      ? 'Se cargan desde el celular, en el depósito, escaneando. Un producto sin fecha visible se saltea: una fecha inventada es peor que ninguna.'
      : '',
    href: '/admin/operaciones/vencimientos/cargar',
    bloquea: false,
  })

  // ── 6 · LOS AGENTES ─────────────────────────────────────────────────────
  //
  // No alcanza con que el elenco exista: los números que leen tienen que estar
  // calculados. Si nunca corrió el cálculo, los agentes hablan de la nada.
  const calculado = (resumen.data as any)?.calculado_at ?? null
  const niveles = ((config.data ?? []) as any[]).filter((c) => c.nivel && c.nivel !== 'nunca')
  pasos.push({
    clave: 'agentes',
    titulo: 'Los agentes, con sus números calculados',
    que_es: 'El resumen que leen los agentes se calcula una vez por día. Sin eso no dicen «no hay nada»: no dicen nada.',
    estado: !calculado ? 'falta' : niveles.length === 0 ? 'parcial' : 'hecho',
    cuantos: niveles.length, de_cuantos: null,
    que_hacer: !calculado
      ? 'Todavía no se calculó nunca. Corre solo a las 5 de la mañana, o al aplicar un maestro.'
      : niveles.length === 0
        ? 'Los números están. Falta decidir en qué nivel trabaja cada agente: todos arrancan en «sugiere».'
        : '',
    href: '/admin/configuracion/agentes',
    bloquea: false,
  })

  return { pasos, listo: pasos.every((p) => p.estado === 'hecho') }
}
