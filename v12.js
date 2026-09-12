const V12_RECURRENCES = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  one_time: 'One time',
};
let v12BillMonth = monthKey(new Date());
let v12SubmitMeta = null;

function v12DateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function v12ParseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function v12RecurrenceType(bill) {
  if (bill?.recurrenceType && V12_RECURRENCES[bill.recurrenceType]) return bill.recurrenceType;
  return bill?.recurring ? 'monthly' : 'one_time';
}

function v12AnchorDate(bill) {
  return bill?.anchorDate || bill?.dueDate || '';
}

function v12BillCategory(bill) {
  return String(bill?.category || '').trim() || 'Uncategorized';
}

function v12CategoryNames() {
  return [...new Set(state.bills.map(v12BillCategory).filter((name) => name !== 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
}

function v12BillOccurrencesForMonth(bill, year, month) {
  const type = v12RecurrenceType(bill);
  const results = [];
  const push = (date, key = null) => {
    if (date.getFullYear() !== year || date.getMonth() !== month) return;
    results.push({ date, key: key || `${year}-${String(month + 1).padStart(2, '0')}` });
  };

  if (type === 'monthly') {
    push(new Date(year, month, safeDay(year, month, bill.dueDay)));
    return results;
  }

  const anchor = v12ParseDate(v12AnchorDate(bill));
  if (!anchor) return results;

  if (type === 'one_time') {
    push(anchor);
    return results;
  }

  if (type === 'weekly' || type === 'biweekly') {
    const stepDays = type === 'weekly' ? 7 : 14;
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    let occurrence = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    if (occurrence < monthStart) {
      const diff = Math.floor((monthStart - occurrence) / 86400000);
      const jumps = Math.ceil(diff / stepDays);
      occurrence = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() + jumps * stepDays);
    }
    while (occurrence <= monthEnd) {
      if (occurrence >= anchor) push(new Date(occurrence), v12DateKey(occurrence));
      occurrence = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() + stepDays);
    }
    return results;
  }

  if (type === 'quarterly') {
    const monthDiff = (year - anchor.getFullYear()) * 12 + month - anchor.getMonth();
    if (monthDiff >= 0 && monthDiff % 3 === 0) {
      push(new Date(year, month, safeDay(year, month, anchor.getDate())));
    }
    return results;
  }

  if (type === 'yearly' && year >= anchor.getFullYear() && month === anchor.getMonth()) {
    push(new Date(year, month, safeDay(year, month, anchor.getDate())));
  }
  return results;
}

paymentsForMonth = function v12PaymentsForMonth(year, month) {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  const rows = [];
  state.cards.forEach((card) => {
    const date = itemDueDate(card, 'card', year, month);
    if (date) rows.push({ id: card.id, type: 'card', name: card.name, amount: amountFor(card, 'card'), date, paid: isPaid(card, key), key });
  });
  state.bills.forEach((bill) => {
    v12BillOccurrencesForMonth(bill, year, month).forEach((occurrence) => {
      rows.push({
        id: bill.id,
        type: 'bill',
        name: bill.name,
        amount: amountFor(bill, 'bill'),
        date: occurrence.date,
        paid: isPaid(bill, occurrence.key),
        key: occurrence.key,
      });
    });
  });
  return rows.sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
};

function v12InjectPages() {
  document.body.classList.add('v12-ready');
  const accounts = $('accountsView');
  const settings = $('settingsView');
  if (!accounts || !settings) return;

  const heading = accounts.querySelector('.top-section-heading');
  if (heading) {
    heading.querySelector('.eyebrow').textContent = 'Credit cards';
    heading.querySelector('h2').textContent = 'Cards';
  }
  const segmented = accounts.querySelector('.segmented');
  if (segmented) segmented.hidden = true;
  $('cardsList').hidden = false;
  $('billsList').hidden = true;
  $('addItemButton').textContent = '+ Add card';

  if (!$('cardsSummary')) {
    const anchor = $('paymentMonthPickerWrap') || $('cardsList');
    anchor.insertAdjacentHTML('beforebegin', `
      <section id="cardsSummary" class="v12-summary-block">
        <div class="section-heading v12-inline-heading"><div><p class="eyebrow">Selected month</p><h2>Card summary</h2></div></div>
        <div class="metric-grid v12-five-metrics" id="cardsSummaryMetrics"></div>
      </section>`);
  }

  if (!$('billsView')) {
    const bills = document.createElement('section');
    bills.className = 'view';
    bills.id = 'billsView';
    bills.hidden = true;
    bills.innerHTML = `
      <div class="section-heading top-section-heading">
        <div><p class="eyebrow">Monthly expenses</p><h2>Bills</h2></div>
        <button class="primary-button compact" id="addBillButton" type="button">+ Add bill</button>
      </div>
      <div class="v12-bill-toolbar">
        <label for="v12BillMonth"><span>Month</span><input id="v12BillMonth" type="month" /></label>
        <button class="secondary-button compact" id="manageCategoriesButton" type="button">Manage categories</button>
      </div>
      <section class="v12-summary-block">
        <div class="section-heading v12-inline-heading"><div><p class="eyebrow">Overview</p><h2 id="v12BillsSummaryTitle">Monthly bills</h2></div></div>
        <div class="metric-grid v12-five-metrics" id="v12BillsMetrics"></div>
      </section>
      <div class="section-heading v12-groups-heading"><div><p class="eyebrow">By category</p><h2>Bill groups</h2></div></div>
      <div id="v12BillGroups" class="v12-category-groups"></div>`;
    settings.parentNode.insertBefore(bills, settings);
  }

  const nav = document.querySelector('.bottom-nav');
  if (nav && !$('billsTab')) {
    const accountsTab = $('accountsTab');
    accountsTab.innerHTML = '<span>▤</span>Cards';
    const billTab = document.createElement('button');
    billTab.className = 'nav-item';
    billTab.id = 'billsTab';
    billTab.dataset.view = 'billsView';
    billTab.type = 'button';
    billTab.innerHTML = '<span>$</span>Bills';
    nav.insertBefore(billTab, $('calendarTab'));
    nav.insertBefore(accountsTab, billTab);
    billTab.addEventListener('click', () => showView('billsView'));
  }

  if (!$('v12BillCategory')) {
    const billFields = $('billFields');
    const categoryWrap = document.createElement('label');
    categoryWrap.className = 'v12-bill-extra';
    categoryWrap.innerHTML = '<span>Category <small>(type your own)</small></span><input id="v12BillCategory" list="v12CategoryOptions" type="text" maxlength="40" placeholder="e.g. Utilities" /><datalist id="v12CategoryOptions"></datalist>';
    billFields.prepend(categoryWrap);

    const recurringRow = $('billRecurring').closest('label');
    if (recurringRow) recurringRow.hidden = true;
    const recurrence = document.createElement('label');
    recurrence.className = 'v12-bill-extra';
    recurrence.innerHTML = `<span>Repeats</span><select id="v12BillRecurrence">${Object.entries(V12_RECURRENCES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>`;
    categoryWrap.insertAdjacentElement('afterend', recurrence);

    const autopay = document.createElement('label');
    autopay.className = 'checkbox-row v12-autopay-row';
    autopay.innerHTML = '<input id="v12BillAutopay" type="checkbox" /> <span>Autopay</span>';
    $('billDueTime').closest('label').insertAdjacentElement('afterend', autopay);
  }

  if (!$('v12CardAutopay')) {
    const autopay = document.createElement('label');
    autopay.className = 'checkbox-row v12-autopay-row';
    autopay.innerHTML = '<input id="v12CardAutopay" type="checkbox" /> <span>Autopay</span>';
    $('cardDueTime').closest('label').insertAdjacentElement('afterend', autopay);
  }

  if (!$('v12CategoryDialog')) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="v12CategoryDialog" class="v11-dialog">
        <div class="dialog-card">
          <div class="dialog-header"><div><p class="eyebrow">Bills</p><h2>Manage categories</h2></div><button class="icon-button" id="v12CloseCategoryDialog" type="button" aria-label="Close">×</button></div>
          <p class="muted v12-category-help">Rename a category across all of its bills, or remove it to move those bills to Uncategorized.</p>
          <div id="v12CategoryManager"></div>
        </div>
      </dialog>`);
  }

  $('v12BillMonth').value = v12BillMonth;
}

function v12UpdateCategoryOptions() {
  const list = $('v12CategoryOptions');
  if (!list) return;
  list.innerHTML = v12CategoryNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function v12RecurrenceText(bill) {
  return V12_RECURRENCES[v12RecurrenceType(bill)] || 'Monthly';
}

function v12BillRowsForMonth(year, month) {
  const rows = paymentsForMonth(year, month).filter((payment) => payment.type === 'bill');
  return rows.map((payment) => ({ ...payment, bill: state.bills.find((bill) => bill.id === payment.id) })).filter((row) => row.bill);
}

function v12RenderBillsPage() {
  if (!$('v12BillGroups')) return;
  const [year, month] = v12BillMonth.split('-').map(Number);
  if (!year || !month) return;
  const rows = v12BillRowsForMonth(year, month - 1);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const paidAmount = rows.filter((row) => row.paid).reduce((sum, row) => sum + row.amount, 0);
  const remaining = total - paidAmount;
  const paidCount = rows.filter((row) => row.paid).length;
  const autopayCount = rows.filter((row) => row.bill.autopay).length;
  $('v12BillsSummaryTitle').textContent = `${paymentMonthLabel(v12BillMonth)} bills`;
  $('v12BillsMetrics').innerHTML = `
    <article class="metric-card"><span class="metric-label">Total bills</span><strong class="metric-value money">${money.format(total)}</strong></article>
    <article class="metric-card"><span class="metric-label">Paid</span><strong class="metric-value money">${money.format(paidAmount)}</strong></article>
    <article class="metric-card"><span class="metric-label">Remaining</span><strong class="metric-value money">${money.format(remaining)}</strong></article>
    <article class="metric-card"><span class="metric-label">Payments</span><strong class="metric-value">${paidCount} / ${rows.length}</strong></article>
    <article class="metric-card"><span class="metric-label">Autopay</span><strong class="metric-value">${autopayCount}</strong></article>`;

  const groups = new Map();
  rows.forEach((row) => {
    const category = v12BillCategory(row.bill);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(row);
  });
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });

  const root = $('v12BillGroups');
  if (!ordered.length) {
    root.innerHTML = '<div class="empty-state"><strong>No bills due this month</strong><p>Your recurring and one-time bills will appear here when they are due.</p><button class="primary-button compact" id="v12EmptyAddBill" type="button">Add bill</button></div>';
    $('v12EmptyAddBill')?.addEventListener('click', () => openDialog('bill'));
    return;
  }

  root.innerHTML = ordered.map(([category, categoryRows]) => {
    const subtotal = categoryRows.reduce((sum, row) => sum + row.amount, 0);
    const paid = categoryRows.filter((row) => row.paid).length;
    return `<details class="v12-category-card" open>
      <summary><span><strong>${escapeHtml(category)}</strong><small>${paid} of ${categoryRows.length} paid</small></span><strong class="money">${money.format(subtotal)}</strong></summary>
      <div class="v12-category-list">
        ${categoryRows.map((row) => {
          const time = typeof v11TimeLabel === 'function' ? v11TimeLabel(row.bill.dueTime) : '';
          const status = paymentStatus(row.date, row.paid);
          return `<article class="payment-row v12-bill-row">
            <div class="payment-date"><strong>${row.date.getDate()}</strong><span>${shortMonthFmt.format(row.date)}</span></div>
            <div class="payment-main"><strong>${escapeHtml(row.bill.name)}</strong><p><span class="money">${money.format(row.amount)}</span> · ${escapeHtml(v12RecurrenceText(row.bill))}${row.bill.autopay ? ' · <span class="v12-badge">Autopay</span>' : ''}${time ? ` · ${time}` : ''}</p><span class="status ${status.key}">${status.label}</span></div>
            <div class="payment-actions"><button class="mini-button ${row.paid ? 'paid' : ''}" type="button" data-v12-bill-paid="${row.bill.id}" data-key="${row.key}">${row.paid ? '✓ Paid' : 'Mark paid'}</button><button class="mini-button" type="button" data-v12-edit-bill="${row.bill.id}">Edit</button></div>
          </article>`;
        }).join('')}
      </div>
    </details>`;
  }).join('');

  root.querySelectorAll('[data-v12-bill-paid]').forEach((button) => button.addEventListener('click', () => togglePaid(button.dataset.v12BillPaid, 'bill', button.dataset.key)));
  root.querySelectorAll('[data-v12-edit-bill]').forEach((button) => button.addEventListener('click', () => openDialog('bill', button.dataset.v12EditBill)));
}

function v12HistoryMonths(endKey, count = 6) {
  const index = monthIndex(endKey);
  if (index === null) return [];
  return Array.from({ length: count }, (_, offset) => keyFromMonthIndex(index - offset));
}

function v12MinimumFor(card, key) {
  const map = card?.monthlyMinimums;
  if (map && typeof map === 'object' && !Array.isArray(map) && Object.prototype.hasOwnProperty.call(map, key)) {
    return Math.max(Number(map[key]) || 0, 0);
  }
  return Math.max(Number(card.minimumPayment) || 0, 0);
}

function v12RenderCardsPage() {
  if (!$('cardsSummaryMetrics')) return;
  const key = selectedPaymentMonth || monthKey(new Date());
  const balances = state.cards.map((card) => projectedBalanceFor(card, key));
  const totalBalance = balances.reduce((sum, value) => sum + value, 0);
  const totalLimit = state.cards.reduce((sum, card) => sum + (Number(card.limit) || 0), 0);
  const available = state.cards.reduce((sum, card, index) => sum + Math.max((Number(card.limit) || 0) - balances[index], 0), 0);
  const utilization = totalLimit > 0 ? totalBalance / totalLimit * 100 : 0;
  const minimums = state.cards.reduce((sum, card) => sum + v12MinimumFor(card, key), 0);
  const paid = state.cards.reduce((sum, card) => sum + paidAmountFor(card, key), 0);
  $('cardsSummaryMetrics').innerHTML = `
    <article class="metric-card"><span class="metric-label">Balance</span><strong class="metric-value money">${money.format(totalBalance)}</strong></article>
    <article class="metric-card"><span class="metric-label">Available</span><strong class="metric-value money">${money.format(available)}</strong></article>
    <article class="metric-card"><span class="metric-label">Utilization</span><strong class="metric-value">${utilization.toFixed(utilization >= 10 ? 0 : 1)}%</strong></article>
    <article class="metric-card"><span class="metric-label">Minimums</span><strong class="metric-value money">${money.format(minimums)}</strong></article>
    <article class="metric-card"><span class="metric-label">Paid</span><strong class="metric-value money">${money.format(paid)}</strong></article>`;

  $('cardsList').querySelectorAll('[data-edit-card]').forEach((editButton) => {
    const card = state.cards.find((entry) => entry.id === editButton.dataset.editCard);
    const account = editButton.closest('.account-card');
    const main = account?.querySelector('.account-main');
    if (!card || !account || !main) return;
    const details = main.querySelector('.account-details');
    if (details && card.autopay && !details.querySelector('.v12-card-autopay')) {
      details.insertAdjacentHTML('beforeend', '<span class="v12-badge v12-card-autopay">Autopay</span>');
    }
    let history = account.querySelector('.v12-card-history');
    if (!history) {
      history = document.createElement('details');
      history.className = 'v12-card-history';
      main.append(history);
    }
    const rows = v12HistoryMonths(key, 6);
    history.innerHTML = `<summary>Payment history</summary><div class="v12-history-list">${rows.map((month) => {
      const amount = paidAmountFor(card, month);
      const minimum = v12MinimumFor(card, month);
      const difference = amount - minimum;
      const balance = projectedBalanceFor(card, month);
      const comparison = amount > 0 && minimum > 0
        ? difference > 0.005 ? `${money.format(difference)} over min` : difference < -0.005 ? `${money.format(Math.abs(difference))} under min` : 'Minimum met'
        : amount > 0 ? 'Payment recorded' : 'No payment recorded';
      return `<div class="v12-history-row"><div><strong>${paymentMonthLabel(month, true)}</strong><small>Start <span class="money">${money.format(balance)}</span></small></div><div class="v12-history-amount"><strong class="money">${money.format(amount)}</strong><small>${escapeHtml(comparison)}</small></div></div>`;
    }).join('')}</div>`;
  });

  const picker = $('paymentMonthPicker');
  if (picker && !picker.dataset.v12Bound) {
    picker.dataset.v12Bound = 'true';
    picker.addEventListener('change', () => setTimeout(v12RenderCardsPage, 0));
  }
}

function v12DecorateAccounts() {
  if ($('cardsList')) $('cardsList').hidden = false;
  if ($('billsList')) $('billsList').hidden = true;
  if ($('paymentMonthPickerWrap')) $('paymentMonthPickerWrap').hidden = false;
  if ($('addItemButton')) $('addItemButton').textContent = '+ Add card';
  v12RenderCardsPage();
  v12RenderBillsPage();
  v12UpdateCategoryOptions();
}

const v12BaseRenderAccounts = renderAccounts;
renderAccounts = function v12RenderAccounts() {
  v12BaseRenderAccounts();
  v12DecorateAccounts();
};

const v12BaseShowView = showView;
showView = function v12ShowView(viewId) {
  v12BaseShowView(viewId);
  if (viewId === 'accountsView') {
    activeAccountType = 'card';
    $('cardsList').hidden = false;
    $('billsList').hidden = true;
    if ($('paymentMonthPickerWrap')) $('paymentMonthPickerWrap').hidden = false;
    v12RenderCardsPage();
  }
  if (viewId === 'billsView') {
    activeAccountType = 'bill';
    v12RenderBillsPage();
  }
};

function v12UpdateBillDialogFields() {
  const type = $('v12BillRecurrence')?.value || 'monthly';
  const monthly = type === 'monthly';
  $('billRecurring').checked = monthly;
  $('billDueDayWrap').hidden = !monthly;
  $('billDateWrap').hidden = monthly;
  const label = $('billDateWrap')?.querySelector('span');
  if (label) label.textContent = type === 'one_time' ? 'Due date' : 'First due date';
}

const v12BaseOpenDialog = openDialog;
openDialog = function v12OpenDialog(type = 'card', id = null) {
  v12BaseOpenDialog(type, id);
  const collection = type === 'card' ? state.cards : state.bills;
  const item = id ? collection.find((entry) => entry.id === id) : null;
  if (type === 'card') {
    $('v12CardAutopay').checked = Boolean(item?.autopay);
  } else {
    const recurrence = v12RecurrenceType(item || { recurring: true });
    $('v12BillRecurrence').value = recurrence;
    $('v12BillCategory').value = item ? (item.category || '') : '';
    $('v12BillAutopay').checked = Boolean(item?.autopay);
    if (recurrence !== 'monthly') $('billDate').value = v12AnchorDate(item) || '';
    v12UpdateBillDialogFields();
    v12UpdateCategoryOptions();
  }
};

function v12CaptureExtras() {
  const type = $('itemType').value;
  const beforeIds = new Set((type === 'card' ? state.cards : state.bills).map((item) => item.id));
  if (type === 'bill') v12UpdateBillDialogFields();
  v12SubmitMeta = {
    type,
    existingId: $('itemId').value || null,
    beforeIds,
    autopay: type === 'card' ? $('v12CardAutopay').checked : $('v12BillAutopay').checked,
    category: type === 'bill' ? $('v12BillCategory').value.trim().slice(0, 40) : '',
    recurrenceType: type === 'bill' ? $('v12BillRecurrence').value : '',
    anchorDate: type === 'bill' && $('v12BillRecurrence').value !== 'monthly' ? $('billDate').value : '',
  };
}

function v12PersistExtras() {
  if (!v12SubmitMeta) return;
  const collection = v12SubmitMeta.type === 'card' ? state.cards : state.bills;
  let item = v12SubmitMeta.existingId ? collection.find((entry) => entry.id === v12SubmitMeta.existingId) : null;
  if (!item) item = collection.find((entry) => !v12SubmitMeta.beforeIds.has(entry.id));
  if (item) {
    item.autopay = Boolean(v12SubmitMeta.autopay);
    if (v12SubmitMeta.type === 'bill') {
      item.category = v12SubmitMeta.category || '';
      item.recurrenceType = V12_RECURRENCES[v12SubmitMeta.recurrenceType] ? v12SubmitMeta.recurrenceType : (item.recurring ? 'monthly' : 'one_time');
      item.anchorDate = item.recurrenceType === 'monthly' ? '' : v12SubmitMeta.anchorDate;
      if (item.recurrenceType !== 'monthly') {
        item.recurring = false;
        item.dueDate = item.anchorDate;
        item.dueDay = null;
      } else {
        item.recurring = true;
        item.dueDate = null;
      }
    }
    saveState();
    renderAll();
  }
  v12SubmitMeta = null;
}

function v12SnapshotMinimum() {
  const card = state.cards.find((entry) => entry.id === $('paymentCardId')?.value);
  const key = $('paymentMonthKey')?.value;
  if (!card || !key) return;
  card.monthlyMinimums = card.monthlyMinimums && typeof card.monthlyMinimums === 'object' && !Array.isArray(card.monthlyMinimums) ? { ...card.monthlyMinimums } : {};
  card.monthlyMinimums[key] = Math.max(Number(card.minimumPayment) || 0, 0);
}

function v12RenderCategoryManager() {
  const root = $('v12CategoryManager');
  if (!root) return;
  const categories = v12CategoryNames();
  root.innerHTML = categories.length ? categories.map((category) => `
    <div class="v12-category-manager-row" data-category="${escapeHtml(category)}">
      <input type="text" maxlength="40" value="${escapeHtml(category)}" aria-label="Rename ${escapeHtml(category)}" />
      <button class="secondary-button compact" type="button" data-v12-rename-category="${escapeHtml(category)}">Rename</button>
      <button class="danger-button compact" type="button" data-v12-delete-category="${escapeHtml(category)}">Remove</button>
    </div>`).join('') : '<p class="muted">Create a category by typing one when you add or edit a bill.</p>';

  root.querySelectorAll('[data-v12-rename-category]').forEach((button) => button.addEventListener('click', () => {
    const oldName = button.dataset.v12RenameCategory;
    const input = button.closest('.v12-category-manager-row').querySelector('input');
    const nextName = input.value.trim().slice(0, 40);
    if (!nextName || nextName === oldName) return;
    state.bills.forEach((bill) => { if (v12BillCategory(bill) === oldName) bill.category = nextName; });
    saveState(); renderAll(); v12RenderCategoryManager(); showToast(`Renamed ${oldName}.`);
  }));
  root.querySelectorAll('[data-v12-delete-category]').forEach((button) => button.addEventListener('click', () => {
    const category = button.dataset.v12DeleteCategory;
    if (!confirm(`Remove ${category}? Bills in this category will become Uncategorized.`)) return;
    state.bills.forEach((bill) => { if (v12BillCategory(bill) === category) bill.category = ''; });
    saveState(); renderAll(); v12RenderCategoryManager(); showToast(`Removed ${category}.`);
  }));
}

function v12ResetSelectedMonthPaid() {
  const month = monthKey(calendarCursor);
  if (!confirm(`Clear paid checkmarks for ${monthFmt.format(calendarCursor)}?`)) return;
  const prefix = `${month}-`;
  const clear = (item) => { item.paidMonths = (item.paidMonths || []).filter((key) => key !== month && !String(key).startsWith(prefix)); };
  state.cards.forEach(clear);
  state.bills.forEach(clear);
  saveState(); renderAll(); showToast(`Paid status reset for ${monthFmt.format(calendarCursor)}.`);
}

function v12OverridePushRows() {
  if (typeof budgetPushReminderRows !== 'function') return;
  budgetPushReminderRows = function v12BudgetPushReminderRows() {
    const cards = state.cards.map((card) => ({
      itemKey: card.id,
      itemType: 'card',
      itemName: card.name,
      recurring: true,
      recurrenceType: 'monthly',
      dueDay: Number(card.dueDay) || 1,
      dueDate: null,
      anchorDate: null,
      dueTime: card.dueTime || null,
      autopay: Boolean(card.autopay),
      paidMonths: Array.isArray(card.paidMonths) ? card.paidMonths : [],
    }));
    const bills = state.bills.map((bill) => {
      const recurrenceType = v12RecurrenceType(bill);
      return {
        itemKey: bill.id,
        itemType: 'bill',
        itemName: bill.name,
        recurring: recurrenceType === 'monthly',
        recurrenceType,
        dueDay: recurrenceType === 'monthly' ? (Number(bill.dueDay) || 1) : null,
        dueDate: recurrenceType === 'one_time' ? v12AnchorDate(bill) : null,
        anchorDate: recurrenceType === 'monthly' ? null : v12AnchorDate(bill),
        dueTime: bill.dueTime || null,
        autopay: Boolean(bill.autopay),
        paidMonths: Array.isArray(bill.paidMonths) ? bill.paidMonths : [],
      };
    });
    return [...cards, ...bills];
  };
}

function v12BindEvents() {
  $('addBillButton')?.addEventListener('click', () => openDialog('bill'));
  $('v12BillMonth')?.addEventListener('change', (event) => { if (event.target.value) { v12BillMonth = event.target.value; v12RenderBillsPage(); } });
  $('manageCategoriesButton')?.addEventListener('click', () => { v12RenderCategoryManager(); $('v12CategoryDialog').showModal(); });
  $('v12CloseCategoryDialog')?.addEventListener('click', () => $('v12CategoryDialog').close());
  $('v12BillRecurrence')?.addEventListener('change', v12UpdateBillDialogFields);
  $('itemForm').addEventListener('submit', v12CaptureExtras, true);
  $('itemForm').addEventListener('submit', v12PersistExtras);
  $('cardPaymentForm')?.addEventListener('submit', v12SnapshotMinimum, true);

  const reset = $('resetPaidButton');
  if (reset) {
    const clone = reset.cloneNode(true);
    reset.replaceWith(clone);
    clone.addEventListener('click', v12ResetSelectedMonthPaid);
  }
}

function v12Init() {
  v12InjectPages();
  v12OverridePushRows();
  v12BindEvents();
  renderAll();
  v12DecorateAccounts();
  if (typeof budgetPushEnabled === 'function' && budgetPushEnabled()) budgetPushQueueSync();
}

v12Init();
