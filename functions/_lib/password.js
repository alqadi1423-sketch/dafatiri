// كلمات المرور: PBKDF2-SHA256 بملح عشوائي. أقصى عدد تكرارات تسمح به Cloudflare Workers هو 100000.
const ITER = 100000;

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = Number(parts[1]);
  if (!Number.isInteger(iter) || iter < 1 || iter > ITER) return false;
  const expected = unb64(parts[3]);
  const got = await derive(password, unb64(parts[2]), iter);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

// كلمة مرور مقبولة: 8 أحرف على الأقل، و128 على الأكثر
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'كلمة المرور 8 أحرف على الأقل';
  if (pw.length > 128) return 'كلمة المرور طويلة جدًا';
  return null;
}

export function validUsername(u) {
  return typeof u === 'string' && /^[a-z0-9._-]{3,30}$/.test(u);
}
