import { json } from '../_lib/http.js';
import { canSeeAll, personOfUser } from '../_lib/access.js';

const parseLedger = (l, level) => ({
  id: l.id, name: l.name, sort: l.sort, private: !!l.private, config: JSON.parse(l.config), level,
});
const marks = (n) => Array.from({ length: n }, (_, i) => '?' + (i + 1)).join(',');

// المالك يرى كل شيء. غيره يرى بحسب صلاحيته على كل دفتر:
// حسابه فقط، أو الدفتر كاملًا (مع التسجيل أو الإدارة إن مُنح ذلك).
export async function onRequestGet({ env, data }) {
  const { user } = data;
  const db = env.DB;
  const me = { username: user.username, name: user.name, isOwner: user.isOwner };

  if (user.isOwner) {
    const [ledgers, people, members, tx, users, invites, grants] = await db.batch([
      db.prepare('SELECT id, name, sort, private, config FROM ledgers ORDER BY sort'),
      db.prepare('SELECT id, name, user_id FROM people ORDER BY name'),
      db.prepare('SELECT id, ledger_id, person_id, role_label, sort FROM members ORDER BY ledger_id, sort, id'),
      db.prepare(`SELECT id, member_id, date, item, col, amount, note, created_at
                    FROM tx WHERE deleted_at IS NULL ORDER BY date, id`),
      db.prepare('SELECT id, username, name, is_owner, disabled FROM users ORDER BY id'),
      db.prepare(`SELECT person_id, expires_at FROM invites
                   WHERE used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now')`),
      db.prepare('SELECT person_id, ledger_id, level FROM grants'),
    ]);
    return json({
      me,
      ledgers: ledgers.results.map((l) => parseLedger(l, 'owner')),
      people: people.results,
      members: members.results,
      tx: tx.results,
      users: users.results,
      invites: invites.results,
      grants: grants.results,
    });
  }

  const empty = { me, ledgers: [], people: [], members: [], tx: [] };
  const person = await personOfUser(env, user);
  if (!person) return json(empty);
  me.personId = person.id;

  const [ledgerRows, grantRows, mine] = await db.batch([
    db.prepare('SELECT id, name, sort, private, config FROM ledgers WHERE private = 0 ORDER BY sort'),
    db.prepare('SELECT ledger_id, level FROM grants WHERE person_id = ?1').bind(person.id),
    db.prepare('SELECT ledger_id FROM members WHERE person_id = ?1').bind(person.id),
  ]);
  const grant = Object.fromEntries(grantRows.results.map((g) => [g.ledger_id, g.level]));
  const hasAccount = new Set(mine.results.map((m) => m.ledger_id));

  const ledgers = [];
  for (const l of ledgerRows.results) {
    const level = grant[l.id] || 'own';
    if (canSeeAll(level) || (level === 'own' && hasAccount.has(l.id))) ledgers.push(parseLedger(l, level));
  }
  if (!ledgers.length) return json(empty);

  const fullIds = ledgers.filter((l) => canSeeAll(l.level)).map((l) => l.id);
  const ownIds = ledgers.filter((l) => l.level === 'own').map((l) => l.id);
  const conds = [];
  const args = [];
  if (fullIds.length) { conds.push(`m.ledger_id IN (${marks(fullIds.length)})`); args.push(...fullIds); }
  if (ownIds.length) {
    const start = args.length;
    conds.push(`(m.person_id = ?${start + 1} AND m.ledger_id IN (${ownIds.map((_, i) => '?' + (start + 2 + i)).join(',')}))`);
    args.push(person.id, ...ownIds);
  }
  const where = conds.join(' OR ');

  const [members, tx, people] = await db.batch([
    db.prepare(`SELECT m.id, m.ledger_id, m.person_id, m.role_label, m.sort FROM members m WHERE ${where}`).bind(...args),
    db.prepare(`SELECT t.id, t.member_id, t.date, t.item, t.col, t.amount, t.note, t.created_at
                  FROM tx t JOIN members m ON m.id = t.member_id
                 WHERE t.deleted_at IS NULL AND (${where}) ORDER BY t.date, t.id`).bind(...args),
    db.prepare(`SELECT DISTINCT p.id, p.name FROM people p JOIN members m ON m.person_id = p.id WHERE ${where}`).bind(...args),
  ]);
  return json({ me, ledgers, people: people.results, members: members.results, tx: tx.results });
}
