import { json, fail, readJson } from '../../_lib/http.js';
import { hashPassword, passwordProblem } from '../../_lib/password.js';
import { endAllSessions } from '../../_lib/auth.js';

// تعيين كلمة مرور جديدة لفرد، أو إيقافه وتفعيله: للمالك وحده، ولا يمس حساب المالك نفسه
export async function onRequestPatch({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const id = Number(params.id);
  const body = await readJson(request);
  if (!body || !Number.isInteger(id)) return fail('بيانات غير صالحة');

  const target = await env.DB.prepare('SELECT id, is_owner FROM users WHERE id = ?1').bind(id).first();
  if (!target) return fail('المستخدم غير موجود', 404);
  if (target.is_owner) return fail('غيّر كلمة مرورك من «كلمة المرور» في أعلى الصفحة');

  if ('password' in body) {
    const problem = passwordProblem(body.password);
    if (problem) return fail(problem);
    await env.DB.prepare('UPDATE users SET pw = ?2 WHERE id = ?1').bind(id, await hashPassword(body.password)).run();
    await endAllSessions(env, id);
  }
  if ('disabled' in body) {
    await env.DB.prepare('UPDATE users SET disabled = ?2 WHERE id = ?1').bind(id, body.disabled ? 1 : 0).run();
    if (body.disabled) await endAllSessions(env, id);
  }
  const user = await env.DB.prepare('SELECT id, username, name, is_owner, disabled FROM users WHERE id = ?1').bind(id).first();
  return json({ user });
}
