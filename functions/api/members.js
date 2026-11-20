import { json, fail, readJson, cleanText } from '../_lib/http.js';

// إضافة اسم جديد (فتح حساب) في دفتر: للمالك وحده
export async function onRequestPost({ request, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');

  const name = cleanText(body.name, 40);
  if (!name) return fail('اكتب الاسم');
  const role = cleanText(body.role_label, 20);

  const ledger = await env.DB.prepare('SELECT id FROM ledgers WHERE id = ?1').bind(String(body.ledger_id || '')).first();
  if (!ledger) return fail('الدفتر غير موجود');

  const exists = await env.DB.prepare('SELECT id FROM members WHERE ledger_id = ?1 AND name = ?2')
    .bind(ledger.id, name).first();
  if (exists) return fail('هذا الاسم موجود في الدفتر');

  const member = await env.DB.prepare(
    `INSERT INTO members (ledger_id, name, role_label, sort)
     VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(sort), 0) + 1 FROM members WHERE ledger_id = ?1))
     RETURNING id, ledger_id, name, role_label, user_id, sort`)
    .bind(ledger.id, name, role).first();
  return json({ member }, 201);
}
