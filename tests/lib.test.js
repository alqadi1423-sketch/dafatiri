import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHalala, validDate, cleanText } from '../functions/_lib/http.js';
import { hashPassword, verifyPassword, passwordProblem, validUsername } from '../functions/_lib/password.js';

test('toHalala', () => {
  assert.equal(toHalala('30'), 3000);
  assert.equal(toHalala('10.5'), 1050);
  assert.equal(toHalala('0.01'), 1);
  assert.equal(toHalala(875000), 87500000);
  for (const bad of ['0', '-5', '1.234', 'abc', '', '1e5', '1,000', null]) assert.equal(toHalala(bad), null, String(bad));
});

test('validDate', () => {
  assert.ok(validDate('2026-11-20'));
  assert.ok(!validDate('2026-02-30'));
  assert.ok(!validDate('20-11-2026'));
});

test('cleanText', () => {
  assert.equal(cleanText('  a\u0000b  ', 10), 'a b');
  assert.equal(cleanText('', 10), null);
});

test('كلمات المرور', async () => {
  const stored = await hashPassword('سر-عائلي-123');
  assert.match(stored, /^pbkdf2\$100000\$/);
  assert.ok(await verifyPassword('سر-عائلي-123', stored));
  assert.ok(!(await verifyPassword('سر-عائلي-124', stored)));
  assert.ok(!(await verifyPassword('x', 'garbage')));
  assert.notEqual(await hashPassword('same-pass'), await hashPassword('same-pass'), 'ملح مختلف');
  assert.ok(passwordProblem('short'));
  assert.equal(passwordProblem('long-enough'), null);
  assert.ok(validUsername('mona.q'));
  assert.ok(!validUsername('Mona'));
  assert.ok(!validUsername('م'));
});
