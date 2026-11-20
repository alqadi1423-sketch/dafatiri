import { json, fail, readJson } from '../../_lib/http.js';

// ربط حساب في دفتر بمستخدم من العائلة ليراه عند دخوله (أو فكّه بـ null): للمالك وحده
export async function onRequestPatch({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('الاسم غير موجود', 404);

  const body = await readJson(request);
  if (!body || !('user_id' in body)) return fail('بيانات غير صالحة');
  const userId = body.user_id === null || body.user_id === '' ? null : Number(body.user_id);

  const row = await env.DB.prepare('SELECT m.id, l.private FROM members m JOIN ledgers l ON l.id = m.ledger_id WHERE m.id = ?1')
    .bind(id).first();
  if (!row) return fail('الاسم غير موجود', 404);
  if (userId !== null) {
    if (row.private) return fail('الدفتر الخاص لا يُربط بأحد');
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?1 AND is_owner = 0').bind(userId).first();
    if (!u) return fail('المستخدم غير موجود');
  }

  const member = await env.DB.prepare(
    'UPDATE members SET user_id = ?2 WHERE id = ?1 RETURNING id, ledger_id, name, role_label, user_id, sort')
    .bind(id, userId).first();
  return json({ member });
}
