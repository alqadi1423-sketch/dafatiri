-- نظام الدخول الخاص بالموقع: أسماء مستخدمين وكلمات مرور (مخزّنة مجزّأة لا نصًا)، وجلسات.
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  pw           TEXT NOT NULL,              -- pbkdf2$<iter>$<salt>$<hash>
  is_owner     INTEGER NOT NULL DEFAULT 0,
  disabled     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- الجلسة تُحفظ مجزّأة؛ الرمز الأصلي في ملف تعريف الارتباط عند المستخدم فقط
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX sessions_user ON sessions(user_id);

-- محاولات الدخول الفاشلة، لإيقاف التخمين
CREATE TABLE login_failures (
  key          TEXT PRIMARY KEY,           -- u:<username> أو ip:<عنوان>
  count        INTEGER NOT NULL,
  window_start TEXT NOT NULL
);

-- ربط الحساب في الدفتر بمستخدم بدل البريد
ALTER TABLE members ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX members_user ON members(user_id);
