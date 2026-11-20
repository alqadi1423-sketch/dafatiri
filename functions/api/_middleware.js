import { identify } from '../_lib/auth.js';
import { fail } from '../_lib/http.js';

export async function onRequest(context) {
  const { request, env } = context;

  const user = await identify(request, env);
  if (!user) return fail('يلزم تسجيل الدخول', 401);

  // كل طلب يغيّر شيئًا يجب أن يأتي من الموقع نفسه
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin) return fail('طلب مرفوض', 403);
  }

  context.data.user = user;
  return context.next();
}
