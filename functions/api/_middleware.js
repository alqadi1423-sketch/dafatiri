import { identify } from '../_lib/auth.js';
import { fail } from '../_lib/http.js';

const PUBLIC = new Set(['/api/login', '/api/invite']);

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // كل طلب يغيّر شيئًا يجب أن يأتي من الموقع نفسه
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin) return fail('طلب مرفوض', 403);
  }

  if (PUBLIC.has(url.pathname)) return context.next();

  const user = await identify(request, env);
  if (!user) return fail('يلزم تسجيل الدخول', 401);
  context.data.user = user;
  return context.next();
}
