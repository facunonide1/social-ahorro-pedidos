import assert from 'node:assert/strict'
import { test } from 'node:test'

// @ts-ignore: módulo .mjs sin tipos
import { auditar, sentencias } from './auditar-definer.mjs'

const fn = (nombre: string, extra = 'security definer', ret = 'void') =>
  `create or replace function public.${nombre}(p int) returns ${ret} language plpgsql ${extra} as $$ begin perform 1; select 2; end; $$;`
const corre = (...sqls: string[]) => auditar(sqls.map((sql, i) => ({ nombre: `${String(i).padStart(4, '0')}_x.sql`, sql })))
const nombres = (h: { funcion: string }[]) => h.map((x) => x.funcion)

test('los cuerpos con dólar no se parten en sus ;', () => {
  assert.equal(sentencias(fn('a') + 'revoke all on function public.a(int) from public, anon;').length, 2)
  assert.equal(sentencias("create function f() returns void as $body$ select ';'; $body$; select 1;").length, 2)
})

test('una definer sin revoke queda marcada', () => {
  assert.deepEqual(nombres(corre(fn('abierta'))), ['abierta'])
})

test('revoke de public y anon después del último create: bien', () => {
  assert.deepEqual(corre(fn('f'), 'revoke all on function public.f(int) from public, anon, authenticated;'), [])
})

test('el revoke ANTES del último create no sirve (pasó cuatro veces)', () => {
  assert.deepEqual(nombres(corre(fn('f') + 'revoke all on function public.f(int) from public, anon;', fn('f'))), ['f'])
})

test('revocar sólo de public no alcanza', () => {
  assert.deepEqual(nombres(corre(fn('f'), 'revoke execute on function public.f(int) from public;')), ['f'])
})

test('un grant a anon después del revoke la vuelve a abrir', () => {
  const h = corre(fn('f'), 'revoke all on function public.f(int) from public, anon;', 'grant execute on function public.f(int) to anon;')
  assert.match(h[0]?.por_que ?? '', /grant a anon/)
})

test('security invoker no se audita; alter … security definer sí', () => {
  assert.deepEqual(corre(fn('i', 'security invoker')), [])
  assert.deepEqual(nombres(corre(fn('i', ''), 'alter function public.i(int) security definer;')), ['i'])
})

test('el bloque de la 0228 cierra las funciones de trigger que ya existían', () => {
  const do228 = `do $$ declare r record; begin for r in select p.oid::regprocedure as f from pg_proc p where p.prorettype = 'trigger'::regtype loop execute format('revoke all on function %s from public, anon, authenticated', r.f); end loop; end $$;`
  assert.deepEqual(corre(fn('tg', 'security definer', 'trigger'), do228), [])
  // Una de trigger creada DESPUÉS del bloque sigue abierta.
  assert.deepEqual(nombres(corre(do228, fn('tg2', 'security definer', 'trigger'))), ['tg2'])
})

test('una función borrada no se reporta', () => {
  assert.deepEqual(corre(fn('f'), 'drop function if exists public.f(int);'), [])
})

test('los comentarios no cuentan como revoke', () => {
  assert.deepEqual(nombres(corre(fn('f'), '-- revoke all on function public.f(int) from public, anon;')), ['f'])
})
