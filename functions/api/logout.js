import { endSession } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const cookie = await endSession(request, env);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie },
  });
}
