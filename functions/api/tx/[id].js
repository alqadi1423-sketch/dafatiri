import { json, fail } from '../../_lib/http.js';
import { levelFor, canManage } from '../../_lib/access.js';

// حذف حركة: للمالك ولمن له صلاحية الإدارة. الحذف منطقي، يبقى أثره ويمكن التراجع عنه.
export async function onRequestDelete({ params, env, data }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('حركة غير موجودة', 404);
  const row = await env.DB.prepare('SELECT ledger_id FROM tx WHERE id = ?1 AND deleted_at IS NULL').bind(id).first();
  if (!row) return fail('حركة غير موجودة', 404);
  if (!canManage(await levelFor(env, data.user, row.ledger_id))) return fail('ليست لديك صلاحية الحذف', 403);

  const res = await env.DB.prepare(
    `UPDATE tx SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), deleted_by = ?2
      WHERE id = ?1 AND deleted_at IS NULL`).bind(id, data.user.username).run();
  if (!res.meta.changes) return fail('حركة غير موجودة', 404);
  return json({ ok: true });
}
