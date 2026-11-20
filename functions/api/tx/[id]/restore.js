import { json, fail } from '../../../_lib/http.js';
import { levelFor, canManage } from '../../../_lib/access.js';

// التراجع عن حذف حركة: للمالك ولمن له صلاحية الإدارة
export async function onRequestPost({ params, env, data }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('حركة غير موجودة', 404);
  const row = await env.DB.prepare('SELECT ledger_id FROM tx WHERE id = ?1 AND deleted_at IS NOT NULL').bind(id).first();
  if (!row) return fail('حركة غير موجودة', 404);
  if (!canManage(await levelFor(env, data.user, row.ledger_id))) return fail('ليست لديك صلاحية', 403);
  const tx = await env.DB.prepare(
    `UPDATE tx SET deleted_at = NULL, deleted_by = NULL WHERE id = ?1 AND deleted_at IS NOT NULL
     RETURNING id, member_id, date, item, col, amount, note, created_at`).bind(id).first();
  if (!tx) return fail('حركة غير موجودة', 404);
  return json({ tx });
}
