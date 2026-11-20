import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHalala, validDate, cleanText, validEmail } from '../functions/_lib/http.js';
import { verifyAccess, identify } from '../functions/_lib/auth.js';

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

test('cleanText / validEmail', () => {
  assert.equal(cleanText('  a\u0000b  ', 10), 'a b');
  assert.equal(cleanText('', 10), null);
  assert.ok(validEmail('a@b.com'));
  assert.ok(!validEmail('a@b'));
});

// توقيع حقيقي بمفتاح RSA مؤقت، والتحقق منه كما يفعل الموقع مع Cloudflare Access
async function setup() {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256' };
  const team = 'https://fam.cloudflareaccess.com';
  globalThis.fetch = async (url) => {
    assert.equal(url, team + '/cdn-cgi/access/certs');
    return new Response(JSON.stringify({ keys: [jwk] }));
  };
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const sign = async (payload, kid = 'k1') => {
    const head = b64({ alg: 'RS256', kid });
    const body = b64(payload);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(head + '.' + body));
    return head + '.' + body + '.' + Buffer.from(sig).toString('base64url');
  };
  const env = { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: 'aud1', OWNER_EMAIL: 'Owner@X.com' };
  const req = (tok) => new Request('https://s.pages.dev/api/data', { headers: { 'Cf-Access-Jwt-Assertion': tok } });
  const now = Math.floor(Date.now() / 1000);
  const good = { iss: team, aud: ['aud1'], email: 'Owner@x.com', exp: now + 60 };
  return { sign, env, req, good, now };
}

test('Access JWT', async () => {
  const { sign, env, req, good, now } = await setup();
  assert.equal(await verifyAccess(req(await sign(good)), env), 'owner@x.com');
  assert.deepEqual(await identify(req(await sign(good)), env), { email: 'owner@x.com', isOwner: true });
  assert.equal(await verifyAccess(req(await sign({ ...good, exp: now - 1 })), env), null, 'منتهي');
  assert.equal(await verifyAccess(req(await sign({ ...good, aud: ['other'] })), env), null, 'جمهور آخر');
  assert.equal(await verifyAccess(req(await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' })), env), null, 'مُصدر آخر');
  assert.equal(await verifyAccess(req(await sign(good, 'k2')), env), null, 'مفتاح مجهول');
  const t = await sign(good);
  const forged = t.split('.');
  forged[1] = Buffer.from(JSON.stringify({ ...good, email: 'evil@x.com' })).toString('base64url');
  assert.equal(await verifyAccess(req(forged.join('.')), env), null, 'محتوى معدّل');
  assert.equal(await verifyAccess(new Request('https://s.pages.dev/'), env), null, 'بلا رمز');
  // وضع التطوير لا يعمل بدون تفعيل صريح
  assert.equal(await identify(new Request('https://s.pages.dev/', { headers: { 'X-Dev-Email': 'owner@x.com' } }), env), null);
});
