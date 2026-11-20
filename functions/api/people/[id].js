import { json, fail, readJson, cleanText } from '../../_lib/http.js';

// تغيير اسم الشخص، أو دمجه في شخص آخر (نقل كل حساباته إليه): للمالك وحده
export async function onRequestPatch({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const id = Number(params.id);
  const body = await readJson(request);
  if (!body || !Number.isInteger(id)) return fail('بيانات غير صالحة');
  const person = await env.DB.prepare('SELECT id, name, user_id FROM people WHERE id = ?1').bind(id).first();
  if (!person) return fail('الشخص غير موجود', 404);

  if ('merge_into' in body) {
    const target = await env.DB.prepare('SELECT id, name, user_id FROM people WHERE id = ?1').bind(Number(body.merge_into)).first();
    if (!target || target.id === person.id) return fail('اختر شخصًا آخر');
    const clash = await env.DB.prepare(
      `SELECT l.name FROM members a JOIN members b ON a.ledger_id = b.ledger_id JOIN ledgers l ON l.id = a.ledger_id
        WHERE a.person_id = ?1 AND b.person_id = ?2 LIMIT 1`).bind(person.id, target.id).first();
    if (clash) return fail(`لكليهما حساب في «${clash.name}». لا يمكن الدمج`);
    if (person.user_id && target.user_id) return fail('كلاهما مرتبط بحساب دخول. افصل أحدهما أولًا');
    await env.DB.batch([
      env.DB.prepare('UPDATE members SET person_id = ?2 WHERE person_id = ?1').bind(person.id, target.id),
      env.DB.prepare(`INSERT OR IGNORE INTO grants (person_id, ledger_id, level)
                      SELECT ?2, ledger_id, level FROM grants WHERE person_id = ?1`).bind(person.id, target.id),
      env.DB.prepare('DELETE FROM grants WHERE person_id = ?1').bind(person.id),
      env.DB.prepare('UPDATE invites SET used_at = strftime(\'%Y-%m-%dT%H:%M:%SZ\',\'now\') WHERE person_id = ?1 AND used_at IS NULL').bind(person.id),
      env.DB.prepare('UPDATE people SET user_id = NULL WHERE id = ?1').bind(person.id),
      env.DB.prepare('UPDATE people SET user_id = COALESCE(user_id, ?2) WHERE id = ?1').bind(target.id, person.user_id),
      env.DB.prepare('DELETE FROM people WHERE id = ?1').bind(person.id),
    ]);
    return json({ merged: target.id });
  }

  const name = cleanText(body.name, 40);
  if (!name) return fail('اكتب الاسم');
  const same = await env.DB.prepare('SELECT 1 FROM people WHERE name = ?1 AND id != ?2').bind(name, id).first();
  if (same) return fail('يوجد شخص بهذا الاسم');
  const updated = await env.DB.prepare('UPDATE people SET name = ?2 WHERE id = ?1 RETURNING id, name, user_id').bind(id, name).first();
  return json({ person: updated });
}
