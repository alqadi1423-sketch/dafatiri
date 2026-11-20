import { json, fail } from '../../../_lib/http.js';

// التراجع عن حذف حركة: للمالك وحده
export async function onRequestPost({ params, env, data }) {
  if (!data.user.isOwner) return fail('للمالك فقط', 403);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('حركة غير موجودة', 404);
  const tx = await env.DB.prepare(
    `UPDATE tx SET deleted_at = NULL, deleted_by = NULL WHERE id = ?1 AND deleted_at IS NOT NULL
     RETURNING id, member_id, date, item, col, amount, note, created_at`).bind(id).first();
  if (!tx) return fail('حركة غير موجودة', 404);
  return json({ tx });
}
