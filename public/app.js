'use strict';

const state = { me: null, ledgers: [], members: [], tx: [], current: null, openMember: null };

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
    if (res.status === 401) throw new Error('انتهت الجلسة. حدّث الصفحة وسجّل الدخول من جديد.');
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
  nav.replaceChildren(...state.ledgers.map((l) =>
    h('button', {
      class: 'tab', role: 'tab', type: 'button',
      'aria-selected': String(l.id === state.current),
      onclick: () => { state.current = l.id; state.openMember = null; renderAll(); },
    }, l.name)));
  nav.hidden = state.ledgers.length < 2;
}

function renderAll() {
  renderTabs();
  const app = document.getElementById('app');
  const ledger = ledgerOf(state.current);
  if (!ledger) {
    app.replaceChildren(h('p', { class: 'state' },
      state.me.isOwner ? 'لا توجد دفاتر بعد.' :
        'لا توجد حسابات مربوطة ببريدك بعد. اطلب من صاحب الدفاتر ربط حسابك ببريدك هذا.'));
    return;
  }
  const members = state.members.filter((m) => m.ledger_id === ledger.id);
  const parts = [renderSummary(ledger, members)];
  if (state.me.isOwner) parts.push(renderEntry(ledger, members));
  parts.push(renderAccounts(ledger, members));
  if (state.me.isOwner) parts.push(renderAddMember(ledger));
  app.replaceChildren(...parts);
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
    const sub = ledger.config.cols.filter((c) => totals[c.key]).map((c) => `${c.label} ${money(totals[c.key])}`).join('، ');
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
  return h('div', { class: 'stmt' }, table, state.me.isOwner && !ledger.private ? linkEmail(m) : null);
}

function deleteButton(t) {
  const b = h('button', { class: 'btn ghost small', type: 'button' }, 'حذف');
  let armed = false;
  let timer;
  b.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      b.textContent = 'تأكيد الحذف';
      b.className = 'btn danger small';
      timer = setTimeout(() => { armed = false; b.textContent = 'حذف'; b.className = 'btn ghost small'; }, 4000);
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

function linkEmail(m) {
  const id = 'email-' + m.id;
  const input = h('input', { id, type: 'email', value: m.email || '', placeholder: 'name@example.com', autocomplete: 'off' });
  const btn = h('button', { class: 'btn ghost small', type: 'button' }, 'حفظ البريد');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const { member } = await api('PATCH', '/api/members/' + m.id, { email: input.value.trim() });
      Object.assign(m, member);
      toast(member.email ? `رُبط حساب ${m.name} بالبريد` : `فُكّ ربط حساب ${m.name}`);
    } catch (ex) {
      toast(ex.message);
    } finally {
      btn.disabled = false;
    }
  });
  return h('div', { class: 'link-row' },
    h('label', { for: id }, 'بريد صاحب الحساب (ليرى كشفه فقط)', input), btn);
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

// ---------------------------------------------------------------- البدء
async function start() {
  try {
    const data = await api('GET', '/api/data');
    Object.assign(state, data);
    document.getElementById('who-email').textContent = data.me.email;
    state.current = state.ledgers[0] ? state.ledgers[0].id : null;
    renderAll();
  } catch (ex) {
    document.getElementById('app').replaceChildren(h('p', { class: 'state' }, ex.message));
  }
}
start();
