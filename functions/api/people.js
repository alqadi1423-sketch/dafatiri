import { json, fail, readJson, cleanText } from '../_lib/http.js';

// شخص جديد بلا دفتر بعد: للمالك وحده
export async function onRequestPost({ request, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const body = await readJson(request);
  const name = cleanText(body && body.name, 40);
  if (!name) return fail('اكتب الاسم');
  const same = await env.DB.prepare('SELECT 1 FROM people WHERE name = ?1').bind(name).first();
  if (same) return fail('يوجد شخص بهذا الاسم');
  const person = await env.DB.prepare('INSERT INTO people (name) VALUES (?1) RETURNING id, name, user_id').bind(name).first();
  return json({ person }, 201);
}
