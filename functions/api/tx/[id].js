import { json, fail } from '../../_lib/http.js';

// حذف حركة: للمالك وحده، والحذف منطقي (يبقى أثره في قاعدة البيانات)
export async function onRequestDelete({ params, env, data }) {
  if (!data.user.isOwner) return fail('الحذف للمالك فقط', 403);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('حركة غير موجودة', 404);

  const res = await env.DB.prepare(
    `UPDATE tx SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), deleted_by = ?2
      WHERE id = ?1 AND deleted_at IS NULL`)
    .bind(id, data.user.email).run();
  if (!res.meta.changes) return fail('حركة غير موجودة', 404);
  return json({ ok: true });
}
