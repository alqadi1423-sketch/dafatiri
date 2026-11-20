import { json, fail, readJson, toHalala, validDate, cleanText } from '../_lib/http.js';
import { levelFor, canRecord } from '../_lib/access.js';

// تسجيل حركة جديدة: للمالك ولمن له صلاحية التسجيل على الدفتر
export async function onRequestPost({ request, env, data }) {
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');

  const memberId = Number(body.member_id);
  if (!Number.isInteger(memberId) || memberId <= 0) return fail('اختر الاسم');

  const amount = toHalala(body.amount);
  if (!amount) return fail('اكتب مبلغًا صحيحًا أكبر من صفر، وبخانتين عشريتين على الأكثر');

  if (!validDate(body.date)) return fail('التاريخ غير صحيح');

  const note = cleanText(body.note, 200);

  const row = await env.DB.prepare(
    `SELECT m.id, m.ledger_id, l.config FROM members m JOIN ledgers l ON l.id = m.ledger_id WHERE m.id = ?1`)
    .bind(memberId).first();
  if (!row) return fail('الاسم غير موجود');
  if (!canRecord(await levelFor(env, data.user, row.ledger_id))) return fail('ليست لديك صلاحية التسجيل في هذا الدفتر', 403);

  const config = JSON.parse(row.config);
  const item = config.items.find((it) => it.label === body.item);
  if (!item) return fail('البند غير موجود في هذا الدفتر');

  const res = await env.DB.prepare(
    `INSERT INTO tx (ledger_id, member_id, date, item, col, amount, note, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     RETURNING id, ledger_id, member_id, date, item, col, amount, note, created_at`)
    .bind(row.ledger_id, memberId, body.date, item.label, item.col, amount, note, data.user.username)
    .first();

  return json({ tx: res }, 201);
}
