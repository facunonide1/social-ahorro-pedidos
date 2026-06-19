/**
 * NORA en el chat (Comunicación interna · T3).
 *
 * Responde @NORA con datos reales del sistema. Hoy cubre stock de un producto
 * (total góndola+depósito, opcionalmente por sucursal) y detecta problemas
 * (faltante/vencido/corrección) sugiriendo crear una tarea como mensaje-acción.
 * Reutilizable: se puede extender con más intenciones (deuda, ventas, etc.).
 */

type Adm = any
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "")

export type NoraRespuesta = { texto: string; entidad?: any; acciones?: any[] }

export async function responderNora(adm: Adm, contenido: string, canalId: string): Promise<NoraRespuesta | null> {
  const texto = contenido.replace(/@nora/gi, '').trim()
  const t = norm(texto)

  // ¿menciona una sucursal? (código tipo SA-03 o nombre)
  const { data: sucs } = await adm.from('sucursales').select('id, nombre, codigo')
  const suc = ((sucs ?? []) as any[]).find((s) => (s.codigo && t.includes(norm(s.codigo))) || (s.nombre && t.includes(norm(s.nombre))))

  // intención stock: buscar un producto del catálogo nombrado en el texto
  const esStock = /\bstock\b|cu[aá]nto hay|cuantas? quedan|existencias?/i.test(texto) || true
  if (esStock) {
    const { data: prods } = await adm.from('productos_catalogo').select('id, nombre, sku').eq('activo', true).limit(20000)
    const palabras = t.split(/[^a-z0-9]+/).filter((w: string) => w.length >= 4)
    const match = ((prods ?? []) as any[]).find((p) => {
      const n = norm(p.nombre)
      return palabras.some((w: string) => n.includes(w))
    })
    if (match) {
      let q = adm.from('stock_items').select('sucursal_id, cantidad, cantidad_gondola, cantidad_deposito').eq('producto_id', match.id)
      if (suc) q = q.eq('sucursal_id', suc.id)
      const { data: items } = await q
      const total = ((items ?? []) as any[]).reduce((a, s) => a + Number(s.cantidad ?? 0), 0)
      const gond = ((items ?? []) as any[]).reduce((a, s) => a + Number(s.cantidad_gondola ?? 0), 0)
      const dep = ((items ?? []) as any[]).reduce((a, s) => a + Number(s.cantidad_deposito ?? 0), 0)
      const donde = suc ? ` en ${suc.nombre}` : ' (todas las sucursales)'
      const problema = /\bfalta|faltan|faltante|vencid|roto|rota|corregir|correcci[oó]n|mal\b/i.test(texto)
      const acciones = problema ? [{ label: 'Crear tarea', accion: 'crear_tarea', payload: { titulo: `Revisar ${match.nombre}${suc ? ` en ${suc.nombre}` : ''}`, sucursal_id: suc?.id ?? null } }] : null
      return {
        texto: `📦 Stock de ${match.nombre}${donde}: ${total} u. (góndola ${gond} · depósito ${dep}).${problema ? ' Detecté un posible problema — ¿creo una tarea?' : ''}`,
        entidad: { tipo: 'producto', id: match.id, nombre: match.nombre },
        acciones,
      }
    }
  }

  return { texto: 'Soy NORA 👋. Por ahora puedo traerte el stock de un producto (ej. "@NORA stock de ibuprofeno en SA-03"). Pronto: deuda de proveedores, ventas y más.' }
}
