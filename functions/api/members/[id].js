import { json, fail, readJson, validEmail } from '../../_lib/http.js';

// ربط حساب ببريد فرد من العائلة (أو فكّه بإرسال بريد فارغ): للمالك وحده
export async function onRequestPatch({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('الاسم غير موجود', 404);

  const body = await readJson(request);
  if (!body || !('email' in body)) return fail('بيانات غير صالحة');

  let email = String(body.email || '').trim().toLowerCase();
  if (email && !validEmail(email)) return fail('البريد غير صحيح');
  if (!email) email = null;

  const row = await env.DB.prepare('SELECT m.id, l.private FROM members m JOIN ledgers l ON l.id = m.ledger_id WHERE m.id = ?1')
    .bind(id).first();
  if (!row) return fail('الاسم غير موجود', 404);
  if (row.private && email) return fail('الدفتر الخاص لا يُربط بأحد');

  const member = await env.DB.prepare(
    'UPDATE members SET email = ?2 WHERE id = ?1 RETURNING id, ledger_id, name, role_label, email, sort')
    .bind(id, email).first();
  return json({ member });
}
