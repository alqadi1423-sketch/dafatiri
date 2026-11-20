import { json, fail, readJson } from '../_lib/http.js';
import { hashPassword, verifyPassword, passwordProblem } from '../_lib/password.js';

// كل مستخدم يغيّر كلمة مروره بنفسه
export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');
  const row = await env.DB.prepare('SELECT pw FROM users WHERE id = ?1').bind(data.user.id).first();
  if (!row || !(await verifyPassword(String(body.current || ''), row.pw))) return fail('كلمة المرور الحالية غير صحيحة');
  const problem = passwordProblem(body.next);
  if (problem) return fail(problem);
  await env.DB.prepare('UPDATE users SET pw = ?2 WHERE id = ?1').bind(data.user.id, await hashPassword(body.next)).run();
  return json({ ok: true });
}
