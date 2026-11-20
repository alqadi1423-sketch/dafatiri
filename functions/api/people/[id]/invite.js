import { json, fail, readJson } from '../../../_lib/http.js';
import { saveGrants } from '../../../_lib/access.js';
import { sha256, randomToken } from '../../../_lib/auth.js';

const DAYS = 14;

// رابط دعوة لمرة واحدة، صالح 14 يومًا، مع صلاحياته. إصدار رابط جديد يلغي السابق.
export async function onRequestPost({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const person = await env.DB.prepare('SELECT id, user_id FROM people WHERE id = ?1').bind(Number(params.id)).first();
  if (!person) return fail('الشخص غير موجود', 404);
  if (person.user_id) return fail('هذا الشخص مرتبط بحساب من قبل');

  // الصلاحيات تُحدَّد مع الدعوة (اختياري)
  const body = (request.headers.get('Content-Type') || '').startsWith('application/json') ? await readJson(request) : null;
  if (body && body.grants) {
    const problem = await saveGrants(env, person.id, body.grants);
    if (problem) return fail(problem);
  }

  const token = randomToken();
  const expires = new Date(Date.now() + DAYS * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  await env.DB.batch([
    env.DB.prepare(`UPDATE invites SET used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE person_id = ?1 AND used_at IS NULL`).bind(person.id),
    env.DB.prepare('INSERT INTO invites (token_hash, person_id, expires_at) VALUES (?1, ?2, ?3)').bind(await sha256(token), person.id, expires),
  ]);
  return json({ url: `${new URL(request.url).origin}/#/invite/${token}`, expires_at: expires });
}
