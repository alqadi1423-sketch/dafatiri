import { json, fail, readJson, cleanText } from '../_lib/http.js';

// إضافة شخص إلى دفتر (فتح حساب له فيه): شخص موجود بـ person_id، أو شخص جديد بـ name. للمالك وحده.
export async function onRequestPost({ request, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');

  const ledger = await env.DB.prepare('SELECT id FROM ledgers WHERE id = ?1').bind(String(body.ledger_id || '')).first();
  if (!ledger) return fail('الدفتر غير موجود');
  const role = cleanText(body.role_label, 20);

  let person;
  if (body.person_id) {
    person = await env.DB.prepare('SELECT id, name FROM people WHERE id = ?1').bind(Number(body.person_id)).first();
    if (!person) return fail('الشخص غير موجود');
    const dup = await env.DB.prepare('SELECT 1 FROM members WHERE ledger_id = ?1 AND person_id = ?2').bind(ledger.id, person.id).first();
    if (dup) return fail('هذا الشخص موجود في الدفتر');
  } else {
    const name = cleanText(body.name, 40);
    if (!name) return fail('اكتب الاسم');
    const same = await env.DB.prepare('SELECT 1 FROM people WHERE name = ?1').bind(name).first();
    if (same) return fail('يوجد شخص بهذا الاسم. اختره من القائمة');
    person = await env.DB.prepare('INSERT INTO people (name) VALUES (?1) RETURNING id, name, user_id').bind(name).first();
  }

  const member = await env.DB.prepare(
    `INSERT INTO members (ledger_id, person_id, name, role_label, sort)
     VALUES (?1, ?2, ?3 || '#' || ?2, ?4, (SELECT COALESCE(MAX(sort), 0) + 1 FROM members WHERE ledger_id = ?1))
     RETURNING id, ledger_id, person_id, role_label, sort`)
    .bind(ledger.id, person.id, person.name, role).first();
  return json({ member, person }, 201);
}
