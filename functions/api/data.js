import { json } from '../_lib/http.js';

// المالك يرى كل شيء. فرد العائلة يرى فقط الحسابات المربوطة ببريده في الدفاتر غير الخاصة.
export async function onRequestGet({ env, data }) {
  const { user } = data;
  const db = env.DB;

  if (user.isOwner) {
    const [ledgers, members, tx] = await db.batch([
      db.prepare('SELECT id, name, sort, private, config FROM ledgers ORDER BY sort'),
      db.prepare('SELECT id, ledger_id, name, role_label, email, sort FROM members ORDER BY ledger_id, sort, id'),
      db.prepare(`SELECT id, ledger_id, member_id, date, item, col, amount, note, created_at
                  FROM tx WHERE deleted_at IS NULL ORDER BY date, id`),
    ]);
    return json({
      me: { email: user.email, isOwner: true },
      ledgers: ledgers.results.map(parseLedger),
      members: members.results,
      tx: tx.results,
    });
  }

  const mine = await db.prepare(
    `SELECT m.id, m.ledger_id, m.name, m.role_label, m.sort
       FROM members m JOIN ledgers l ON l.id = m.ledger_id
      WHERE l.private = 0 AND m.email = ?1
      ORDER BY l.sort, m.sort`).bind(user.email).all();
  const members = mine.results;
  if (!members.length) {
    return json({ me: { email: user.email, isOwner: false }, ledgers: [], members: [], tx: [] });
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
    me: { email: user.email, isOwner: false },
    ledgers: ledgers.results.map(parseLedger),
    members,
    tx: tx.results,
  });
}

function parseLedger(l) {
  return { id: l.id, name: l.name, sort: l.sort, private: !!l.private, config: JSON.parse(l.config) };
}
