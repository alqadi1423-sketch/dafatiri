// مستويات الصلاحية على الدفتر، من الأقل للأعلى
export const LEVELS = ['none', 'own', 'view', 'record', 'manage'];
const RANK = { none: 0, own: 1, view: 2, record: 3, manage: 4, owner: 5 };

export const canSeeAll = (lvl) => RANK[lvl] >= RANK.view;
export const canRecord = (lvl) => RANK[lvl] >= RANK.record;
export const canManage = (lvl) => RANK[lvl] >= RANK.manage;

// الشخص المرتبط بهذا المستخدم
export async function personOfUser(env, user) {
  if (user.isOwner) return null;
  return env.DB.prepare('SELECT id, name FROM people WHERE user_id = ?1').bind(user.id).first();
}

// صلاحية المستخدم على دفتر واحد
export async function levelFor(env, user, ledgerId) {
  if (user.isOwner) return 'owner';
  const row = await env.DB.prepare(
    `SELECT l.private, g.level FROM ledgers l
       JOIN people p ON p.user_id = ?1
       LEFT JOIN grants g ON g.ledger_id = l.id AND g.person_id = p.id
      WHERE l.id = ?2`).bind(user.id, ledgerId).first();
  if (!row || row.private) return 'none';
  return row.level || 'own';
}

// حفظ صلاحيات شخص: { ledgerId: level }. «حسابه فقط» هو الافتراضي فلا يُخزَّن.
export async function saveGrants(env, personId, grants) {
  if (!grants || typeof grants !== 'object' || Array.isArray(grants)) return 'بيانات الصلاحيات غير صالحة';
  const entries = Object.entries(grants);
  if (entries.length > 100) return 'بيانات الصلاحيات غير صالحة';
  const ids = new Set((await env.DB.prepare('SELECT id FROM ledgers').all()).results.map((l) => l.id));
  const ops = [];
  for (const [ledgerId, level] of entries) {
    if (!ids.has(ledgerId) || !LEVELS.includes(level)) return 'صلاحية غير صالحة';
    ops.push(level === 'own'
      ? env.DB.prepare('DELETE FROM grants WHERE person_id = ?1 AND ledger_id = ?2').bind(personId, ledgerId)
      : env.DB.prepare(`INSERT INTO grants (person_id, ledger_id, level) VALUES (?1, ?2, ?3)
                         ON CONFLICT(person_id, ledger_id) DO UPDATE SET level = excluded.level`).bind(personId, ledgerId, level));
  }
  if (ops.length) await env.DB.batch(ops);
  return null;
}
