const STORAGE_KEY = 'junies-budget-tracker-v1';

const defaultState = {
  cards: [],
  bills: [],
  settings: { hideByDefault: false },
};

let state = loadState();
let balancesHidden = Boolean(state.settings.hideByDefault);
let calendarCursor = new Date();
calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
let activeAccountType = 'card';
let toastTimer;

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const shortMonthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(input) {
  return {
    cards: Array.isArray(input?.cards) ? input.cards.map((card) => ({ ...card, paidMonths: Array.isArray(card.paidMonths) ? card.paidMonths : [] })) : [],
    bills: Array.isArray(input?.bills) ? input.bills.map((bill) => ({ ...bill, paidMonths: Array.isArray(bill.paidMonths) ? bill.paidMonths : [] })) : [],
    settings: { hideByDefault: Boolean(input?.settings?.hideByDefault) },
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function safeDay(year, month, day) {
  return Math.min(Math.max(Number(day) || 1, 1), daysInMonth(year, month));
}

function itemDueDate(item, type, year, month) {
  if (type === 'bill' && !item.recurring) {
    if (!item.dueDate) return null;
    const [y, m, d] = item.dueDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const day = safeDay(year, month, item.dueDay);
  return new Date(year, month, day);
}

function amountFor(item, type) {
  return type === 'card' ? Number(item.minimumPayment) || 0 : Number(item.amount) || 0;
}

function isPaid(item, key) {
  return Array.isArray(item.paidMonths) && item.paidMonths.includes(key);
}

function togglePaid(id, type, key) {
  const collection = type === 'card' ? state.cards : state.bills;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  item.paidMonths ||= [];
  if (item.paidMonths.includes(key)) item.paidMonths = item.paidMonths.filter((m) => m !== key);
  else item.paidMonths.push(key);
  saveState();
  renderAll();
}

function paymentStatus(dueDate, paid, referenceDate = new Date()) {
  if (paid) return { key: 'paid', label: 'Paid' };
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diffDays = Math.ceil((due - today) / 86400000);
  if (diffDays < 0) return { key: 'overdue', label: 'Overdue' };
  if (diffDays <= 7) return { key: 'soon', label: diffDays === 0 ? 'Due today' : `Due in ${diffDays}d` };
  return { key: 'upcoming', label: 'Upcoming' };
}

function paymentsForMonth(year, month) {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const rows = [];
  state.cards.forEach((card) => {
    const date = itemDueDate(card, 'card', year, month);
    if (date) rows.push({ id: card.id, type: 'card', name: card.name, amount: amountFor(card, 'card'), date, paid: isPaid(card, key), key });
  });
  state.bills.forEach((bill) => {
    const date = itemDueDate(bill, 'bill', year, month);
    if (!date || date.getFullYear() !== year || date.getMonth() !== month) return;
    rows.push({ id: bill.id, type: 'bill', name: bill.name, amount: amountFor(bill, 'bill'), date, paid: isPaid(bill, key), key });
  });
  return rows.sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
}

function renderDashboard() {
  const totalBalance = state.cards.reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  const totalLimit = state.cards.reduce((sum, c) => sum + (Number(c.limit) || 0), 0);
  const available = state.cards.reduce((sum, c) => sum + Math.max((Number(c.limit) || 0) - (Number(c.balance) || 0), 0), 0);
  const utilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

  $('totalBalance').textContent = money.format(totalBalance);
  $('availableCredit').textContent = money.format(available);
  $('utilization').textContent = `${utilization.toFixed(utilization >= 10 ? 0 : 1)}%`;

  const now = new Date();
  const payments = paymentsForMonth(now.getFullYear(), now.getMonth());
  const totalDue = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = payments.filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0);
  const paid = payments.filter((p) => p.paid).length;

  $('dueThisMonth').textContent = money.format(totalDue);
  $('remainingThisMonth').textContent = money.format(remaining);
  $('paidCount').textContent = `${paid} / ${payments.length}`;

  const next = payments.find((p) => !p.paid && p.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) || payments.find((p) => !p.paid);
  $('nextPayment').textContent = next ? `${shortMonthFmt.format(next.date)} ${next.date.getDate()}` : 'Nothing due';

  const list = $('upcomingList');
  list.innerHTML = '';
  if (!payments.length) {
    list.append(emptyState('No payments yet', 'Add a credit card or bill to start building your monthly plan.', 'Add your first item'));
    return;
  }

  payments.forEach((payment) => {
    const status = paymentStatus(payment.date, payment.paid);
    const row = document.createElement('article');
    row.className = 'payment-row';
    row.innerHTML = `
      <div class="payment-date"><strong>${payment.date.getDate()}</strong><span>${shortMonthFmt.format(payment.date)}</span></div>
      <div class="payment-main">
        <strong>${escapeHtml(payment.name)}</strong>
        <p>${payment.type === 'card' ? 'Credit card minimum' : 'Bill'} · <span class="money">${money.format(payment.amount)}</span></p>
        <span class="status ${status.key}">${status.label}</span>
      </div>
      <div class="payment-actions">
        <button class="mini-button ${payment.paid ? 'paid' : ''}" type="button" data-paid="${payment.id}" data-type="${payment.type}" data-key="${payment.key}">${payment.paid ? '✓ Paid' : 'Mark paid'}</button>
      </div>`;
    list.append(row);
  });

  list.querySelectorAll('[data-paid]').forEach((button) => {
    button.addEventListener('click', () => togglePaid(button.dataset.paid, button.dataset.type, button.dataset.key));
  });
}

function renderAccounts() {
  const cardsList = $('cardsList');
  const billsList = $('billsList');
  cardsList.innerHTML = '';
  billsList.innerHTML = '';

  if (!state.cards.length) cardsList.append(emptyState('No credit cards added', 'Track balances, limits, utilization, minimum payments, and due dates.', 'Add credit card', 'card'));
  state.cards.forEach((card) => {
    const balance = Number(card.balance) || 0;
    const limit = Number(card.limit) || 0;
    const util = limit > 0 ? (balance / limit) * 100 : 0;
    const article = document.createElement('article');
    article.className = 'account-card';
    article.innerHTML = `
      <div class="account-icon">CC</div>
      <div class="account-main">
        <strong>${escapeHtml(card.name)}</strong>
        <p><span class="money">${money.format(balance)}</span> balance</p>
        <div class="account-details">
          <span>${util.toFixed(util >= 10 ? 0 : 1)}% utilized</span>
          <span>Due day ${card.dueDay || '—'}</span>
          <span>Min <span class="money">${money.format(Number(card.minimumPayment) || 0)}</span></span>
        </div>
        <div class="util-bar" aria-label="${util.toFixed(0)} percent utilization"><span style="width:${Math.min(util, 100)}%"></span></div>
      </div>
      <button class="mini-button" type="button" data-edit-card="${card.id}">Edit</button>`;
    cardsList.append(article);
  });

  if (!state.bills.length) billsList.append(emptyState('No bills added', 'Add recurring monthly bills or one-time expenses to see them on your calendar.', 'Add bill', 'bill'));
  state.bills.forEach((bill) => {
    const article = document.createElement('article');
    article.className = 'account-card';
    const dueText = bill.recurring ? `Due day ${bill.dueDay || '—'}` : `Due ${bill.dueDate ? formatDateString(bill.dueDate) : '—'}`;
    article.innerHTML = `
      <div class="account-icon">$</div>
      <div class="account-main">
        <strong>${escapeHtml(bill.name)}</strong>
        <p><span class="money">${money.format(Number(bill.amount) || 0)}</span></p>
        <div class="account-details"><span>${dueText}</span><span>${bill.recurring ? 'Monthly' : 'One time'}</span></div>
      </div>
      <button class="mini-button" type="button" data-edit-bill="${bill.id}">Edit</button>`;
    billsList.append(article);
  });

  cardsList.querySelectorAll('[data-edit-card]').forEach((button) => button.addEventListener('click', () => openDialog('card', button.dataset.editCard)));
  billsList.querySelectorAll('[data-edit-bill]').forEach((button) => button.addEventListener('click', () => openDialog('bill', button.dataset.editBill)));
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $('calendarTitle').textContent = monthFmt.format(calendarCursor);
  const grid = $('calendarGrid');
  grid.innerHTML = '';

  const payments = paymentsForMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const prevMonthDays = daysInMonth(year, month - 1);
  const today = new Date();

  for (let cell = 0; cell < 42; cell += 1) {
    let cellDate;
    let otherMonth = false;
    if (cell < firstDay) {
      cellDate = new Date(year, month - 1, prevMonthDays - firstDay + cell + 1);
      otherMonth = true;
    } else if (cell >= firstDay + totalDays) {
      cellDate = new Date(year, month + 1, cell - firstDay - totalDays + 1);
      otherMonth = true;
    } else {
      cellDate = new Date(year, month, cell - firstDay + 1);
    }

    const day = document.createElement('div');
    const isToday = cellDate.toDateString() === today.toDateString();
    day.className = `calendar-day${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`;
    day.innerHTML = `<div class="day-number">${cellDate.getDate()}</div>`;

    if (!otherMonth) {
      const dayPayments = payments.filter((p) => p.date.getDate() === cellDate.getDate());
      dayPayments.slice(0, 2).forEach((payment) => {
        const status = paymentStatus(payment.date, payment.paid);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `calendar-item ${status.key}`;
        button.textContent = `${payment.name} ${money.format(payment.amount)}`;
        button.setAttribute('aria-label', `${payment.name}, ${money.format(payment.amount)}, ${status.label}`);
        button.addEventListener('click', () => openDialog(payment.type, payment.id));
        day.append(button);
      });
      if (dayPayments.length > 2) {
        const more = document.createElement('span');
        more.className = 'more-items';
        more.textContent = `+${dayPayments.length - 2} more`;
        day.append(more);
      }
    }
    grid.append(day);
  }
}

function emptyState(title, text, buttonText, type = null) {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.innerHTML = `<strong>${title}</strong><p>${text}</p><button class="primary-button compact" type="button">${buttonText}</button>`;
  box.querySelector('button').addEventListener('click', () => openDialog(type || activeAccountType));
  return box;
}

function openDialog(type = 'card', id = null) {
  const dialog = $('itemDialog');
  const collection = type === 'card' ? state.cards : state.bills;
  const item = id ? collection.find((entry) => entry.id === id) : null;

  $('itemForm').reset();
  $('itemId').value = item?.id || '';
  $('itemType').value = type;
  $('dialogEyebrow').textContent = item ? 'Edit item' : 'New item';
  $('dialogTitle').textContent = `${item ? 'Edit' : 'Add'} ${type === 'card' ? 'credit card' : 'bill'}`;
  $('cardFields').hidden = type !== 'card';
  $('billFields').hidden = type !== 'bill';
  $('deleteItemButton').hidden = !item;
  $('itemName').value = item?.name || '';
  $('itemNotes').value = item?.notes || '';

  if (type === 'card') {
    $('cardBalance').value = item?.balance ?? '';
    $('cardLimit').value = item?.limit ?? '';
    $('statementBalance').value = item?.statementBalance ?? '';
    $('minimumPayment').value = item?.minimumPayment ?? '';
    $('cardDueDay').value = item?.dueDay ?? '';
  } else {
    $('billAmount').value = item?.amount ?? '';
    $('billRecurring').checked = item ? Boolean(item.recurring) : true;
    $('billDueDay').value = item?.dueDay ?? '';
    $('billDate').value = item?.dueDate ?? '';
    updateBillDateFields();
  }

  dialog.showModal();
  setTimeout(() => $('itemName').focus(), 30);
}

function updateBillDateFields() {
  const recurring = $('billRecurring').checked;
  $('billDueDayWrap').hidden = !recurring;
  $('billDateWrap').hidden = recurring;
}

function submitItem(event) {
  event.preventDefault();
  const type = $('itemType').value;
  const id = $('itemId').value || uid();
  const name = $('itemName').value.trim();
  if (!name) return;

  if (type === 'card') {
    const dueDay = clampDueDay($('cardDueDay').value);
    const payload = {
      id,
      name,
      balance: nonNegative($('cardBalance').value),
      limit: nonNegative($('cardLimit').value),
      statementBalance: nonNegative($('statementBalance').value),
      minimumPayment: nonNegative($('minimumPayment').value),
      dueDay,
      notes: $('itemNotes').value.trim(),
      paidMonths: state.cards.find((c) => c.id === id)?.paidMonths || [],
    };
    upsert(state.cards, payload);
  } else {
    const recurring = $('billRecurring').checked;
    if (!recurring && !$('billDate').value) {
      $('billDate').focus();
      showToast('Choose a due date for the one-time bill.');
      return;
    }
    const payload = {
      id,
      name,
      amount: nonNegative($('billAmount').value),
      recurring,
      dueDay: recurring ? clampDueDay($('billDueDay').value) : null,
      dueDate: recurring ? null : $('billDate').value,
      notes: $('itemNotes').value.trim(),
      paidMonths: state.bills.find((b) => b.id === id)?.paidMonths || [],
    };
    upsert(state.bills, payload);
  }

  saveState();
  $('itemDialog').close();
  renderAll();
  showToast('Saved.');
}

function upsert(collection, payload) {
  const index = collection.findIndex((entry) => entry.id === payload.id);
  if (index >= 0) collection[index] = payload;
  else collection.push(payload);
}

function deleteCurrentItem() {
  const id = $('itemId').value;
  const type = $('itemType').value;
  if (!id) return;
  const name = $('itemName').value || 'this item';
  if (!confirm(`Delete ${name}?`)) return;
  if (type === 'card') state.cards = state.cards.filter((entry) => entry.id !== id);
  else state.bills = state.bills.filter((entry) => entry.id !== id);
  saveState();
  $('itemDialog').close();
  renderAll();
  showToast('Deleted.');
}

function nonNegative(value) {
  return Math.max(Number(value) || 0, 0);
}

function clampDueDay(value) {
  return Math.min(Math.max(Math.round(Number(value) || 1), 1), 31);
}

function renderPrivacy() {
  document.body.classList.toggle('hidden-money', balancesHidden);
  $('privacyToggle').textContent = balancesHidden ? '◎' : '◉';
  $('privacyToggle').setAttribute('aria-label', balancesHidden ? 'Show balances' : 'Hide balances');
  $('privacyToggle').title = balancesHidden ? 'Show balances' : 'Hide balances';
  $('hideByDefault').checked = Boolean(state.settings.hideByDefault);
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach((view) => {
    const active = view.id === viewId;
    view.hidden = !active;
    view.classList.toggle('active', active);
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewId);
  });
  if (viewId === 'calendarView') renderCalendar();
}

function setAccountType(type) {
  activeAccountType = type;
  const cards = type === 'card';
  $('cardsSegment').classList.toggle('active', cards);
  $('billsSegment').classList.toggle('active', !cards);
  $('cardsSegment').setAttribute('aria-selected', String(cards));
  $('billsSegment').setAttribute('aria-selected', String(!cards));
  $('cardsList').hidden = !cards;
  $('billsList').hidden = cards;
}

function exportBackup() {
  const payload = { version: 1, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `junies-budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Backup exported.');
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const candidate = parsed?.data ?? parsed;
    const normalized = normalizeState(candidate);
    if (!confirm('Replace the data currently stored in this browser with this backup?')) return;
    state = normalized;
    balancesHidden = Boolean(state.settings.hideByDefault);
    saveState();
    renderAll();
    showToast('Backup imported.');
  } catch {
    showToast('That backup file could not be read.');
  } finally {
    $('importFile').value = '';
  }
}

function resetPaidForSelectedMonth() {
  const key = monthKey(calendarCursor);
  if (!confirm(`Clear paid checkmarks for ${monthFmt.format(calendarCursor)}?`)) return;
  state.cards.forEach((item) => item.paidMonths = (item.paidMonths || []).filter((m) => m !== key));
  state.bills.forEach((item) => item.paidMonths = (item.paidMonths || []).filter((m) => m !== key));
  saveState();
  renderAll();
  showToast(`Paid status reset for ${monthFmt.format(calendarCursor)}.`);
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function formatDateString(value) {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y, m - 1, d));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderAll() {
  renderDashboard();
  renderAccounts();
  renderCalendar();
  renderPrivacy();
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
$('privacyToggle').addEventListener('click', () => { balancesHidden = !balancesHidden; renderPrivacy(); });
$('quickAddButton').addEventListener('click', () => openDialog(activeAccountType));
$('addItemButton').addEventListener('click', () => openDialog(activeAccountType));
$('cardsSegment').addEventListener('click', () => setAccountType('card'));
$('billsSegment').addEventListener('click', () => setAccountType('bill'));
$('prevMonth').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendar(); });
$('nextMonth').addEventListener('click', () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendar(); });
$('billRecurring').addEventListener('change', updateBillDateFields);
$('itemForm').addEventListener('submit', submitItem);
$('deleteItemButton').addEventListener('click', deleteCurrentItem);
$('cancelDialogButton').addEventListener('click', () => $('itemDialog').close());
$('hideByDefault').addEventListener('change', (event) => { state.settings.hideByDefault = event.target.checked; saveState(); showToast('Preference saved.'); });
$('exportButton').addEventListener('click', exportBackup);
$('importButton').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', (event) => importBackup(event.target.files?.[0]));
$('resetPaidButton').addEventListener('click', resetPaidForSelectedMonth);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

renderAll();
