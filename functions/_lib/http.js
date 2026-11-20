export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.startsWith('application/json')) return null;
  const text = await request.text();
  if (text.length > 10000) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// يحوّل مبلغًا بالريال (حتى خانتين عشريتين) إلى هللات. يرجع null إن لم يكن صالحًا.
export function toHalala(v) {
  const s = typeof v === 'number' ? String(v) : String(v ?? '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const [r, f = ''] = s.split('.');
  const h = Number(r) * 100 + Number((f + '00').slice(0, 2));
  return h > 0 ? h : null;
}

export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function cleanText(s, max) {
  if (s === undefined || s === null) return null;
  const t = String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function validEmail(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
