-- الأشخاص: كل شخص له سجل واحد يجمع حساباته في كل الدفاتر، ويُربط بحساب دخول إن قبل الدعوة.
CREATE TABLE people (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  user_id     INTEGER UNIQUE REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

ALTER TABLE members ADD COLUMN person_id INTEGER REFERENCES people(id);
CREATE INDEX members_person ON members(person_id);

-- كل اسم موجود يصير شخصًا واحدًا، والأسماء المتطابقة في الدفاتر المختلفة تُجمع في سجل واحد
INSERT INTO people (name) SELECT DISTINCT name FROM members;
UPDATE members SET person_id = (SELECT p.id FROM people p WHERE p.name = members.name);
UPDATE people SET user_id = (
  SELECT m.user_id FROM members m WHERE m.person_id = people.id AND m.user_id IS NOT NULL LIMIT 1);

-- الدعوات: رابط لمرة واحدة ينشئ به الشخص اسم مستخدم وكلمة مرور ويرتبط بسجله
CREATE TABLE invites (
  token_hash  TEXT PRIMARY KEY,
  person_id   INTEGER NOT NULL REFERENCES people(id),
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
