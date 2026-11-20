import { json } from '../_lib/http.js';

const parseLedger = (l) => ({ id: l.id, name: l.name, sort: l.sort, private: !!l.private, config: JSON.parse(l.config) });

// المالك يرى كل شيء. الشخص المرتبط بحساب يرى حساباته فقط في الدفاتر غير الخاصة، قراءة فقط.
export async function onRequestGet({ env, data }) {
  const { user } = data;
  const db = env.DB;
  const me = { username: user.username, name: user.name, isOwner: user.isOwner };

  if (user.isOwner) {
    const [ledgers, people, members, tx, users, invites] = await db.batch([
      db.prepare('SELECT id, name, sort, private, config FROM ledgers ORDER BY sort'),
      db.prepare('SELECT id, name, user_id FROM people ORDER BY name'),
      db.prepare('SELECT id, ledger_id, person_id, role_label, sort FROM members ORDER BY ledger_id, sort, id'),
      db.prepare(`SELECT id, member_id, date, item, col, amount, note, created_at
                    FROM tx WHERE deleted_at IS NULL ORDER BY date, id`),
      db.prepare('SELECT id, username, name, is_owner, disabled FROM users ORDER BY id'),
      db.prepare(`SELECT person_id, expires_at FROM invites
                   WHERE used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now')`),
    ]);
    return json({
      me,
      ledgers: ledgers.results.map(parseLedger),
      people: people.results,
      members: members.results,
      tx: tx.results,
      users: users.results,
      invites: invites.results,
    });
  }

  const person = await db.prepare('SELECT id, name FROM people WHERE user_id = ?1').bind(user.id).first();
  if (!person) return json({ me, ledgers: [], people: [], members: [], tx: [] });

  const [ledgers, members, tx] = await db.batch([
    db.prepare(`SELECT DISTINCT l.id, l.name, l.sort, l.private, l.config FROM ledgers l
                  JOIN members m ON m.ledger_id = l.id
                 WHERE l.private = 0 AND m.person_id = ?1 ORDER BY l.sort`).bind(person.id),
    db.prepare(`SELECT m.id, m.ledger_id, m.person_id, m.role_label, m.sort FROM members m
                  JOIN ledgers l ON l.id = m.ledger_id
                 WHERE l.private = 0 AND m.person_id = ?1 ORDER BY l.sort`).bind(person.id),
    db.prepare(`SELECT t.id, t.member_id, t.date, t.item, t.col, t.amount, t.note, t.created_at FROM tx t
                  JOIN members m ON m.id = t.member_id JOIN ledgers l ON l.id = m.ledger_id
                 WHERE t.deleted_at IS NULL AND l.private = 0 AND m.person_id = ?1 ORDER BY t.date, t.id`).bind(person.id),
  ]);
  return json({ me, ledgers: ledgers.results.map(parseLedger), people: [person], members: members.results, tx: tx.results });
}
