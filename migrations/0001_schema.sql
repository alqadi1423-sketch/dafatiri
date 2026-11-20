-- الدفاتر: كل دفتر له أعمدة (لكل عمود إشارة: يزيد الرصيد أو ينقصه) وبنود (كل بند يذهب لعمود)
CREATE TABLE ledgers (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  sort     INTEGER NOT NULL,
  private  INTEGER NOT NULL DEFAULT 0,   -- 1: للمالك وحده، لا يراه أي فرد
  config   TEXT NOT NULL                 -- JSON: {cols:[{key,label,sign}], items:[{label,col}], balanceLabel}
);

-- أصحاب الحسابات داخل كل دفتر. email يربط الحساب بفرد من العائلة ليراه عند دخوله
CREATE TABLE members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id   TEXT NOT NULL REFERENCES ledgers(id),
  name        TEXT NOT NULL,
  role_label  TEXT,
  email       TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ledger_id, name)
);
CREATE INDEX members_email ON members(email);

-- الحركات. المبلغ بالهللة (عدد صحيح) لتفادي أخطاء الكسور.
-- لا تُحذف حركة فعليًا: الحذف يسجّل وقته ومن حذفها، فيبقى أثرها للمراجعة.
CREATE TABLE tx (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_id   TEXT NOT NULL REFERENCES ledgers(id),
  member_id   INTEGER NOT NULL REFERENCES members(id),
  date        TEXT NOT NULL,
  item        TEXT NOT NULL,
  col         TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  created_by  TEXT,
  deleted_at  TEXT,
  deleted_by  TEXT
);
CREATE INDEX tx_member ON tx(member_id);
CREATE INDEX tx_ledger ON tx(ledger_id);
