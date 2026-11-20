'use strict';

const state = { me: null, ledgers: [], members: [], tx: [], users: [], current: null, openMember: null, showPw: false };

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
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* فارغ */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/login') { renderLogin(); throw new Error('سجّل الدخول من جديد.'); }
    throw new Error((data && data.error) || 'تعذّر الاتصال، حاول مرة أخرى.');
  }
  return data;
}

// ---------------------------------------------------------------- الحساب
function ledgerOf(id) { return state.ledgers.find((l) => l.id === id); }
function signOf(ledger, col) {
  const c = ledger.config.cols.find((x) => x.key === col);
  return c ? c.sign : 0;
}
function accountTotals(ledger, memberId) {
  const totals = Object.fromEntries(ledger.config.cols.map((c) => [c.key, 0]));
  let balance = 0;
  for (const t of state.tx) {
    if (t.member_id !== memberId) continue;
    totals[t.col] = (totals[t.col] || 0) + t.amount;
    balance += signOf(ledger, t.col) * t.amount;
  }
  return { totals, balance };
}
function ledgerTotals(ledger, members) {
  const totals = Object.fromEntries(ledger.config.cols.map((c) => [c.key, 0]));
  let balance = 0;
  for (const m of members) {
    const a = accountTotals(ledger, m.id);
    for (const k in a.totals) totals[k] += a.totals[k];
    balance += a.balance;
  }
  return { totals, balance };
}

// ---------------------------------------------------------------- العرض
function renderTabs() {
  const nav = document.getElementById('tabs');
  const tabs = state.ledgers.map((l) => [l.id, l.name]);
  if (state.me && state.me.isOwner) tabs.push(['__new', '+ دفتر'], ['__family', 'أفراد العائلة']);
  nav.replaceChildren(...tabs.map(([id, label]) =>
    h('button', {
      class: 'tab', role: 'tab', type: 'button',
      'aria-selected': String(id === state.current),
      onclick: () => { state.current = id; state.openMember = null; renderAll(); },
    }, label)));
  nav.hidden = tabs.length < 2;
}

function renderAll() {
  renderTabs();
  const app = document.getElementById('app');
  if (state.current === '__family') { app.replaceChildren(...withPw([renderFamily()])); return; }
  if (state.current === '__new') { app.replaceChildren(...withPw([renderNewLedger()])); return; }
  const ledger = ledgerOf(state.current);
  if (!ledger) {
    app.replaceChildren(h('p', { class: 'state' },
      state.me.isOwner ? 'لا توجد دفاتر بعد.' :
        'لا توجد حسابات مربوطة بك بعد. اطلب من صاحب الدفاتر ربطها باسمك.'));
    return;
  }
  const members = state.members.filter((m) => m.ledger_id === ledger.id);
  const parts = [renderSummary(ledger, members)];
  if (state.me.isOwner) parts.push(renderEntry(ledger, members));
  parts.push(renderAccounts(ledger, members));
  if (state.me.isOwner) parts.push(renderAddMember(ledger), renderLedgerSettings(ledger));
  app.replaceChildren(...withPw(parts));
}

function balanceClass(b) { return b === 0 ? 'zero' : b < 0 ? 'neg' : ''; }

function renderSummary(ledger, members) {
  const { totals, balance } = ledgerTotals(ledger, members);
  const title = state.me.isOwner ? ledger.config.balanceLabel : (members.length > 1 ? 'إجمالي حساباتك' : ledger.config.balanceLabel);
  return h('section', { class: 'card summary', 'aria-label': 'الملخص' },
    h('div', { class: 'big-label' }, title),
    h('div', { class: 'big ' + balanceClass(balance) }, money(balance), h('small', null, ' ريال')),
    h('div', { class: 'cols' },
      ledger.config.cols.map((c) => h('div', null, h('span', null, c.label), h('span', null, money(totals[c.key])))),
      h('div', null, h('span', null, 'عدد الحسابات'), h('span', null, members.length))));
}

function renderEntry(ledger, members) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const memberSel = h('select', { id: 'f-member', required: true },
    h('option', { value: '' }, 'اختر الاسم'),
    members.map((m) => h('option', { value: String(m.id) }, m.name + (m.role_label ? ` (${m.role_label})` : ''))));
  if (state.openMember && members.some((m) => m.id === state.openMember)) memberSel.value = String(state.openMember);
  const itemSel = h('select', { id: 'f-item', required: true },
    ledger.config.items.filter((it) => it.label !== 'رصيد افتتاحي').concat(ledger.config.items.filter((it) => it.label === 'رصيد افتتاحي'))
      .map((it) => h('option', { value: it.label }, it.label)));
  const amount = h('input', { id: 'f-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', required: true });
  const date = h('input', { id: 'f-date', type: 'date', value: today(), required: true });
  const note = h('input', { id: 'f-note', maxlength: '200', placeholder: 'اختياري' });
  const btn = h('button', { class: 'btn full', type: 'submit' }, 'حفظ الحركة');

  const form = h('form', {
    class: 'entry', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const amt = amount.value.trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,٬]/g, '').replace('٫', '.');
      if (!memberSel.value) { err.textContent = 'اختر الاسم.'; return; }
      if (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0) { err.textContent = 'اكتب مبلغًا صحيحًا أكبر من صفر.'; return; }
      btn.disabled = true;
      try {
        const { tx } = await api('POST', '/api/tx', {
          member_id: Number(memberSel.value), item: itemSel.value, amount: amt, date: date.value, note: note.value,
        });
        state.tx.push(tx);
        state.openMember = tx.member_id;
        const m = state.members.find((x) => x.id === tx.member_id);
        toast(`سُجّل ${tx.item} ${money(tx.amount)} ريال على ${m ? m.name : ''}`);
        renderAll();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    },
  },
  h('label', { class: 'full', for: 'f-member' }, 'الاسم', memberSel),
  h('label', { for: 'f-item' }, 'البند', itemSel),
  h('label', { for: 'f-amount' }, 'المبلغ (ريال)', amount),
  h('label', { for: 'f-date' }, 'التاريخ', date),
  h('label', { for: 'f-note' }, 'ملاحظة', note),
  h('div', { class: 'full' }, err),
  btn);

  return h('section', { class: 'card', 'aria-label': 'تسجيل حركة' }, h('h2', null, 'تسجيل حركة'), form);
}

function renderAccounts(ledger, members) {
  const list = members.map((m) => {
    const { totals, balance } = accountTotals(ledger, m.id);
    const used = ledger.config.cols.filter((c) => totals[c.key]);
    const sub = used.length > 1 ? used.map((c) => `${c.label} ${money(totals[c.key])}`).join('، ') : '';
    const det = h('details', { class: 'acct', open: state.openMember === m.id || !state.me.isOwner },
      h('summary', null,
        h('span', { class: 'name' }, m.name, m.role_label ? h('span', { class: 'role' }, m.role_label) : null),
        h('span', { class: 'bal ' + balanceClass(balance) }, money(balance)),
        sub ? h('span', { class: 'sub' }, sub) : null),
      renderStatement(ledger, m));
    det.addEventListener('toggle', () => {
      if (det.open) state.openMember = m.id;
      else if (state.openMember === m.id) state.openMember = null;
      const sel = document.getElementById('f-member');
      if (sel && det.open) sel.value = String(m.id);
    });
    return det;
  });
  return h('section', { class: 'card accounts', 'aria-label': 'الحسابات' },
    h('h2', null, state.me.isOwner ? 'الحسابات' : 'كشف حسابك'), list);
}

function renderStatement(ledger, m) {
  const rows = state.tx.filter((t) => t.member_id === m.id);
  let running = 0;
  const body = rows.map((t) => {
    const sign = signOf(ledger, t.col);
    running += sign * t.amount;
    const del = state.me.isOwner ? deleteButton(t) : null;
    return h('tr', null,
      h('td', { class: 'date' }, t.date),
      h('td', null, h('span', { class: 'pill ' + (sign > 0 ? 'plus' : 'minus') }, t.item),
        t.note ? h('div', { class: 'note' }, t.note) : null),
      h('td', { class: 'num' }, (sign > 0 ? '+' : '−') + money(t.amount)),
      h('td', { class: 'num' }, money(running)),
      state.me.isOwner ? h('td', null, del) : null);
  });
  const table = rows.length
    ? h('div', { class: 'stmt-scroll' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'التاريخ'), h('th', null, 'البند'), h('th', null, 'المبلغ'), h('th', null, 'الرصيد'),
        state.me.isOwner ? h('th', null, '') : null)),
      h('tbody', null, body)))
    : h('p', { class: 'note' }, 'لا توجد حركات.');
  return h('div', { class: 'stmt' }, table, state.me.isOwner && !ledger.private ? linkUser(m) : null);
}

function deleteButton(t) {
  const b = h('button', { class: 'btn ghost small del', type: 'button', 'aria-label': 'حذف الحركة' }, '×');
  let armed = false;
  let timer;
  b.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      b.textContent = 'حذف؟';
      b.className = 'btn danger small del';
      timer = setTimeout(() => { armed = false; b.textContent = '×'; b.className = 'btn ghost small del'; }, 4000);
      return;
    }
    clearTimeout(timer);
    b.disabled = true;
    try {
      await api('DELETE', '/api/tx/' + t.id);
      state.tx = state.tx.filter((x) => x.id !== t.id);
      toast('حُذفت الحركة');
      renderAll();
    } catch (ex) {
      toast(ex.message);
      b.disabled = false;
    }
  });
  return b;
}

function linkUser(m) {
  const id = 'link-' + m.id;
  const sel = h('select', { id },
    h('option', { value: '' }, 'غير مربوط'),
    (state.users || []).filter((u) => !u.is_owner).map((u) =>
      h('option', { value: String(u.id) }, u.name + ' (' + u.username + ')' + (u.disabled ? ' موقوف' : ''))));
  sel.value = m.user_id ? String(m.user_id) : '';
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try {
      const { member } = await api('PATCH', '/api/members/' + m.id, { user_id: sel.value ? Number(sel.value) : null });
      Object.assign(m, member);
      toast(member.user_id ? `رُبط حساب ${m.name}` : `فُكّ ربط حساب ${m.name}`);
    } catch (ex) {
      toast(ex.message);
      sel.value = m.user_id ? String(m.user_id) : '';
    } finally {
      sel.disabled = false;
    }
  });
  return h('div', { class: 'link-row' }, h('label', { for: id }, 'من يرى هذا الكشف من العائلة', sel));
}

function renderAddMember(ledger) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const name = h('input', { id: 'n-name', maxlength: '40', required: true });
  const role = h('input', { id: 'n-role', maxlength: '20', placeholder: 'اختياري' });
  const btn = h('button', { class: 'btn full', type: 'submit' }, 'فتح الحساب');
  const form = h('form', {
    class: 'entry', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!name.value.trim()) { err.textContent = 'اكتب الاسم.'; return; }
      btn.disabled = true;
      try {
        const { member } = await api('POST', '/api/members', { ledger_id: ledger.id, name: name.value, role_label: role.value });
        state.members.push(member);
        state.openMember = member.id;
        toast(`فُتح حساب ${member.name}`);
        renderAll();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    },
  },
  h('label', { for: 'n-name' }, 'الاسم', name),
  h('label', { for: 'n-role' }, 'الصفة', role),
  h('div', { class: 'full' }, err),
  btn);
  return h('section', { class: 'card', 'aria-label': 'فتح حساب جديد' }, h('h2', null, 'فتح حساب جديد في هذا الدفتر'), form);
}

// ---------------------------------------------------------------- الدفاتر (للمالك)
const KIND_LABELS = { debts: 'ديون: دين وسداد وإبراء', fund: 'صندوق: إيداع وسحب' };

function renderNewLedger() {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const name = h('input', { id: 'g-name', maxlength: '60' });
  const kind = h('select', { id: 'g-kind' }, Object.entries(KIND_LABELS).map(([k, v]) => h('option', { value: k }, v)));
  const priv = h('select', { id: 'g-priv' }, h('option', { value: '0' }, 'يمكن ربط كشوفه بأفراد العائلة'), h('option', { value: '1' }, 'خاص بي وحدي'));
  const btn = h('button', { class: 'btn full', type: 'submit' }, 'إنشاء الدفتر');
  const form = h('form', {
    class: 'entry', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        const { ledger } = await api('POST', '/api/ledgers', { name: name.value, kind: kind.value, private: priv.value === '1' });
        state.ledgers.push(ledger);
        state.current = ledger.id;
        toast(`أُنشئ ${ledger.name}`);
        renderAll();
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    },
  },
  h('label', { class: 'full', for: 'g-name' }, 'اسم الدفتر', name),
  h('label', { for: 'g-kind' }, 'النوع', kind),
  h('label', { for: 'g-priv' }, 'الخصوصية', priv),
  h('div', { class: 'full' }, err), btn);
  return h('section', { class: 'card' }, h('h2', null, 'دفتر جديد'), form);
}

function renderLedgerSettings(ledger) {
  const name = h('input', { id: 's-name', maxlength: '60', value: ledger.name });
  const priv = h('select', { id: 's-priv' }, h('option', { value: '0' }, 'يمكن ربط كشوفه بأفراد العائلة'), h('option', { value: '1' }, 'خاص بي وحدي'));
  priv.value = ledger.private ? '1' : '0';
  const btn = h('button', { class: 'btn ghost full', type: 'submit' }, 'حفظ');
  const form = h('form', {
    class: 'entry', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const { ledger: l } = await api('PATCH', '/api/ledgers/' + ledger.id, { name: name.value, private: priv.value === '1' });
        Object.assign(ledger, l);
        if (l.private) state.members.forEach((m) => { if (m.ledger_id === l.id) m.user_id = null; });
        toast('حُفظت إعدادات الدفتر');
        renderAll();
      } catch (ex) { toast(ex.message); btn.disabled = false; }
    },
  },
  h('label', { for: 's-name' }, 'اسم الدفتر', name),
  h('label', { for: 's-priv' }, 'الخصوصية', priv),
  btn);
  return h('section', { class: 'card' }, h('h2', null, 'إعدادات الدفتر'), form);
}

// ---------------------------------------------------------------- أفراد العائلة (للمالك)
function renderFamily() {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const name = h('input', { id: 'u-name', maxlength: '40' });
  const username = h('input', { id: 'u-user', class: 'ltr', maxlength: '30', autocapitalize: 'none', autocomplete: 'off', placeholder: 'mona' });
  const pw = h('input', { id: 'u-pw', class: 'ltr', maxlength: '128', autocomplete: 'new-password', placeholder: '8 أحرف على الأقل' });
  const btn = h('button', { class: 'btn full', type: 'submit' }, 'إضافة');
  const form = h('form', {
    class: 'entry', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        const { user } = await api('POST', '/api/users', { name: name.value, username: username.value, password: pw.value });
        state.users.push(user);
        toast(`أُضيف ${user.name}. أعطه اسم المستخدم وكلمة المرور`);
        renderAll();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    },
  },
  h('label', { class: 'full', for: 'u-name' }, 'الاسم', name),
  h('label', { for: 'u-user' }, 'اسم المستخدم (إنجليزي)', username),
  h('label', { for: 'u-pw' }, 'كلمة المرور', pw),
  h('div', { class: 'full' }, err), btn);

  const rows = state.users.filter((u) => !u.is_owner).map((u) => {
    const linked = state.members.filter((m) => m.user_id === u.id)
      .map((m) => (ledgerOf(m.ledger_id) || {}).name?.replace(/^دفتر \d+: /, '') + ': ' + m.name);
    const reset = h('button', { class: 'btn ghost small', type: 'button' }, 'كلمة مرور جديدة');
    const toggle = h('button', { class: 'btn ghost small', type: 'button' }, u.disabled ? 'تفعيل' : 'إيقاف');
    const row = h('div', { class: 'user-row' + (u.disabled ? ' off' : '') },
      h('div', null, h('div', { class: 'name' }, u.name, ' ', h('span', { class: 'uname' }, u.username)),
        h('div', { class: 'note' }, linked.length ? 'يرى: ' + linked.join('، ') : 'لم يُربط بأي كشف بعد')),
      h('div', { class: 'actions' }, reset, toggle));
    reset.addEventListener('click', () => {
      const inp = h('input', { class: 'ltr', maxlength: '128', placeholder: 'كلمة المرور الجديدة', autocomplete: 'new-password' });
      const save = h('button', { class: 'btn small', type: 'button' }, 'حفظ');
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await api('PATCH', '/api/users/' + u.id, { password: inp.value });
          toast(`تغيّرت كلمة مرور ${u.name}`);
          renderAll();
        } catch (ex) { toast(ex.message); save.disabled = false; }
      });
      reset.replaceWith(h('div', { class: 'actions' }, inp, save));
      inp.focus();
    });
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        const { user } = await api('PATCH', '/api/users/' + u.id, { disabled: !u.disabled });
        Object.assign(u, user);
        toast(user.disabled ? `أُوقف ${u.name}` : `فُعّل ${u.name}`);
        renderAll();
      } catch (ex) { toast(ex.message); toggle.disabled = false; }
    });
    return row;
  });

  return h('div', { class: 'stack' },
    h('section', { class: 'card' }, h('h2', null, 'إضافة فرد'), form),
    h('section', { class: 'card' }, h('h2', null, 'أفراد العائلة'),
      h('p', { class: 'note' }, 'بعد الإضافة افتح الدفتر، ثم كشف الاسم، واختر من يراه من القائمة.'),
      h('div', { class: 'users-list' }, rows.length ? rows : h('p', { class: 'note' }, 'لم تُضف أحدًا بعد.'))));
}

// ---------------------------------------------------------------- الدخول وكلمة المرور
function renderLogin() {
  document.getElementById('who').hidden = true;
  document.getElementById('tabs').hidden = true;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const user = h('input', { id: 'l-user', class: 'ltr', autocapitalize: 'none', autocomplete: 'username', required: true });
  const pw = h('input', { id: 'l-pw', class: 'ltr', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'دخول');
  const form = h('form', {
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        await api('POST', '/api/login', { username: user.value, password: pw.value });
        await start();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    },
  },
  h('label', { for: 'l-user' }, 'اسم المستخدم', user),
  h('label', { for: 'l-pw' }, 'كلمة المرور', pw),
  err, btn);
  document.getElementById('app').replaceChildren(h('section', { class: 'card login' }, h('h2', null, 'تسجيل الدخول'), form));
  user.focus();
}

function withPw(parts) {
  if (!state.showPw) return parts;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const cur = h('input', { id: 'p-cur', class: 'ltr', type: 'password', autocomplete: 'current-password' });
  const next = h('input', { id: 'p-new', class: 'ltr', type: 'password', autocomplete: 'new-password', placeholder: '8 أحرف على الأقل' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'حفظ');
  const cancel = h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.showPw = false; renderAll(); } }, 'إلغاء');
  const form = h('form', {
    class: 'entry', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        await api('POST', '/api/password', { current: cur.value, next: next.value });
        state.showPw = false;
        toast('تغيّرت كلمة المرور');
        renderAll();
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    },
  },
  h('label', { for: 'p-cur' }, 'كلمة المرور الحالية', cur),
  h('label', { for: 'p-new' }, 'الجديدة', next),
  h('div', { class: 'full' }, err), btn, cancel);
  return [h('section', { class: 'card' }, h('h2', null, 'تغيير كلمة المرور'), form), ...parts];
}

document.getElementById('btn-pw').addEventListener('click', () => { state.showPw = !state.showPw; renderAll(); window.scrollTo(0, 0); });
document.getElementById('btn-out').addEventListener('click', async () => {
  try { await api('POST', '/api/logout'); } catch { /* نكمل */ }
  Object.assign(state, { me: null, ledgers: [], members: [], tx: [], users: [], current: null, showPw: false });
  renderLogin();
});

// ---------------------------------------------------------------- البدء
async function start() {
  try {
    const data = await api('GET', '/api/data');
    Object.assign(state, { users: [] }, data);
    document.getElementById('who-name').textContent = data.me.name;
    document.getElementById('who').hidden = false;
    state.current = state.ledgers[0] ? state.ledgers[0].id : (data.me.isOwner ? '__new' : null);
    renderAll();
  } catch (ex) {
    if (!document.querySelector('.login')) document.getElementById('app').replaceChildren(h('p', { class: 'state' }, ex.message));
  }
}
start();
