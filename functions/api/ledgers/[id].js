import { json, fail, readJson, cleanText } from '../../_lib/http.js';

// تغيير اسم الدفتر أو جعله خاصًا/مشتركًا: للمالك وحده
export async function onRequestPatch({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');
  const cur = await env.DB.prepare('SELECT id FROM ledgers WHERE id = ?1').bind(String(params.id)).first();
  if (!cur) return fail('الدفتر غير موجود', 404);

  if ('name' in body) {
    const name = cleanText(body.name, 60);
    if (!name) return fail('اكتب اسم الدفتر');
    await env.DB.prepare('UPDATE ledgers SET name = ?2 WHERE id = ?1').bind(cur.id, name).run();
  }
  if ('private' in body) {
    await env.DB.prepare('UPDATE ledgers SET private = ?2 WHERE id = ?1').bind(cur.id, body.private ? 1 : 0).run();
  }
  const l = await env.DB.prepare('SELECT id, name, sort, private, config FROM ledgers WHERE id = ?1').bind(cur.id).first();
  return json({ ledger: { ...l, private: !!l.private, config: JSON.parse(l.config) } });
}
