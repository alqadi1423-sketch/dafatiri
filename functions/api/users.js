import { json, fail, readJson, cleanText } from '../_lib/http.js';
import { hashPassword, passwordProblem, validUsername } from '../_lib/password.js';

// إنشاء مستخدم لفرد من العائلة: للمالك وحده
export async function onRequestPost({ request, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');

  const username = String(body.username || '').trim().toLowerCase();
  if (!validUsername(username)) return fail('اسم المستخدم: 3 إلى 30 حرفًا إنجليزيًا صغيرًا أو أرقامًا، بلا مسافات');
  const name = cleanText(body.name, 40);
  if (!name) return fail('اكتب الاسم');
  const problem = passwordProblem(body.password);
  if (problem) return fail(problem);

  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?1').bind(username).first();
  if (exists) return fail('اسم المستخدم مستخدم من قبل');

  const user = await env.DB.prepare(
    `INSERT INTO users (username, name, pw) VALUES (?1, ?2, ?3)
     RETURNING id, username, name, is_owner, disabled`)
    .bind(username, name, await hashPassword(body.password)).first();
  return json({ user }, 201);
}
