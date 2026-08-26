const V11_REMINDER_KEY = 'junies-budget-reminders-v1';
const V11_ACCOUNT_TAB_KEY = 'junies-budget-account-tab-v1';
let v11SubmitMeta = null;

function v11Prefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(V11_REMINDER_KEY) || '{}');
    return {
      enabled: Boolean(parsed.enabled),
      reminderTime: /^\d{2}:\d{2}$/.test(parsed.reminderTime || '') ? parsed.reminderTime : '09:00',
      sent: parsed.sent && typeof parsed.sent === 'object' ? parsed.sent : {},
    };
  } catch {
    return { enabled: false, reminderTime: '09:00', sent: {} };
  }
}

function v11SavePrefs(prefs) {
  localStorage.setItem(V11_REMINDER_KEY, JSON.stringify(prefs));
}

function v11DateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function v11SameDate(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function v11TimeLabel(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return '';
  const [hour, minute] = value.split(':').map(Number);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hour, minute));
}

function v11ItemFor(payment) {
  const collection = payment.type === 'card' ? state.cards : state.bills;
  return collection.find((entry) => entry.id === payment.id);
}

function v11DueTimeFor(payment) {
  return v11ItemFor(payment)?.dueTime || '';
}

function v11PaymentDetail(payment) {
  const dueTime = v11TimeLabel(v11DueTimeFor(payment));
  if (payment.type === 'card') {
    return `Minimum <span class="money">${money.format(payment.amount)}</span>${dueTime ? ` · Pay by ${dueTime}` : ''}`;
  }
  return `<span class="money">${money.format(payment.amount)}</span>${dueTime ? ` · Due by ${dueTime}` : ''}`;
}

function v11PaymentsBetween(start, end) {
  const rows = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= lastMonth) {
    rows.push(...paymentsForMonth(cursor.getFullYear(), cursor.getMonth()));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
  const seen = new Set();
  return rows.filter((row) => {
    const signature = `${row.type}:${row.id}:${row.key}`;
    if (seen.has(signature) || row.date < startDay || row.date > endDay) return false;
    seen.add(signature);
    return true;
  }).sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
}

function v11PaymentRow(payment, showDate = true) {
  const status = paymentStatus(payment.date, payment.paid);
  const dateBlock = showDate
    ? `<div class="payment-date"><strong>${payment.date.getDate()}</strong><span>${shortMonthFmt.format(payment.date)}</span></div>`
    : '';
  return `<article class="payment-row v11-payment-row">
    ${dateBlock}
    <div class="payment-main">
      <strong>${escapeHtml(payment.name)}</strong>
      <p>${v11PaymentDetail(payment)}</p>
      <span class="status ${status.key}">${status.label}</span>
    </div>
    <div class="payment-actions">
      <button class="mini-button ${payment.paid ? 'paid' : ''}" type="button" data-v11-paid="${payment.id}" data-type="${payment.type}" data-key="${payment.key}">${payment.paid ? '✓ Paid' : 'Mark paid'}</button>
    </div>
  </article>`;
}

function v11WirePaidButtons(root) {
  root.querySelectorAll('[data-v11-paid]').forEach((button) => {
    button.addEventListener('click', () => togglePaid(button.dataset.v11Paid, button.dataset.type, button.dataset.key));
  });
}

function v11InjectUI() {
  document.body.classList.add('v11-ready');

  const dashboard = $('dashboardView');
  if (!$('dueTodaySection')) {
    const hero = dashboard.querySelector('.hero-card');
    hero.insertAdjacentHTML('afterend', `
      <section class="v11-focus-section" id="dueTodaySection">
        <div class="section-heading v11-heading"><div><p class="eyebrow">Right now</p><h2>Due today</h2></div></div>
        <div class="stack" id="dueTodayList"></div>
        <div id="dueTomorrowNotice"></div>
      </section>`);
  }

  const calendar = $('calendarView');
  if (!$('calendarMonthSummary')) {
    calendar.insertAdjacentHTML('beforeend', `
      <section class="calendar-month-summary" id="calendarMonthSummary">
        <div class="section-heading"><div><p class="eyebrow">Month overview</p><h2>Due this month</h2></div></div>
        <div class="metric-grid v11-calendar-metrics" id="calendarMetrics"></div>
        <div class="section-heading v11-agenda-heading"><div><p class="eyebrow">Full list</p><h2>Monthly agenda</h2></div></div>
        <div class="stack" id="calendarAgenda"></div>
      </section>`);
  }

  if (!$('cardDueTime')) {
    $('cardDueDay').closest('label').insertAdjacentHTML('afterend', `
      <label><span>Payment cutoff time <small>(optional)</small></span><input id="cardDueTime" type="time" /></label>`);
  }
  if (!$('billDueTime')) {
    $('billDateWrap').insertAdjacentHTML('afterend', `
      <label><span>Due time <small>(optional)</small></span><input id="billDueTime" type="time" /></label>`);
  }

  if (!$('reminderSettingsGroup')) {
    const firstGroup = $('settingsView').querySelector('.settings-group');
    firstGroup.insertAdjacentHTML('afterend', `
      <div class="settings-group" id="reminderSettingsGroup">
        <h3>Upcoming bill reminders</h3>
        <p class="muted">Get a browser notification the day before an unpaid bill or credit-card payment is due. Add a cutoff time to a card to include it in the reminder.</p>
        <div class="setting-row v11-reminder-row">
          <div><strong id="reminderStatus">Reminders are off</strong><p class="muted" id="reminderSupportText">Enable them on this device.</p></div>
          <button class="primary-button compact" id="enableRemindersButton" type="button">Enable</button>
        </div>
        <label class="v11-time-setting"><span>Reminder time</span><input id="reminderTime" type="time" value="09:00" /></label>
        <p class="helper">Browser-only reminders are checked when the tracker is open or refreshed. Guaranteed notifications while the app is fully closed require a push-notification backend.</p>
      </div>`);
  }

  if (!$('cardPaymentDialog')) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="cardPaymentDialog" class="v11-dialog">
        <form id="cardPaymentForm" class="dialog-card">
          <div class="dialog-header"><div><p class="eyebrow">Credit card payment</p><h2 id="cardPaymentTitle">Mark paid</h2></div><button class="icon-button" id="closeCardPaymentDialog" type="button" aria-label="Close">×</button></div>
          <input type="hidden" id="paymentCardId" /><input type="hidden" id="paymentMonthKey" />
          <div class="v11-payment-choice">
            <label class="choice-card"><input type="radio" name="paymentChoice" value="minimum" checked /><span><strong>Minimum payment</strong><small id="minimumChoiceAmount">$0.00</small></span></label>
            <label class="choice-card"><input type="radio" name="paymentChoice" value="other" /><span><strong>Other amount</strong><small>Enter what you actually paid</small></span></label>
          </div>
          <label id="otherPaymentWrap" hidden><span>Amount paid</span><input id="otherPaymentAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></label>
          <p class="helper" id="paymentCutoffHint"></p>
          <div class="dialog-actions"><span class="dialog-spacer"></span><button class="secondary-button" id="cancelCardPayment" type="button">Cancel</button><button class="primary-button" type="submit">Save payment</button></div>
        </form>
      </dialog>`);
  }

  if (!$('dayItemsDialog')) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="dayItemsDialog" class="v11-dialog"><div class="dialog-card"><div class="dialog-header"><div><p class="eyebrow">Due-date details</p><h2 id="dayItemsTitle">Items due</h2></div><button class="icon-button" id="closeDayItemsDialog" type="button" aria-label="Close">×</button></div><div class="stack" id="dayItemsList"></div></div></dialog>`);
  }
}

const v11BaseTogglePaid = togglePaid;
togglePaid = function v11TogglePaid(id, type, key) {
  const collection = type === 'card' ? state.cards : state.bills;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  if (type === 'card' && !isPaid(item, key)) {
    v11OpenCardPaymentDialog(id, key);
    return;
  }
  v11BaseTogglePaid(id, type, key);
};

function v11OpenCardPaymentDialog(cardId, key) {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return;
  const minimum = Math.max(Number(card.minimumPayment) || 0, 0);
  const current = typeof paidAmountFor === 'function' ? paidAmountFor(card, key) : 0;
  $('paymentCardId').value = cardId;
  $('paymentMonthKey').value = key;
  $('cardPaymentTitle').textContent = `Pay ${card.name}`;
  $('minimumChoiceAmount').textContent = money.format(minimum);
  $('otherPaymentAmount').value = current && Math.abs(current - minimum) > 0.005 ? current : '';
  const other = current > 0 && Math.abs(current - minimum) > 0.005;
  document.querySelector(`input[name="paymentChoice"][value="${other ? 'other' : 'minimum'}"]`).checked = true;
  $('otherPaymentWrap').hidden = !other;
  const cutoff = v11TimeLabel(card.dueTime);
  $('paymentCutoffHint').textContent = cutoff ? `Payment cutoff: ${cutoff} on the due date.` : 'No payment cutoff time is saved for this card.';
  $('cardPaymentDialog').showModal();
  if (other) setTimeout(() => $('otherPaymentAmount').focus(), 20);
}

function v11SaveCardPayment(event) {
  event.preventDefault();
  const card = state.cards.find((entry) => entry.id === $('paymentCardId').value);
  const key = $('paymentMonthKey').value;
  if (!card || !key) return;
  const choice = document.querySelector('input[name="paymentChoice"]:checked')?.value || 'minimum';
  const amount = choice === 'minimum'
    ? Math.max(Number(card.minimumPayment) || 0, 0)
    : Math.max(Number($('otherPaymentAmount').value) || 0, 0);
  if (choice === 'other' && amount <= 0) {
    showToast('Enter the amount you paid.');
    $('otherPaymentAmount').focus();
    return;
  }
  card.monthlyPaidAmounts = { ...(typeof paymentAmountMap === 'function' ? paymentAmountMap(card) : card.monthlyPaidAmounts || {}) };
  if (amount > 0) card.monthlyPaidAmounts[key] = amount;
  else delete card.monthlyPaidAmounts[key];
  card.paidMonths ||= [];
  if (!card.paidMonths.includes(key)) card.paidMonths.push(key);
  saveState();
  $('cardPaymentDialog').close();
  renderAll();
  showToast(`Marked ${card.name} paid: ${money.format(amount)}.`);
}

const v11BaseOpenDialog = openDialog;
openDialog = function v11OpenDialog(type = 'card', id = null) {
  v11BaseOpenDialog(type, id);
  const collection = type === 'card' ? state.cards : state.bills;
  const item = id ? collection.find((entry) => entry.id === id) : null;
  $('cardDueTime').value = type === 'card' ? (item?.dueTime || '') : '';
  $('billDueTime').value = type === 'bill' ? (item?.dueTime || '') : '';
};

function v11CaptureExtraFields() {
  const type = $('itemType').value;
  const beforeIds = new Set((type === 'card' ? state.cards : state.bills).map((item) => item.id));
  v11SubmitMeta = {
    type,
    existingId: $('itemId').value || null,
    beforeIds,
    dueTime: type === 'card' ? $('cardDueTime').value : $('billDueTime').value,
  };
}

function v11PersistExtraFields() {
  if (!v11SubmitMeta) return;
  const collection = v11SubmitMeta.type === 'card' ? state.cards : state.bills;
  let item = v11SubmitMeta.existingId ? collection.find((entry) => entry.id === v11SubmitMeta.existingId) : null;
  if (!item) item = collection.find((entry) => !v11SubmitMeta.beforeIds.has(entry.id));
  if (item) {
    item.dueTime = v11SubmitMeta.dueTime || '';
    saveState();
    renderAll();
  }
  v11SubmitMeta = null;
}

const v11BaseSetAccountType = setAccountType;
setAccountType = function v11SetAccountType(type) {
  v11BaseSetAccountType(type);
  localStorage.setItem(V11_ACCOUNT_TAB_KEY, type);
  v11UpdateAccountTabs();
};

function v11UpdateAccountTabs() {
  if ($('cardsSegment')) $('cardsSegment').textContent = `Credit cards (${state.cards.length})`;
  if ($('billsSegment')) $('billsSegment').textContent = `Bills (${state.bills.length})`;
  if ($('addItemButton')) $('addItemButton').textContent = activeAccountType === 'card' ? '+ Add card' : '+ Add bill';
  const picker = $('paymentMonthPickerWrap');
  if (picker) picker.hidden = activeAccountType !== 'card';
}

function v11CompactCardEditors() {
  const cardsList = $('cardsList');
  if (!cardsList || typeof paidAmountFor !== 'function' || typeof projectedBalanceFor !== 'function') return;
  cardsList.querySelectorAll('[data-edit-card]').forEach((editButton) => {
    const card = state.cards.find((entry) => entry.id === editButton.dataset.editCard);
    const account = editButton.closest('.account-card');
    const editor = account?.querySelector('.monthly-payment-editor');
    if (!card || !editor) return;
    const paid = paidAmountFor(card, selectedPaymentMonth);
    const balance = projectedBalanceFor(card, selectedPaymentMonth);
    editor.innerHTML = `
      <div class="payment-comparison">${paymentComparison(card, paid)}</div>
      <div class="balance-status">${balanceStatusText(card, selectedPaymentMonth)}</div>
      <div class="v11-balance-adjust">
        <label><span>Starting balance in ${paymentMonthLabel(selectedPaymentMonth, true)}</span><input class="monthly-balance-input" type="number" min="0" step="0.01" inputmode="decimal" value="${balance}" /></label>
        <button class="mini-button" type="button" data-save-balance="${card.id}">Update balance</button>
      </div>
      <p class="balance-helper">Payments are now entered from “Mark paid.” Use this only to correct the carried-forward balance for purchases, interest, fees, or refunds.</p>`;
    editor.querySelector('[data-save-balance]').addEventListener('click', () => {
      const input = editor.querySelector('.monthly-balance-input');
      saveMonthlyCardData(card.id, selectedPaymentMonth, paidAmountFor(card, selectedPaymentMonth), input.value);
    });
  });
  updatePaymentInputPrivacy();
}

const v11BaseRenderAccounts = renderAccounts;
renderAccounts = function v11RenderAccounts() {
  v11BaseRenderAccounts();
  v11CompactCardEditors();
  v11UpdateAccountTabs();
};

function v11RenderDashboardFocus() {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const sevenDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const dueToday = v11PaymentsBetween(today, today);
  const dueTomorrow = v11PaymentsBetween(tomorrow, tomorrow).filter((p) => !p.paid);
  const comingUp = v11PaymentsBetween(tomorrow, sevenDays);

  const todayList = $('dueTodayList');
  todayList.innerHTML = dueToday.length
    ? dueToday.map((payment) => v11PaymentRow(payment, false)).join('')
    : '<div class="v11-clear-card"><strong>Nothing due today</strong><p>You are clear for today.</p></div>';
  v11WirePaidButtons(todayList);

  const tomorrowNotice = $('dueTomorrowNotice');
  tomorrowNotice.innerHTML = dueTomorrow.length
    ? `<div class="v11-tomorrow-card"><div><strong>${dueTomorrow.length} ${dueTomorrow.length === 1 ? 'payment' : 'payments'} due tomorrow</strong><p>${dueTomorrow.map((p) => `${escapeHtml(p.name)}${v11TimeLabel(v11DueTimeFor(p)) ? ` by ${v11TimeLabel(v11DueTimeFor(p))}` : ''}`).join(' · ')}</p></div><span>Tomorrow</span></div>`
    : '';

  const upcoming = $('upcomingList');
  upcoming.innerHTML = comingUp.length
    ? comingUp.map((payment) => v11PaymentRow(payment, true)).join('')
    : '<div class="v11-clear-card"><strong>No payments in the next 7 days</strong><p>Your calendar has the full monthly list.</p></div>';
  v11WirePaidButtons(upcoming);

  const heading = upcoming.previousElementSibling?.querySelector('h2');
  const eyebrow = upcoming.previousElementSibling?.querySelector('.eyebrow');
  if (heading) heading.textContent = 'Coming up';
  if (eyebrow) eyebrow.textContent = 'Next 7 days';
}

const v11BaseRenderDashboard = renderDashboard;
renderDashboard = function v11RenderDashboard() {
  v11BaseRenderDashboard();
  v11RenderDashboardFocus();
};

function v11RenderCalendarSummary() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const payments = paymentsForMonth(year, month);
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = payments.filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0);
  const paidCount = payments.filter((p) => p.paid).length;
  const cardPaid = typeof paidAmountFor === 'function'
    ? state.cards.reduce((sum, card) => sum + paidAmountFor(card, key), 0)
    : 0;

  $('calendarMetrics').innerHTML = `
    <article class="metric-card"><span class="metric-label">Due</span><strong class="metric-value money">${money.format(total)}</strong></article>
    <article class="metric-card"><span class="metric-label">Remaining</span><strong class="metric-value money">${money.format(remaining)}</strong></article>
    <article class="metric-card"><span class="metric-label">Paid items</span><strong class="metric-value">${paidCount} / ${payments.length}</strong></article>
    <article class="metric-card"><span class="metric-label">Card payments</span><strong class="metric-value money">${money.format(cardPaid)}</strong></article>`;

  const agenda = $('calendarAgenda');
  agenda.innerHTML = payments.length
    ? payments.map((payment) => v11PaymentRow(payment, true)).join('')
    : '<div class="v11-clear-card"><strong>No items this month</strong><p>Add a card or bill to put it on the calendar.</p></div>';
  v11WirePaidButtons(agenda);
}

function v11OpenDayDialog(date, payments) {
  $('dayItemsTitle').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
  const list = $('dayItemsList');
  list.innerHTML = payments.map((payment) => v11PaymentRow(payment, false)).join('');
  v11WirePaidButtons(list);
  $('dayItemsDialog').showModal();
}

function v11EnhanceCalendarOverflow() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const payments = paymentsForMonth(year, month);
  $('calendarGrid').querySelectorAll('.calendar-day:not(.other-month)').forEach((day) => {
    const dayNumber = Number(day.querySelector('.day-number')?.textContent);
    const rows = payments.filter((payment) => payment.date.getDate() === dayNumber);
    if (rows.length <= 2) return;
    const oldMore = day.querySelector('.more-items');
    if (!oldMore) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'more-items v11-more-items';
    button.textContent = `View all ${rows.length}`;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      v11OpenDayDialog(new Date(year, month, dayNumber), rows);
    });
    oldMore.replaceWith(button);
  });
}

const v11BaseRenderCalendar = renderCalendar;
renderCalendar = function v11RenderCalendar() {
  v11BaseRenderCalendar();
  v11RenderCalendarSummary();
  v11EnhanceCalendarOverflow();
};

function v11RefreshReminderSettings() {
  const prefs = v11Prefs();
  $('reminderTime').value = prefs.reminderTime;
  const supported = 'Notification' in window;
  const permission = supported ? Notification.permission : 'unsupported';
  if (!supported) {
    $('reminderStatus').textContent = 'Notifications are not supported';
    $('reminderSupportText').textContent = 'This browser does not expose the Notifications API.';
    $('enableRemindersButton').disabled = true;
    return;
  }
  if (permission === 'denied') {
    $('reminderStatus').textContent = 'Notifications are blocked';
    $('reminderSupportText').textContent = 'Allow notifications for this site in your browser settings.';
    $('enableRemindersButton').textContent = 'Blocked';
    return;
  }
  $('reminderStatus').textContent = prefs.enabled && permission === 'granted' ? 'Reminders are on' : 'Reminders are off';
  $('reminderSupportText').textContent = prefs.enabled && permission === 'granted' ? `Day-before reminders are set for ${v11TimeLabel(prefs.reminderTime)}.` : 'Enable them on this device.';
  $('enableRemindersButton').textContent = prefs.enabled && permission === 'granted' ? 'Enabled' : 'Enable';
}

async function v11EnableReminders() {
  if (!('Notification' in window)) return;
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    v11RefreshReminderSettings();
    showToast('Notifications were not enabled.');
    return;
  }
  const prefs = v11Prefs();
  prefs.enabled = true;
  prefs.reminderTime = $('reminderTime').value || '09:00';
  v11SavePrefs(prefs);
  v11RefreshReminderSettings();
  v11CheckReminders();
  showToast('Upcoming bill reminders enabled.');
}

async function v11ShowNotification(title, options) {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    // The in-app due-tomorrow card remains available even if a system notification fails.
  }
}

async function v11CheckReminders() {
  const prefs = v11Prefs();
  if (!prefs.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const [targetHour, targetMinute] = prefs.reminderTime.split(':').map(Number);
  if (now.getHours() < targetHour || (now.getHours() === targetHour && now.getMinutes() < targetMinute)) return;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const payments = v11PaymentsBetween(tomorrow, tomorrow).filter((payment) => !payment.paid);
  const sendDate = v11DateKey(now);
  for (const payment of payments) {
    const sentKey = `${sendDate}:${payment.type}:${payment.id}`;
    if (prefs.sent[sentKey]) continue;
    const dueTime = v11TimeLabel(v11DueTimeFor(payment));
    const body = payment.type === 'card'
      ? `Minimum ${money.format(payment.amount)} due tomorrow${dueTime ? ` before ${dueTime}` : ''}.`
      : `${money.format(payment.amount)} due tomorrow${dueTime ? ` by ${dueTime}` : ''}.`;
    await v11ShowNotification(`${payment.name} is due tomorrow`, { body, icon: './icon.svg', tag: `budget-${payment.type}-${payment.id}-${payment.key}` });
    prefs.sent[sentKey] = Date.now();
  }
  const cutoff = Date.now() - 45 * 86400000;
  Object.keys(prefs.sent).forEach((key) => { if (prefs.sent[key] < cutoff) delete prefs.sent[key]; });
  v11SavePrefs(prefs);
}

function v11BindEvents() {
  $('cardPaymentForm').addEventListener('submit', v11SaveCardPayment);
  $('closeCardPaymentDialog').addEventListener('click', () => $('cardPaymentDialog').close());
  $('cancelCardPayment').addEventListener('click', () => $('cardPaymentDialog').close());
  document.querySelectorAll('input[name="paymentChoice"]').forEach((radio) => radio.addEventListener('change', () => {
    const other = document.querySelector('input[name="paymentChoice"]:checked')?.value === 'other';
    $('otherPaymentWrap').hidden = !other;
    if (other) $('otherPaymentAmount').focus();
  }));
  $('closeDayItemsDialog').addEventListener('click', () => $('dayItemsDialog').close());
  $('enableRemindersButton').addEventListener('click', v11EnableReminders);
  $('reminderTime').addEventListener('change', () => {
    const prefs = v11Prefs();
    prefs.reminderTime = $('reminderTime').value || '09:00';
    v11SavePrefs(prefs);
    v11RefreshReminderSettings();
    v11CheckReminders();
  });
  $('itemForm').addEventListener('submit', v11CaptureExtraFields, true);
  $('itemForm').addEventListener('submit', v11PersistExtraFields);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) v11CheckReminders(); });
  window.addEventListener('focus', v11CheckReminders);
  setInterval(v11CheckReminders, 30 * 60 * 1000);
}

v11InjectUI();
v11BindEvents();
v11RefreshReminderSettings();
const savedAccountTab = localStorage.getItem(V11_ACCOUNT_TAB_KEY);
if (savedAccountTab === 'bill' || savedAccountTab === 'card') activeAccountType = savedAccountTab;
renderAll();
setAccountType(activeAccountType);
v11CheckReminders();
