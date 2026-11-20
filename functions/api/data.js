import { json } from '../_lib/http.js';

// المالك يرى كل شيء. فرد العائلة يرى فقط الحسابات المربوطة به في الدفاتر غير الخاصة.
export async function onRequestGet({ env, data }) {
  const { user } = data;
  const db = env.DB;

  if (user.isOwner) {
    const [ledgers, members, tx, users] = await db.batch([
      db.prepare('SELECT id, name, sort, private, config FROM ledgers ORDER BY sort'),
      db.prepare('SELECT id, ledger_id, name, role_label, user_id, sort FROM members ORDER BY ledger_id, sort, id'),
      db.prepare(`SELECT id, ledger_id, member_id, date, item, col, amount, note, created_at
                  FROM tx WHERE deleted_at IS NULL ORDER BY date, id`),
      db.prepare('SELECT id, username, name, is_owner, disabled FROM users ORDER BY is_owner DESC, id'),
    ]);
    return json({
      me: { username: user.username, name: user.name, isOwner: true },
      users: users.results,
      ledgers: ledgers.results.map(parseLedger),
      members: members.results,
      tx: tx.results,
    });
  }

  const mine = await db.prepare(
    `SELECT m.id, m.ledger_id, m.name, m.role_label, m.sort
       FROM members m JOIN ledgers l ON l.id = m.ledger_id
      WHERE l.private = 0 AND m.user_id = ?1
      ORDER BY l.sort, m.sort`).bind(user.id).all();
  const members = mine.results;
  if (!members.length) {
    return json({ me: { username: user.username, name: user.name, isOwner: false }, ledgers: [], members: [], tx: [] });
  }

  const ids = members.map((m) => m.id);
  const ledgerIds = [...new Set(members.map((m) => m.ledger_id))];
  const marks = (n, start) => Array.from({ length: n }, (_, i) => '?' + (i + start)).join(',');

  const [ledgers, tx] = await db.batch([
    db.prepare(`SELECT id, name, sort, private, config FROM ledgers WHERE private = 0 AND id IN (${marks(ledgerIds.length, 1)}) ORDER BY sort`)
      .bind(...ledgerIds),
    db.prepare(`SELECT id, ledger_id, member_id, date, item, col, amount, note, created_at
                  FROM tx WHERE deleted_at IS NULL AND member_id IN (${marks(ids.length, 1)}) ORDER BY date, id`)
      .bind(...ids),
  ]);

  return json({
    me: { username: user.username, name: user.name, isOwner: false },
    ledgers: ledgers.results.map(parseLedger),
    members,
    tx: tx.results,
  });
}

function parseLedger(l) {
  return { id: l.id, name: l.name, sort: l.sort, private: !!l.private, config: JSON.parse(l.config) };
}
