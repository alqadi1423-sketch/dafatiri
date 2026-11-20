// الجلسات: رمز عشوائي في ملف تعريف ارتباط محمي، ويُحفظ في قاعدة البيانات مجزّأً فقط.
const COOKIE = 'sid';
const DAYS = 30;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function readCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)sid=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}

export async function identify(request, env) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.name, u.is_owner FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?1 AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now') AND u.disabled = 0`)
    .bind(await sha256(token)).first();
  if (!row) return null;
  return { id: row.id, username: row.username, name: row.name, isOwner: !!row.is_owner };
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startSession(env, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + DAYS * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')`),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)')
      .bind(await sha256(token), userId, expires),
  ]);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}

export async function endSession(request, env) {
  const token = readCookie(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function endAllSessions(env, userId) {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId).run();
}

// إيقاف التخمين: 10 محاولات فاشلة خلال 15 دقيقة لكل اسم مستخدم ولكل عنوان
const LIMIT = 10;
const WINDOW_MIN = 15;

export async function tooManyFailures(env, keys) {
  for (const key of keys) {
    const row = await env.DB.prepare(
      `SELECT count FROM login_failures WHERE key = ?1
         AND window_start > strftime('%Y-%m-%dT%H:%M:%SZ','now', ?2)`).bind(key, `-${WINDOW_MIN} minutes`).first();
    if (row && row.count >= LIMIT) return true;
  }
  return false;
}

export async function recordFailure(env, keys) {
  await env.DB.batch(keys.map((key) => env.DB.prepare(
    `INSERT INTO login_failures (key, count, window_start) VALUES (?1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start > strftime('%Y-%m-%dT%H:%M:%SZ','now', ?2) THEN count + 1 ELSE 1 END,
       window_start = CASE WHEN window_start > strftime('%Y-%m-%dT%H:%M:%SZ','now', ?2) THEN window_start
                           ELSE strftime('%Y-%m-%dT%H:%M:%SZ','now') END`).bind(key, `-${WINDOW_MIN} minutes`)));
}

export async function clearFailures(env, key) {
  await env.DB.prepare('DELETE FROM login_failures WHERE key = ?1').bind(key).run();
}
