import { json, fail, readJson } from '../../../_lib/http.js';
import { saveGrants } from '../../../_lib/access.js';

// تغيير صلاحيات شخص على الدفاتر: للمالك وحده
export async function onRequestPut({ request, params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const person = await env.DB.prepare('SELECT id FROM people WHERE id = ?1').bind(Number(params.id)).first();
  if (!person) return fail('الشخص غير موجود', 404);
  const body = await readJson(request);
  const problem = await saveGrants(env, person.id, body && body.grants);
  if (problem) return fail(problem);
  const rows = await env.DB.prepare('SELECT person_id, ledger_id, level FROM grants WHERE person_id = ?1').bind(person.id).all();
  return json({ grants: rows.results });
}
