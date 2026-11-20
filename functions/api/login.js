import { json, fail, readJson } from '../_lib/http.js';
import { verifyPassword } from '../_lib/password.js';
import { startSession, tooManyFailures, recordFailure, clearFailures } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail('بيانات غير صالحة');
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const keys = ['u:' + username, 'ip:' + ip];

  if (await tooManyFailures(env, keys)) {
    return fail('محاولات كثيرة خاطئة. انتظر 15 دقيقة ثم حاول.', 429);
  }

  const user = username
    ? await env.DB.prepare('SELECT id, pw, disabled FROM users WHERE username = ?1').bind(username).first()
    : null;
  // نتحقق دائمًا حتى لو الاسم غير موجود، فلا يُعرف من سرعة الرد هل الاسم صحيح
  const ok = await verifyPassword(password, user ? user.pw : 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  if (!user || !ok || user.disabled) {
    await recordFailure(env, keys);
    return fail('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  }

  await clearFailures(env, 'u:' + username);
  const cookie = await startSession(env, user.id);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookie },
  });
}
