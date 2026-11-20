// التحقق من هوية الزائر عبر Cloudflare Access.
// Access يقف أمام الموقع كله ويطلب الدخول برمز البريد، ثم يرسل مع كل طلب توقيعًا (JWT)
// نتحقق منه هنا بأنفسنا، فلا نعتمد على مجرد وجود ترويسة يمكن تزويرها.

let jwksCache = { at: 0, keys: null, domain: null };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePart(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

async function getKeys(teamDomain) {
  const now = Date.now();
  if (jwksCache.keys && jwksCache.domain === teamDomain && now - jwksCache.at < 10 * 60 * 1000) {
    return jwksCache.keys;
  }
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('certs');
  const body = await res.json();
  jwksCache = { at: now, keys: body.keys || [], domain: teamDomain };
  return jwksCache.keys;
}

function readToken(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

export async function verifyAccess(request, env) {
  const token = readToken(request);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || '').replace(/\/+$/, '');
  if (!teamDomain || !env.ACCESS_AUD) return null;

  const keys = await getKeys(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  if (payload.iss !== teamDomain) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (!payload.email) return null;

  return String(payload.email).trim().toLowerCase();
}

export async function identify(request, env) {
  let email = null;
  // وضع التطوير المحلي فقط: لا يعمل إلا إذا ضُبط صراحة، ولا يُضبط أبدًا في النشر
  if (env.DEV_MODE === '1' && env.DEV_EMAIL) {
    email = request.headers.get('X-Dev-Email') || env.DEV_EMAIL;
    email = email.trim().toLowerCase();
  } else {
    email = await verifyAccess(request, env);
  }
  if (!email) return null;
  const owner = String(env.OWNER_EMAIL || '').trim().toLowerCase();
  return { email, isOwner: !!owner && email === owner };
}
