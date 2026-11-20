'use strict';

// ================================================================ الحالة والأدوات
const S = { me: null, ledgers: [], people: [], members: [], tx: [], users: [], invites: [] };

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const money = (h) => fmt.format(h / 100);
const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// بناء العناصر بلا innerHTML، فلا يُنفَّذ أي نص مكتوب في الأسماء أو الملاحظات
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
function toast(msg, action) {
  const t = document.getElementById('toast');
  t.replaceChildren(h('span', null, msg));
  if (action) {
    t.append(h('button', {
      type: 'button', class: 'toast-act',
      onclick: () => { t.classList.remove('show'); action.run(); },
    }, action.label));
  }
  t.classList.toggle('has-act', !!action);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 7000 : 2600);
}

class AuthError extends Error {}
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* فارغ */ }
  if (res.status === 401 && path !== '/api/login') throw new AuthError('سجّل الدخول');
  if (!res.ok) throw new Error((data && data.error) || 'تعذّر الاتصال، حاول مرة أخرى.');
  return data;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { class: 'offscreen' }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return ok;
  }
}
const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);

// ================================================================ الحساب
const ledgerOf = (id) => S.ledgers.find((l) => l.id === id);
const memberOf = (id) => S.members.find((m) => m.id === id);
const personOf = (id) => S.people.find((p) => p.id === id);
const membersOf = (ledger) => S.members.filter((m) => m.ledger_id === ledger.id)
  .sort((a, b) => a.sort - b.sort || a.id - b.id);
const nameOfMember = (m) => (personOf(m.person_id) || {}).name || '';
const signOf = (ledger, col) => (ledger.config.cols.find((c) => c.key === col) || {}).sign || 0;
const txOf = (m) => S.tx.filter((t) => t.member_id === m.id)
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

function totalsOf(ledger, members) {
  const totals = Object.fromEntries(ledger.config.cols.map((c) => [c.key, 0]));
  let balance = 0;
  const ids = new Set(members.map((m) => m.id));
  for (const t of S.tx) {
    if (!ids.has(t.member_id)) continue;
    totals[t.col] = (totals[t.col] || 0) + t.amount;
    balance += signOf(ledger, t.col) * t.amount;
  }
  return { totals, balance };
}

function ledgerSummaryText(ledger) {
  const ms = membersOf(ledger);
  const lines = ms.map((m) => `${nameOfMember(m)} ${money(totalsOf(ledger, [m]).balance)}`);
  return [ledger.name, ...lines, '---', `المجموع ${money(totalsOf(ledger, ms).balance)}`].join('\n');
}

// ================================================================ عناصر مشتركة
const balClass = (b) => 'num' + (b === 0 ? ' zero' : b < 0 ? ' neg' : '');

function pageHead({ back, title, sub, badge }) {
  return h('div', { class: 'page-head' },
    back ? h('a', { class: 'back', href: back[0] }, '‹ ', back[1]) : null,
    h('h2', { class: 'title' }, title, badge ? h('span', { class: 'badge' }, badge) : null),
    sub ? h('p', { class: 'sub' }, sub) : null);
}

function summaryCard(ledger, members, label) {
  const { totals, balance } = totalsOf(ledger, members);
  return h('section', { class: 'card summary' },
    h('div', { class: 'big-label' }, label),
    h('div', { class: 'big ' + balClass(balance) }, money(balance), h('small', null, 'ريال')),
    h('div', { class: 'tiles n' + ledger.config.cols.length }, ledger.config.cols.map((c) =>
      h('div', { class: 'tile' }, h('span', null, c.label), h('b', { class: 'num' }, money(totals[c.key]))))));
}

function card(title, ...body) {
  return h('section', { class: 'card' }, title ? h('h3', null, title) : null, ...body);
}

function field(id, label, input, full) {
  input.id = id;
  return h('label', { class: full ? 'full' : null, for: id }, h('span', null, label), input);
}

// نموذج عام: يعطّل الزر أثناء الإرسال ويعرض الخطأ تحته
function form(fields, submitLabel, onSubmit, opts = {}) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn' + (opts.ghost ? ' ghost' : ''), type: 'submit' }, submitLabel);
  return h('form', {
    class: 'form' + (opts.single ? ' single' : ''), novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try { await onSubmit(); } catch (ex) {
        if (ex instanceof AuthError) return showLogin();
        err.textContent = ex.message;
      } finally { btn.disabled = false; }
    },
  }, fields, h('div', { class: 'full' }, err), h('div', { class: 'full form-actions' }, btn));
}

function rowLink(href, main, side, sub) {
  return h('a', { class: 'row', href },
    h('div', { class: 'row-main' }, main, sub ? h('div', { class: 'row-sub' }, sub) : null),
    h('div', { class: 'row-side' }, side),
    h('span', { class: 'chev', 'aria-hidden': 'true' }));
}

// ================================================================ الصفحات
function pageHome() {
  if (!S.me.isOwner) {
    const ms = S.members;
    if (!ms.length) return [pageHead({ title: 'حساباتي' }), h('p', { class: 'empty' }, 'لا توجد حسابات ظاهرة لك بعد.')];
    return [
      pageHead({ title: 'حساباتي' }),
      h('section', { class: 'card list' }, ms.map((m) => {
        const l = ledgerOf(m.ledger_id);
        const b = totalsOf(l, [m]).balance;
        return rowLink('#/a/' + m.id, l.name, h('span', { class: balClass(b) }, money(b)));
      })),
    ];
  }
  return [
    pageHead({ title: 'الدفاتر' }),
    S.ledgers.length
      ? h('div', { class: 'ledger-grid' }, S.ledgers.map((l) => {
        const ms = membersOf(l);
        const b = totalsOf(l, ms).balance;
        return h('a', { class: 'card ledger-card', href: '#/l/' + l.id },
          h('div', { class: 'lc-top' }, h('span', { class: 'lc-name' }, l.name), l.private ? h('span', { class: 'badge' }, 'خاص') : null),
          h('div', { class: 'lc-bal ' + balClass(b) }, money(b), h('small', null, 'ريال')),
          h('div', { class: 'lc-meta' }, `${ms.length} ${ms.length === 1 ? 'حساب' : 'حسابات'}`));
      }))
      : h('p', { class: 'empty' }, 'لا توجد دفاتر بعد.'),
    h('div', { class: 'actions' },
      h('a', { class: 'btn', href: '#/new' }, 'دفتر جديد'),
      h('a', { class: 'btn ghost', href: '#/people' }, `الأشخاص (${S.people.length})`)),
  ];
}

function pageLedger(id) {
  const ledger = ledgerOf(id);
  if (!ledger) return notFound();
  const ms = membersOf(ledger);
  const out = [
    pageHead({ back: ['#/', 'الدفاتر'], title: ledger.name, badge: ledger.private ? 'خاص' : null }),
    summaryCard(ledger, ms, ledger.config.balanceLabel),
    h('div', { class: 'actions' },
      h('button', {
        class: 'btn ghost', type: 'button',
        onclick: async () => toast((await copyText(ledgerSummaryText(ledger))) ? 'نُسخت الخلاصة' : 'تعذّر النسخ'),
      }, 'نسخ الخلاصة'),
      h('a', { class: 'btn ghost', href: waLink(ledgerSummaryText(ledger)), target: '_blank', rel: 'noopener' }, 'إرسال واتساب')),
    h('section', { class: 'card list' },
      h('h3', null, 'الحسابات'),
      ms.length ? ms.map((m) => {
        const { totals, balance } = totalsOf(ledger, [m]);
        const used = ledger.config.cols.filter((c) => totals[c.key]);
        const sub = used.length > 1 ? used.map((c) => `${c.label} ${money(totals[c.key])}`).join('، ') : null;
        return rowLink('#/a/' + m.id,
          h('span', null, nameOfMember(m), m.role_label ? h('span', { class: 'tag' }, m.role_label) : null),
          h('span', { class: balClass(balance) }, money(balance)), sub);
      }) : h('p', { class: 'empty' }, 'لا توجد حسابات في هذا الدفتر بعد.')),
  ];
  if (S.me.isOwner) out.push(addMemberCard(ledger, ms), ledgerSettingsCard(ledger));
  return out;
}

function addMemberCard(ledger, ms) {
  const inLedger = new Set(ms.map((m) => m.person_id));
  const choices = S.people.filter((p) => !inLedger.has(p.id));
  const who = h('select', null,
    h('option', { value: 'new' }, 'شخص جديد'),
    choices.map((p) => h('option', { value: String(p.id) }, p.name)));
  const name = h('input', { maxlength: '40', autocomplete: 'off' });
  const role = h('input', { maxlength: '20', placeholder: 'اختياري' });
  const nameField = field('am-name', 'اسم الشخص الجديد', name);
  who.addEventListener('change', () => { nameField.hidden = who.value !== 'new'; });
  return card('إضافة حساب لشخص',
    form([field('am-who', 'الشخص', who), nameField, field('am-role', 'الصفة', role)], 'إضافة', async () => {
      const body = { ledger_id: ledger.id, role_label: role.value };
      if (who.value === 'new') body.name = name.value; else body.person_id = Number(who.value);
      const { member, person } = await api('POST', '/api/members', body);
      if (!personOf(person.id)) S.people.push(person);
      S.members.push(member);
      toast(`أُضيف ${person.name}`);
      go('#/a/' + member.id);
    }));
}

function ledgerSettingsCard(ledger) {
  const name = h('input', { maxlength: '60', value: ledger.name });
  const priv = privacySelect(ledger.private);
  return h('details', { class: 'card settings' },
    h('summary', null, 'إعدادات الدفتر'),
    form([field('ls-name', 'اسم الدفتر', name), field('ls-priv', 'من يرى الدفتر', priv)], 'حفظ', async () => {
      const { ledger: l } = await api('PATCH', '/api/ledgers/' + ledger.id, { name: name.value, private: priv.value === '1' });
      Object.assign(ledger, l);
      toast('حُفظت الإعدادات');
      render();
    }, { ghost: true }));
}

function privacySelect(isPrivate) {
  const s = h('select', null,
    h('option', { value: '0' }, 'أنا، وكل صاحب حساب يرى حسابه'),
    h('option', { value: '1' }, 'أنا وحدي'));
  s.value = isPrivate ? '1' : '0';
  return s;
}

function pageAccount(id) {
  const m = memberOf(Number(id));
  if (!m) return notFound();
  const ledger = ledgerOf(m.ledger_id);
  const person = personOf(m.person_id) || { name: '' };
  const out = [
    pageHead({
      back: S.me.isOwner ? ['#/l/' + ledger.id, ledger.name] : ['#/', 'حساباتي'],
      title: person.name,
      sub: [ledger.name, m.role_label].filter(Boolean).join(' · '),
    }),
    summaryCard(ledger, [m], ledger.config.balanceLabel),
  ];
  if (S.me.isOwner) out.push(entryCard(ledger, m));
  out.push(statementCard(ledger, m));
  if (S.me.isOwner) out.push(h('div', { class: 'actions' }, h('a', { class: 'btn ghost', href: '#/p/' + person.id }, 'سجل ' + person.name)));
  return out;
}

function entryCard(ledger, m) {
  const items = [...ledger.config.items.filter((i) => i.label !== 'رصيد افتتاحي'), ...ledger.config.items.filter((i) => i.label === 'رصيد افتتاحي')];
  const item = h('select', null, items.map((i) => h('option', { value: i.label }, i.label)));
  const amount = h('input', { inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
  const date = h('input', { type: 'date', value: today(), dir: 'ltr' });
  const note = h('input', { maxlength: '200', placeholder: 'اختياري' });
  return card('تسجيل حركة',
    form([field('e-item', 'البند', item), field('e-amount', 'المبلغ (ريال)', amount),
      field('e-date', 'التاريخ', date), field('e-note', 'ملاحظة', note)], 'حفظ الحركة', async () => {
      const amt = amount.value.trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,٬]/g, '').replace('٫', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0) throw new Error('اكتب مبلغًا صحيحًا أكبر من صفر.');
      const { tx } = await api('POST', '/api/tx', { member_id: m.id, item: item.value, amount: amt, date: date.value, note: note.value });
      S.tx.push(tx);
      toast(`سُجّل ${tx.item} ${money(tx.amount)} ريال`);
      render();
    }));
}

function statementCard(ledger, m) {
  const rows = txOf(m);
  let running = 0;
  const items = rows.map((t) => {
    const sign = signOf(ledger, t.col);
    running += sign * t.amount;
    const head = [
      h('div', { class: 'tx-main' },
        h('span', { class: 'pill ' + (sign > 0 ? 'plus' : 'minus') }, t.item),
        h('span', { class: 'tx-amt num ' + (sign > 0 ? 'plus-t' : 'minus-t'), dir: 'ltr' }, (sign > 0 ? '+' : '−') + money(t.amount))),
      h('div', { class: 'tx-sub' },
        h('span', null, h('span', { class: 'num', dir: 'ltr' }, t.date), t.note ? ' · ' + t.note : ''),
        h('span', null, 'الرصيد ', h('b', { class: 'num' }, money(running)))),
    ];
    if (!S.me.isOwner) return h('li', { class: 'tx' }, head);
    return h('li', { class: 'tx' }, h('details', null, h('summary', null, head), txActions(t, sign)));
  });
  return h('section', { class: 'card list' },
    h('h3', null, 'كشف الحساب'),
    rows.length ? h('ul', { class: 'tx-list' }, items) : h('p', { class: 'empty' }, 'لا توجد حركات.'));
}

// الحذف بخطوتين واضحتين، ثم إمكانية التراجع
function txActions(t, sign) {
  const box = h('div', { class: 'tx-actions' });
  const ask = h('button', { class: 'btn ghost danger-text small', type: 'button' }, 'حذف الحركة');
  ask.addEventListener('click', () => {
    const yes = h('button', { class: 'btn danger small', type: 'button' }, 'نعم، احذفها');
    const no = h('button', { class: 'btn ghost small', type: 'button', onclick: () => box.replaceChildren(ask) }, 'إلغاء');
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await api('DELETE', '/api/tx/' + t.id);
        S.tx = S.tx.filter((x) => x.id !== t.id);
        render();
        toast(`حُذفت حركة ${t.item} ${money(t.amount)}`, { label: 'تراجع', run: () => restoreTx(t) });
      } catch (ex) {
        if (ex instanceof AuthError) return showLogin();
        toast(ex.message);
        yes.disabled = false;
      }
    });
    box.replaceChildren(h('p', { class: 'confirm' }, `حذف ${t.item} ${(sign > 0 ? '+' : '−') + money(t.amount)} بتاريخ `, h('span', { dir: 'ltr' }, t.date), '؟'), h('div', { class: 'actions' }, yes, no));
  });
  box.append(ask);
  return box;
}

async function restoreTx(t) {
  try {
    const { tx } = await api('POST', `/api/tx/${t.id}/restore`);
    S.tx.push(tx);
    S.tx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    render();
    toast('أُعيدت الحركة');
  } catch (ex) { toast(ex.message); }
}

function pagePeople() {
  const name = h('input', { maxlength: '40', autocomplete: 'off' });
  return [
    pageHead({ back: ['#/', 'الدفاتر'], title: 'الأشخاص' }),
    h('section', { class: 'card list' },
      S.people.length ? S.people.map((p) => {
        const n = S.members.filter((m) => m.person_id === p.id).length;
        return rowLink('#/p/' + p.id, p.name, linkChip(p), `${n} ${n === 1 ? 'حساب' : 'حسابات'}`);
      }) : h('p', { class: 'empty' }, 'لا يوجد أشخاص بعد.')),
    card('شخص جديد', form([field('np-name', 'الاسم', name, true)], 'إضافة', async () => {
      const { person } = await api('POST', '/api/people', { name: name.value });
      S.people.push(person);
      go('#/p/' + person.id);
    })),
  ];
}

function linkChip(p) {
  if (p.user_id) {
    const u = S.users.find((x) => x.id === p.user_id);
    return h('span', { class: 'chip ok' }, u && u.disabled ? 'موقوف' : 'مرتبط');
  }
  if (S.invites.some((i) => i.person_id === p.id)) return h('span', { class: 'chip wait' }, 'دعوة مرسلة');
  return h('span', { class: 'chip' }, 'غير مرتبط');
}

function pagePerson(id) {
  const p = personOf(Number(id));
  if (!p) return notFound();
  const ms = S.members.filter((m) => m.person_id === p.id);
  const nm = h('input', { maxlength: '40', value: p.name });
  const others = S.people.filter((x) => x.id !== p.id);
  const into = h('select', null, h('option', { value: '' }, 'اختر'), others.map((x) => h('option', { value: String(x.id) }, x.name)));
  return [
    pageHead({ back: ['#/people', 'الأشخاص'], title: p.name }),
    h('section', { class: 'card list' }, h('h3', null, 'حساباته'),
      ms.length ? ms.map((m) => {
        const l = ledgerOf(m.ledger_id);
        const b = totalsOf(l, [m]).balance;
        return rowLink('#/a/' + m.id, l.name, h('span', { class: balClass(b) }, money(b)), l.private ? 'دفتر خاص، لا يظهر له' : null);
      }) : h('p', { class: 'empty' }, 'لا حسابات له بعد. أضفه من صفحة أي دفتر.')),
    accessCard(p),
    h('details', { class: 'card settings' }, h('summary', null, 'تعديل الاسم والدمج'),
      form([field('pp-name', 'الاسم', nm, true)], 'حفظ الاسم', async () => {
        const { person } = await api('PATCH', '/api/people/' + p.id, { name: nm.value });
        Object.assign(p, person);
        toast('حُفظ الاسم');
        render();
      }, { ghost: true }),
      h('p', { class: 'note' }, 'إن كان هذا الشخص مكررًا باسم آخر، ادمجه في السجل الصحيح فتنتقل إليه كل حساباته.'),
      form([field('pp-into', 'دمجه في', into, true)], 'دمج', async () => {
        if (!into.value) throw new Error('اختر الشخص');
        const { merged } = await api('PATCH', '/api/people/' + p.id, { merge_into: Number(into.value) });
        await load();
        toast('تم الدمج');
        go('#/p/' + merged);
      }, { ghost: true })),
  ];
}

function accessCard(p) {
  if (p.user_id) {
    const u = S.users.find((x) => x.id === p.user_id) || {};
    const pw = h('input', { class: 'ltr', maxlength: '128', autocomplete: 'new-password', placeholder: '8 أحرف على الأقل' });
    return card('حساب الدخول',
      h('div', { class: 'kv' }, h('span', null, 'اسم المستخدم'), h('b', { class: 'ltr-text' }, u.username || '')),
      h('p', { class: 'note' }, 'يرى حساباته في الدفاتر غير الخاصة فقط، ولا يقدر يعدّل شيئًا.'),
      form([field('ac-pw', 'كلمة مرور جديدة له', pw, true)], 'تعيين', async () => {
        await api('PATCH', '/api/users/' + p.user_id, { password: pw.value });
        pw.value = '';
        toast('تغيّرت كلمة مروره');
      }, { ghost: true }),
      h('div', { class: 'actions' }, h('button', {
        class: 'btn ghost danger-text', type: 'button',
        onclick: async () => {
          try {
            await api('POST', `/api/people/${p.id}/unlink`);
            await load();
            toast('فُصل الحساب');
            render();
          } catch (ex) { toast(ex.message); }
        },
      }, 'فصل الحساب وإيقافه')));
  }
  const box = h('div', { class: 'invite-box' });
  const pending = S.invites.find((i) => i.person_id === p.id);
  const btn = h('button', { class: 'btn', type: 'button' }, pending ? 'إنشاء رابط جديد' : 'إنشاء رابط دعوة');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const { url, expires_at: exp } = await api('POST', `/api/people/${p.id}/invite`);
      S.invites = S.invites.filter((i) => i.person_id !== p.id).concat({ person_id: p.id, expires_at: exp });
      const msg = `مرحبًا ${p.name}\nهذا رابط دخولك إلى دفاتري، يعمل مرة واحدة خلال 14 يومًا:\n${url}`;
      box.replaceChildren(
        h('input', { class: 'ltr', readonly: true, value: url, onclick: (ev) => ev.target.select() }),
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => toast((await copyText(url)) ? 'نُسخ الرابط' : 'تعذّر النسخ') }, 'نسخ الرابط'),
          h('a', { class: 'btn ghost', href: waLink(msg), target: '_blank', rel: 'noopener' }, 'إرسال واتساب')));
    } catch (ex) { toast(ex.message); } finally { btn.disabled = false; }
  });
  return card('حساب الدخول',
    h('p', { class: 'note' }, pending
      ? 'أُرسلت له دعوة لم تُستخدم بعد. إنشاء رابط جديد يلغي السابق.'
      : 'غير مرتبط بحساب. أرسل له رابط دعوة لينشئ اسم مستخدم وكلمة مرور، فيرى حساباته فقط.'),
    box,
    h('div', { class: 'actions' }, btn));
}

function pageNewLedger() {
  const name = h('input', { maxlength: '60', autocomplete: 'off' });
  const kind = h('select', null, h('option', { value: 'debts' }, 'ديون: دين وسداد وإبراء'), h('option', { value: 'fund' }, 'صندوق: إيداع وسحب'));
  const priv = privacySelect(false);
  return [
    pageHead({ back: ['#/', 'الدفاتر'], title: 'دفتر جديد' }),
    card(null, form([field('nl-name', 'اسم الدفتر', name, true), field('nl-kind', 'النوع', kind), field('nl-priv', 'من يرى الدفتر', priv)],
      'إنشاء الدفتر', async () => {
        const { ledger } = await api('POST', '/api/ledgers', { name: name.value, kind: kind.value, private: priv.value === '1' });
        S.ledgers.push(ledger);
        go('#/l/' + ledger.id);
      })),
  ];
}

function pagePassword() {
  const cur = h('input', { class: 'ltr', type: 'password', autocomplete: 'current-password' });
  const next = h('input', { class: 'ltr', type: 'password', autocomplete: 'new-password', placeholder: '8 أحرف على الأقل' });
  return [
    pageHead({ back: ['#/', 'الرئيسية'], title: 'كلمة المرور' }),
    card(null, form([field('pw-cur', 'الحالية', cur, true), field('pw-new', 'الجديدة', next, true)], 'حفظ', async () => {
      await api('POST', '/api/password', { current: cur.value, next: next.value });
      toast('تغيّرت كلمة المرور');
      go('#/');
    })),
  ];
}

function notFound() {
  return [pageHead({ back: ['#/', 'الرئيسية'], title: 'غير موجود' }), h('p', { class: 'empty' }, 'هذه الصفحة غير موجودة.')];
}

// ================================================================ الدخول والدعوة
function bare(...children) {
  document.getElementById('who').hidden = true;
  document.getElementById('app').replaceChildren(h('div', { class: 'auth' }, children));
}

function showLogin() {
  S.me = null;
  const user = h('input', { class: 'ltr', autocapitalize: 'none', autocomplete: 'username' });
  const pw = h('input', { class: 'ltr', type: 'password', autocomplete: 'current-password' });
  bare(card('تسجيل الدخول', form([field('l-user', 'اسم المستخدم', user, true), field('l-pw', 'كلمة المرور', pw, true)], 'دخول', async () => {
    await api('POST', '/api/login', { username: user.value, password: pw.value });
    await boot();
  }, { single: true })));
  user.focus();
}

async function showInvite(token) {
  let name;
  try {
    ({ name } = await api('GET', '/api/invite?t=' + encodeURIComponent(token)));
  } catch (ex) {
    bare(card('رابط الدعوة', h('p', { class: 'empty' }, ex.message)));
    return;
  }
  const user = h('input', { class: 'ltr', autocapitalize: 'none', autocomplete: 'username', placeholder: 'مثال: mona' });
  const pw = h('input', { class: 'ltr', type: 'password', autocomplete: 'new-password', placeholder: '8 أحرف على الأقل' });
  bare(card(`مرحبًا ${name}`,
    h('p', { class: 'note' }, 'اختر اسم مستخدم بالإنجليزي وكلمة مرور لتدخل وترى حساباتك.'),
    form([field('iv-user', 'اسم المستخدم', user, true), field('iv-pw', 'كلمة المرور', pw, true)], 'إنشاء الحساب', async () => {
      await api('POST', '/api/invite', { token, username: user.value, password: pw.value });
      history.replaceState(null, '', '#/');
      await boot();
    }, { single: true })));
}

// ================================================================ التنقل
function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function render() {
  if (!S.me) return;
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
  const owner = S.me.isOwner;
  let page;
  switch (parts[0]) {
    case '': page = pageHome(); break;
    case 'l': page = owner ? pageLedger(parts[1]) : notFound(); break;
    case 'a': page = pageAccount(parts[1]); break;
    case 'people': page = owner ? pagePeople() : notFound(); break;
    case 'p': page = owner ? pagePerson(parts[1]) : notFound(); break;
    case 'new': page = owner ? pageNewLedger() : notFound(); break;
    case 'password': page = pagePassword(); break;
    default: page = notFound();
  }
  document.getElementById('app').replaceChildren(...page);
}

async function load() {
  const data = await api('GET', '/api/data');
  Object.assign(S, { users: [], invites: [] }, data);
}

async function boot() {
  const m = location.hash.match(/^#\/invite\/([A-Za-z0-9_-]+)$/);
  if (m) return showInvite(m[1]);
  try {
    await load();
  } catch (ex) {
    if (ex instanceof AuthError) return showLogin();
    document.getElementById('app').replaceChildren(h('p', { class: 'empty' }, ex.message));
    return;
  }
  document.getElementById('who-name').textContent = S.me.name;
  document.getElementById('who').hidden = false;
  render();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  if (/^#\/invite\//.test(location.hash)) { boot(); return; }
  render();
  window.scrollTo(0, 0);
});
document.getElementById('btn-out').addEventListener('click', async () => {
  try { await api('POST', '/api/logout'); } catch { /* نكمل */ }
  history.replaceState(null, '', '#/');
  showLogin();
});
boot();
