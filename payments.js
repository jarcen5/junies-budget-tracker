let selectedPaymentMonth = monthKey(new Date());
let preservedPaymentAmounts = null;
let preservedPaymentCardId = null;

function paymentAmountMap(card) {
  const map = card?.monthlyPaidAmounts;
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

function paidAmountFor(card, key) {
  return Math.max(Number(paymentAmountMap(card)[key]) || 0, 0);
}

function paymentMonthLabel(key, short = false) {
  const [year, month] = String(key).split('-').map(Number);
  if (!year || !month) return 'This month';
  return new Intl.DateTimeFormat('en-US', {
    month: short ? 'short' : 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

function saveMonthlyPayment(cardId, key, rawValue) {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return;

  const amount = Math.max(Number(rawValue) || 0, 0);
  card.monthlyPaidAmounts = { ...paymentAmountMap(card) };
  if (amount > 0) card.monthlyPaidAmounts[key] = amount;
  else delete card.monthlyPaidAmounts[key];

  saveState();
  renderDashboard();
  decorateAccountsPaymentAmounts();
  renderPrivacy();
  showToast(amount > 0 ? `Saved ${money.format(amount)} paid for ${paymentMonthLabel(key)}.` : `Cleared payment amount for ${paymentMonthLabel(key)}.`);
}

function decorateDashboardPaymentAmounts() {
  const currentKey = monthKey(new Date());
  const totalPaid = state.cards.reduce((sum, card) => sum + paidAmountFor(card, currentKey), 0);
  const grid = document.querySelector('#dashboardView .metric-grid');
  if (grid) {
    let card = $('cardPaymentsMetric');
    if (!card) {
      card = document.createElement('article');
      card.className = 'metric-card';
      card.id = 'cardPaymentsMetric';
      card.innerHTML = '<span class="metric-label">Card payments</span><strong class="metric-value money" id="cardPaymentsThisMonth">$0.00</strong>';
      grid.append(card);
    }
    $('cardPaymentsThisMonth').textContent = money.format(totalPaid);
  }

  document.querySelectorAll('#upcomingList [data-type="card"]').forEach((button) => {
    const card = state.cards.find((entry) => entry.id === button.dataset.paid);
    const row = button.closest('.payment-row');
    const detail = row?.querySelector('.payment-main p');
    if (!card || !detail) return;
    const paid = paidAmountFor(card, currentKey);
    const existing = detail.querySelector('.paid-amount-detail');
    if (existing) existing.remove();
    const span = document.createElement('span');
    span.className = 'paid-amount-detail';
    span.innerHTML = ` · Paid this month <span class="money">${money.format(paid)}</span>`;
    detail.append(span);
  });
}

function ensurePaymentMonthPicker() {
  const cardsList = $('cardsList');
  if (!cardsList) return;
  let picker = $('paymentMonthPickerWrap');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'paymentMonthPickerWrap';
    picker.className = 'payment-month-picker';
    picker.innerHTML = `
      <label for="paymentMonthPicker">
        <span>Payment month</span>
        <span class="payment-month-input-wrap"><input id="paymentMonthPicker" type="month" /></span>
      </label>
      <p>Choose a month, then type the total amount you paid on each card.</p>`;
    cardsList.parentNode.insertBefore(picker, cardsList);
    $('paymentMonthPicker').addEventListener('change', (event) => {
      if (!event.target.value) return;
      selectedPaymentMonth = event.target.value;
      decorateAccountsPaymentAmounts();
    });
  }
  $('paymentMonthPicker').value = selectedPaymentMonth;
}

function decorateAccountsPaymentAmounts() {
  ensurePaymentMonthPicker();
  const cardsList = $('cardsList');
  if (!cardsList) return;

  cardsList.querySelectorAll('[data-edit-card]').forEach((editButton) => {
    const cardId = editButton.dataset.editCard;
    const card = state.cards.find((entry) => entry.id === cardId);
    const account = editButton.closest('.account-card');
    const main = account?.querySelector('.account-main');
    if (!card || !main) return;

    let editor = account.querySelector('.monthly-payment-editor');
    if (!editor) {
      editor = document.createElement('div');
      editor.className = 'monthly-payment-editor';
      main.append(editor);
    }

    const amount = paidAmountFor(card, selectedPaymentMonth);
    editor.innerHTML = `
      <label>
        <span>Paid ${paymentMonthLabel(selectedPaymentMonth, true)}</span>
        <input class="monthly-paid-input" type="number" min="0" step="0.01" inputmode="decimal" value="${amount || ''}" placeholder="0.00" aria-label="Amount paid to ${escapeHtml(card.name)} in ${paymentMonthLabel(selectedPaymentMonth)}" />
      </label>
      <button class="mini-button save-payment-button" type="button">Save</button>`;

    const input = editor.querySelector('.monthly-paid-input');
    const saveButton = editor.querySelector('.save-payment-button');
    saveButton.addEventListener('click', () => saveMonthlyPayment(cardId, selectedPaymentMonth, input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveMonthlyPayment(cardId, selectedPaymentMonth, input.value);
      }
    });
  });

  updatePaymentInputPrivacy();
}

function updatePaymentInputPrivacy() {
  const hidden = document.body.classList.contains('hidden-money');
  document.querySelectorAll('.monthly-paid-input').forEach((input) => {
    input.type = hidden ? 'password' : 'number';
    if (hidden) input.inputMode = 'decimal';
  });
}

const baseRenderDashboardForPayments = renderDashboard;
renderDashboard = function renderDashboardWithPaymentAmounts() {
  baseRenderDashboardForPayments();
  decorateDashboardPaymentAmounts();
};

const baseRenderAccountsForPayments = renderAccounts;
renderAccounts = function renderAccountsWithPaymentAmounts() {
  baseRenderAccountsForPayments();
  decorateAccountsPaymentAmounts();
};

const baseRenderPrivacyForPayments = renderPrivacy;
renderPrivacy = function renderPrivacyWithPaymentAmounts() {
  baseRenderPrivacyForPayments();
  updatePaymentInputPrivacy();
};

$('itemForm').addEventListener('submit', () => {
  if ($('itemType').value !== 'card' || !$('itemId').value) return;
  preservedPaymentCardId = $('itemId').value;
  const card = state.cards.find((entry) => entry.id === preservedPaymentCardId);
  preservedPaymentAmounts = card ? { ...paymentAmountMap(card) } : null;
}, true);

$('itemForm').addEventListener('submit', () => {
  if (!preservedPaymentCardId || !preservedPaymentAmounts) return;
  const card = state.cards.find((entry) => entry.id === preservedPaymentCardId);
  if (card) {
    card.monthlyPaidAmounts = preservedPaymentAmounts;
    saveState();
    renderAll();
  }
  preservedPaymentCardId = null;
  preservedPaymentAmounts = null;
});

renderAll();
