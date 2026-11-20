import { json, fail } from '../../../_lib/http.js';
import { endAllSessions } from '../../../_lib/auth.js';

// فصل الشخص عن حساب الدخول: يوقف الحساب وتنتهي جلساته، ويبقى سجله كما هو
export async function onRequestPost({ params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const person = await env.DB.prepare('SELECT id, user_id FROM people WHERE id = ?1').bind(Number(params.id)).first();
  if (!person || !person.user_id) return fail('غير مرتبط بحساب', 404);
  await env.DB.batch([
    env.DB.prepare('UPDATE people SET user_id = NULL WHERE id = ?1').bind(person.id),
    env.DB.prepare('UPDATE users SET disabled = 1 WHERE id = ?1 AND is_owner = 0').bind(person.user_id),
  ]);
  await endAllSessions(env, person.user_id);
  return json({ ok: true });
}
