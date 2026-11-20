import { json, fail, readJson, cleanText } from '../_lib/http.js';
import { KINDS } from '../_lib/kinds.js';

// إنشاء دفتر جديد: للمالك وحده
export async function onRequestPost({ request, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');
  const name = cleanText(body.name, 60);
  if (!name) return fail('اكتب اسم الدفتر');
  const kind = KINDS[body.kind];
  if (!kind) return fail('اختر نوع الدفتر');

  const id = 'l' + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const ledger = await env.DB.prepare(
    `INSERT INTO ledgers (id, name, sort, private, config)
     VALUES (?1, ?2, (SELECT COALESCE(MAX(sort), 0) + 1 FROM ledgers), ?3, ?4)
     RETURNING id, name, sort, private, config`)
    .bind(id, name, body.private ? 1 : 0, JSON.stringify(kind.config)).first();
  return json({ ledger: { ...ledger, private: !!ledger.private, config: JSON.parse(ledger.config) } }, 201);
}
