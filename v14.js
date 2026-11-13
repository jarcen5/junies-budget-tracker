let v14SubmitMeta = null;
let v14AssignOriginalCard = '';

function v14PaymentCardName(bill) {
  const tracked = bill?.paidWithCardId ? state.cards.find((card) => card.id === bill.paidWithCardId) : null;
  return String(tracked?.name || bill?.paidWithCard || '').trim();
}

function v14PaymentCardNames() {
  const names = [
    ...state.cards.map((card) => String(card.name || '').trim()),
    ...state.bills.map(v14PaymentCardName),
  ].filter(Boolean);
  return [...new Set(names.map((name) => name.trim()))].sort((a, b) => a.localeCompare(b));
}

function v14FindTrackedCard(name) {
  const target = String(name || '').trim().toLowerCase();
  if (!target) return null;
  return state.cards.find((card) => String(card.name || '').trim().toLowerCase() === target) || null;
}

function v14CurrentAvailable(card) {
  if (!card) return null;
  return Math.max((Number(card.limit) || 0) - (Number(card.balance) || 0), 0);
}

function v14UpdatePaymentCardOptions() {
  const lists = [$('v14PaymentCardOptions'), $('v14AssignCardOptions')].filter(Boolean);
  const html = v14PaymentCardNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
  lists.forEach((list) => { list.innerHTML = html; });
}

function v14InjectUI() {
  const categoryInput = $('v12BillCategory');
  if (categoryInput && !$('v14BillPaidWith')) {
    const categoryLabel = categoryInput.closest('label');
    const paidWith = document.createElement('label');
    paidWith.className = 'v12-bill-extra v14-paid-with-field';
    paidWith.innerHTML = '<span>Paid with <small>(card or payment method)</small></span><input id="v14BillPaidWith" list="v14PaymentCardOptions" type="text" maxlength="60" placeholder="e.g. Discover" autocomplete="off" /><datalist id="v14PaymentCardOptions"></datalist><small class="v14-field-help">Choose one of your tracked cards or type another card name.</small>';
    categoryLabel.insertAdjacentElement('afterend', paidWith);
  }

  const billsView = $('billsView');
  if (billsView && !$('v14PaymentCardsSection')) {
    const groupsHeading = billsView.querySelector('.v12-groups-heading');
    const section = document.createElement('section');
    section.id = 'v14PaymentCardsSection';
    section.className = 'v14-payment-cards-section';
    section.innerHTML = `
      <div class="section-heading v12-inline-heading">
        <div><p class="eyebrow">Bill funding</p><h2>Payment cards</h2></div>
        <button class="secondary-button compact" id="v14AssignBillsButton" type="button">Assign bills</button>
      </div>
      <p class="muted v14-payment-cards-help">See which bills use each card and whether the card has enough available credit for the unpaid bills still coming this month.</p>
      <div id="v14PaymentCardGroups" class="v14-payment-card-groups"></div>`;
    groupsHeading?.parentNode.insertBefore(section, groupsHeading);
  }

  if (!$('v14AssignBillsDialog')) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="v14AssignBillsDialog" class="v11-dialog">
        <form id="v14AssignBillsForm" class="dialog-card">
          <div class="dialog-header">
            <div><p class="eyebrow">Bills</p><h2 id="v14AssignBillsTitle">Assign bills to a card</h2></div>
            <button class="icon-button" id="v14CloseAssignBillsDialog" type="button" aria-label="Close">×</button>
          </div>
          <label>
            <span>Card or payment method</span>
            <input id="v14AssignCardName" list="v14AssignCardOptions" type="text" maxlength="60" placeholder="e.g. Discover" autocomplete="off" required />
            <datalist id="v14AssignCardOptions"></datalist>
          </label>
          <p class="helper">Select every bill that is normally charged to this card. A bill can be assigned to one card at a time.</p>
          <div id="v14AssignBillList" class="v14-assign-bill-list"></div>
          <div class="dialog-actions">
            <button class="secondary-button" id="v14ClearCardAssignments" type="button" hidden>Clear assignments</button>
            <span class="dialog-spacer"></span>
            <button class="secondary-button" id="v14CancelAssignBills" type="button">Cancel</button>
            <button class="primary-button" type="submit">Save assignments</button>
          </div>
        </form>
      </dialog>`);
  }

  v14UpdatePaymentCardOptions();
}

function v14RenderAssignBillList(cardName = '') {
  const root = $('v14AssignBillList');
  if (!root) return;
  const target = String(cardName || '').trim().toLowerCase();
  const bills = [...state.bills].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  root.innerHTML = bills.length ? bills.map((bill) => {
    const current = v14PaymentCardName(bill);
    const checked = target && current.toLowerCase() === target;
    return `<label class="v14-assign-bill-row">
      <input type="checkbox" value="${escapeHtml(bill.id)}" ${checked ? 'checked' : ''} />
      <span><strong>${escapeHtml(bill.name)}</strong><small>${current ? `Currently: ${escapeHtml(current)}` : 'Not assigned'}</small></span>
    </label>`;
  }).join('') : '<p class="muted">Add a bill first, then you can assign it to a card.</p>';
}

function v14OpenAssignBillsDialog(cardName = '') {
  v14AssignOriginalCard = String(cardName || '').trim();
  $('v14AssignBillsForm').reset();
  $('v14AssignCardName').value = v14AssignOriginalCard;
  $('v14AssignBillsTitle').textContent = v14AssignOriginalCard ? `Manage ${v14AssignOriginalCard}` : 'Assign bills to a card';
  $('v14ClearCardAssignments').hidden = !v14AssignOriginalCard;
  v14UpdatePaymentCardOptions();
  v14RenderAssignBillList(v14AssignOriginalCard);
  $('v14AssignBillsDialog').showModal();
}

function v14SaveAssignments(event) {
  event.preventDefault();
  const name = $('v14AssignCardName').value.trim().slice(0, 60);
  if (!name) return;
  const selected = new Set([...$('v14AssignBillList').querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value));
  const original = v14AssignOriginalCard.toLowerCase();

  const trackedCard = v14FindTrackedCard(name);
  state.bills.forEach((bill) => {
    const current = v14PaymentCardName(bill);
    if (selected.has(bill.id)) {
      bill.paidWithCard = name;
      bill.paidWithCardId = trackedCard?.id || '';
    } else if (original && current.toLowerCase() === original) {
      bill.paidWithCard = '';
      bill.paidWithCardId = '';
    }
  });

  saveState();
  $('v14AssignBillsDialog').close();
  v14AssignOriginalCard = '';
  v14UpdatePaymentCardOptions();
  renderAll();
  if (typeof v12RenderBillsPage === 'function') v12RenderBillsPage();
  if (typeof v13RenderCards === 'function') v13RenderCards();
  showToast(`Bill assignments saved for ${name}.`);
}

function v14ClearAssignments() {
  const original = v14AssignOriginalCard.trim();
  if (!original) return;
  if (!confirm(`Remove ${original} from all assigned bills?`)) return;
  state.bills.forEach((bill) => {
    if (v14PaymentCardName(bill).toLowerCase() === original.toLowerCase()) {
      bill.paidWithCard = '';
      bill.paidWithCardId = '';
    }
  });
  saveState();
  $('v14AssignBillsDialog').close();
  v14AssignOriginalCard = '';
  v14UpdatePaymentCardOptions();
  renderAll();
  if (typeof v12RenderBillsPage === 'function') v12RenderBillsPage();
  if (typeof v13RenderCards === 'function') v13RenderCards();
  showToast(`${original} assignments cleared.`);
}

function v14BillRowsForSelectedMonth() {
  const [year, month] = String(v12BillMonth || monthKey(new Date())).split('-').map(Number);
  if (!year || !month || typeof v12BillRowsForMonth !== 'function') return [];
  return v12BillRowsForMonth(year, month - 1);
}

function v14RenderPaymentCards() {
  const root = $('v14PaymentCardGroups');
  if (!root) return;

  const rows = v14BillRowsForSelectedMonth();
  const groups = new Map();

  state.bills.forEach((bill) => {
    const name = v14PaymentCardName(bill);
    if (!name) return;
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, bills: [] });
    groups.get(key).bills.push(bill);
  });

  const unassignedCount = state.bills.filter((bill) => !v14PaymentCardName(bill)).length;

  if (!groups.size) {
    root.innerHTML = `<div class="empty-state"><strong>No payment cards assigned yet</strong><p>Assign bills to the cards you use to pay them. You can use a tracked card or type another card name.</p><button class="primary-button compact" id="v14EmptyAssignBills" type="button">Assign bills</button></div>`;
    $('v14EmptyAssignBills')?.addEventListener('click', () => v14OpenAssignBillsDialog());
    return;
  }

  const ordered = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  root.innerHTML = ordered.map((group) => {
    const groupIds = new Set(group.bills.map((bill) => bill.id));
    const monthRows = rows.filter((row) => groupIds.has(row.bill.id));
    const total = monthRows.reduce((sum, row) => sum + row.amount, 0);
    const unpaidRows = monthRows.filter((row) => !row.paid);
    const unpaid = unpaidRows.reduce((sum, row) => sum + row.amount, 0);
    const card = v14FindTrackedCard(group.name);
    const available = v14CurrentAvailable(card);
    const enough = available !== null ? available + 0.005 >= unpaid : null;
    const coverage = card
      ? `<div class="v14-coverage ${enough ? 'enough' : 'short'}"><strong>${enough ? 'Enough available credit' : `Short by ${money.format(Math.max(unpaid - available, 0))}`}</strong><span>Current available <span class="money">${money.format(available)}</span> · unpaid bills this month <span class="money">${money.format(unpaid)}</span></span></div>`
      : `<div class="v14-coverage untracked"><strong>Card not tracked</strong><span>Add “${escapeHtml(group.name)}” to Cards if you want an available-credit check.</span></div>`;

    return `<article class="v14-payment-card-group">
      <div class="v14-payment-card-head">
        <div><span class="v14-card-label">Paid with</span><strong>${escapeHtml(group.name)}</strong><small>${group.bills.length} assigned bill${group.bills.length === 1 ? '' : 's'}</small></div>
        <div class="v14-payment-card-total"><span>This month</span><strong class="money">${money.format(total)}</strong></div>
      </div>
      ${coverage}
      <div class="v14-payment-card-bills">
        ${group.bills.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((bill) => {
          const billRows = monthRows.filter((row) => row.bill.id === bill.id);
          const billTotal = billRows.reduce((sum, row) => sum + row.amount, 0);
          const billUnpaid = billRows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);
          const detail = billRows.length
            ? `${billRows.length > 1 ? `${billRows.length} payments · ` : ''}${billUnpaid > 0 ? `${money.format(billUnpaid)} still due` : 'Paid for this month'}`
            : 'Not due this month';
          return `<div class="v14-payment-card-bill"><span><strong>${escapeHtml(bill.name)}</strong><small>${detail}</small></span><strong class="money">${billRows.length ? money.format(billTotal) : '—'}</strong></div>`;
        }).join('')}
      </div>
      <div class="v14-payment-card-actions"><button class="mini-button" type="button" data-v14-manage-card="${escapeHtml(group.name)}">Manage bills</button></div>
    </article>`;
  }).join('') + (unassignedCount ? `<div class="v14-unassigned-note"><strong>${unassignedCount} bill${unassignedCount === 1 ? '' : 's'} not assigned</strong><button class="text-button" id="v14AssignUnassigned" type="button">Assign them</button></div>` : '');

  root.querySelectorAll('[data-v14-manage-card]').forEach((button) => button.addEventListener('click', () => v14OpenAssignBillsDialog(button.dataset.v14ManageCard)));
  $('v14AssignUnassigned')?.addEventListener('click', () => v14OpenAssignBillsDialog());
}

function v14DecorateBillRows() {
  const root = $('v12BillGroups');
  if (!root) return;
  root.querySelectorAll('[data-v12-edit-bill]').forEach((button) => {
    const bill = state.bills.find((item) => item.id === button.dataset.v12EditBill);
    const row = button.closest('.v12-bill-row');
    const main = row?.querySelector('.payment-main');
    if (!bill || !main) return;
    const name = v14PaymentCardName(bill);
    let tag = main.querySelector('.v14-paid-with-tag');
    if (!name) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'v14-paid-with-tag';
      main.append(tag);
    }
    tag.innerHTML = `Paid with <strong>${escapeHtml(name)}</strong>`;
  });
}

function v14ApplyCardSearch() {
  const input = $('v13CardSearch');
  const list = $('cardsList');
  if (!input || !list) return;
  const query = String(input.value || '').trim().toLowerCase();
  v13CardQuery = input.value || '';
  list.querySelectorAll('.account-card').forEach((account) => {
    const name = String(account.dataset.v13CardName || account.querySelector('.account-main > strong')?.textContent || '').trim().toLowerCase();
    account.classList.toggle('v14-card-filtered', Boolean(query) && !name.includes(query));
  });
}

function v14DecorateCards() {
  const list = $('cardsList');
  if (!list) return;
  const key = selectedPaymentMonth || monthKey(new Date());
  const [year, month] = key.split('-').map(Number);
  if (!year || !month || typeof v12BillRowsForMonth !== 'function') return;
  const rows = v12BillRowsForMonth(year, month - 1);

  state.cards.forEach((card) => {
    const edit = list.querySelector(`[data-edit-card="${CSS.escape(card.id)}"]`);
    const account = edit?.closest('.account-card');
    const main = account?.querySelector('.account-main');
    if (!account || !main) return;

    const matching = rows.filter((row) => v14PaymentCardName(row.bill).toLowerCase() === String(card.name || '').trim().toLowerCase());
    main.querySelector('.v14-card-bill-coverage')?.remove();
    if (!matching.length) return;

    const total = matching.reduce((sum, row) => sum + row.amount, 0);
    const unpaid = matching.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0);
    const available = v14CurrentAvailable(card);
    const enough = available + 0.005 >= unpaid;
    const coverage = document.createElement('div');
    coverage.className = `v14-card-bill-coverage ${enough ? 'enough' : 'short'}`;
    coverage.innerHTML = `
      <div><span>Bills using this card</span><strong class="money">${money.format(total)}</strong></div>
      <small>${matching.length} bill${matching.length === 1 ? '' : 's'} · <span class="money">${money.format(unpaid)}</span> still due · <span class="money">${money.format(available)}</span> currently available</small>
      <strong class="v14-coverage-status">${enough ? 'Enough room for remaining bills' : `Short by ${money.format(Math.max(unpaid - available, 0))}`}</strong>`;
    const history = main.querySelector('.v12-card-history');
    if (history) main.insertBefore(coverage, history);
    else main.append(coverage);
  });
  v14ApplyCardSearch();
}

function v14CapturePaymentCard() {
  const type = $('itemType').value;
  if (type !== 'bill') {
    v14SubmitMeta = null;
    return;
  }
  const beforeIds = new Set(state.bills.map((bill) => bill.id));
  v14SubmitMeta = {
    existingId: $('itemId').value || null,
    beforeIds,
    paidWithCard: $('v14BillPaidWith')?.value.trim().slice(0, 60) || '',
  };
}

function v14PersistPaymentCard() {
  if (!v14SubmitMeta) return;
  let bill = v14SubmitMeta.existingId ? state.bills.find((item) => item.id === v14SubmitMeta.existingId) : null;
  if (!bill) bill = state.bills.find((item) => !v14SubmitMeta.beforeIds.has(item.id));
  if (bill) {
    const trackedCard = v14FindTrackedCard(v14SubmitMeta.paidWithCard);
    bill.paidWithCard = v14SubmitMeta.paidWithCard;
    bill.paidWithCardId = trackedCard?.id || '';
    saveState();
  }
  v14SubmitMeta = null;
  v14UpdatePaymentCardOptions();
  if (typeof v12RenderBillsPage === 'function') v12RenderBillsPage();
  if (typeof v13RenderCards === 'function') v13RenderCards();
}

const v14BaseOpenDialog = openDialog;
openDialog = function v14OpenDialog(type = 'card', id = null) {
  v14BaseOpenDialog(type, id);
  v14UpdatePaymentCardOptions();
  if (type === 'bill' && $('v14BillPaidWith')) {
    const bill = id ? state.bills.find((item) => item.id === id) : null;
    $('v14BillPaidWith').value = v14PaymentCardName(bill);
  }
};

if (typeof v12RenderBillsPage === 'function') {
  const v14BaseRenderBillsPage = v12RenderBillsPage;
  v12RenderBillsPage = function v14RenderBillsPage() {
    v14BaseRenderBillsPage();
    v14DecorateBillRows();
    v14RenderPaymentCards();
  };
}

if (typeof v13RenderCards === 'function') {
  const v14BaseRenderCards = v13RenderCards;
  v13RenderCards = function v14RenderCards() {
    v14BaseRenderCards();
    v14DecorateCards();
  };
}

function v14BindEvents() {
  $('v13CardSearch')?.addEventListener('input', v14ApplyCardSearch);
  $('v14AssignBillsButton')?.addEventListener('click', () => v14OpenAssignBillsDialog());
  $('v14AssignBillsForm')?.addEventListener('submit', v14SaveAssignments);
  $('v14CloseAssignBillsDialog')?.addEventListener('click', () => $('v14AssignBillsDialog').close());
  $('v14CancelAssignBills')?.addEventListener('click', () => $('v14AssignBillsDialog').close());
  $('v14ClearCardAssignments')?.addEventListener('click', v14ClearAssignments);
  $('itemForm').addEventListener('submit', v14CapturePaymentCard, true);
  $('itemForm').addEventListener('submit', v14PersistPaymentCard);
  $('paymentMonthPicker')?.addEventListener('change', () => setTimeout(() => {
    if (typeof v13RenderCards === 'function') v13RenderCards();
  }, 0));
}

function v14Init() {
  v14InjectUI();
  v14BindEvents();
  v14UpdatePaymentCardOptions();
  if (typeof v12RenderBillsPage === 'function') v12RenderBillsPage();
  if (typeof v13RenderCards === 'function') v13RenderCards();
}

v14Init();
