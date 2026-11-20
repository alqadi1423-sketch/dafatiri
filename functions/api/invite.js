import { json, fail, readJson } from '../_lib/http.js';
import { sha256, startSession, tooManyFailures, recordFailure } from '../_lib/auth.js';
import { hashPassword, passwordProblem, validUsername } from '../_lib/password.js';

async function findInvite(env, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT i.token_hash, p.id AS person_id, p.name, p.user_id FROM invites i JOIN people p ON p.id = i.person_id
      WHERE i.token_hash = ?1 AND i.used_at IS NULL AND i.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now')`)
    .bind(await sha256(token)).first();
}

// يعرض اسم صاحب الدعوة قبل إنشاء الحساب
export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (await tooManyFailures(env, ['ip:' + ip])) return fail('محاولات كثيرة. انتظر 15 دقيقة.', 429);
  const inv = await findInvite(env, new URL(request.url).searchParams.get('t'));
  if (!inv || inv.user_id) {
    await recordFailure(env, ['ip:' + ip]);
    return fail('رابط الدعوة غير صالح أو انتهت مدته. اطلب رابطًا جديدًا.', 404);
  }
  return json({ name: inv.name });
}

// قبول الدعوة: إنشاء اسم مستخدم وكلمة مرور وربطهما بسجل الشخص
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (await tooManyFailures(env, ['ip:' + ip])) return fail('محاولات كثيرة. انتظر 15 دقيقة.', 429);

  const inv = await findInvite(env, body.token);
  if (!inv || inv.user_id) {
    await recordFailure(env, ['ip:' + ip]);
    return fail('رابط الدعوة غير صالح أو انتهت مدته. اطلب رابطًا جديدًا.', 404);
  }
  const username = String(body.username || '').trim().toLowerCase();
  if (!validUsername(username)) return fail('اسم المستخدم: 3 إلى 30 حرفًا إنجليزيًا صغيرًا أو أرقامًا، بلا مسافات');
  const problem = passwordProblem(body.password);
  if (problem) return fail(problem);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE username = ?1').bind(username).first()) {
    return fail('اسم المستخدم مأخوذ، اختر غيره');
  }

  const user = await env.DB.prepare('INSERT INTO users (username, name, pw) VALUES (?1, ?2, ?3) RETURNING id')
    .bind(username, inv.name, await hashPassword(body.password)).first();
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE invites SET used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE token_hash = ?1 AND used_at IS NULL`).bind(inv.token_hash),
    env.DB.prepare('UPDATE people SET user_id = ?2 WHERE id = ?1 AND user_id IS NULL').bind(inv.person_id, user.id),
  ]);
  if (!res[0].meta.changes || !res[1].meta.changes) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(user.id).run();
    return fail('استُخدم هذا الرابط من قبل', 409);
  }

  const cookie = await startSession(env, user.id);
  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookie },
  });
}
