let selectedPaymentMonth = monthKey(new Date());
let preservedCardData = null;
let preservedPaymentCardId = null;

function paymentAmountMap(card) {
  const map = card?.monthlyPaidAmounts;
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}

function balanceOverrideMap(card) {
  const map = card?.monthlyBalanceOverrides;
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

function monthIndex(key) {
  const [year, month] = String(key).split('-').map(Number);
  if (!year || !month) return null;
  return year * 12 + (month - 1);
}

function keyFromMonthIndex(index) {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function ensureCardBalanceMetadata(card) {
  if (!card) return false;
  let changed = false;
  const currentKey = monthKey(new Date());

  if (!card.balanceAnchorMonth) {
    card.balanceAnchorMonth = currentKey;
    changed = true;
  }

  if (!card.monthlyBalanceOverrides || typeof card.monthlyBalanceOverrides !== 'object' || Array.isArray(card.monthlyBalanceOverrides)) {
    card.monthlyBalanceOverrides = {};
    changed = true;
  }

  if (!Object.prototype.hasOwnProperty.call(card.monthlyBalanceOverrides, card.balanceAnchorMonth)) {
    card.monthlyBalanceOverrides[card.balanceAnchorMonth] = Math.max(Number(card.balance) || 0, 0);
    changed = true;
  }

  return changed;
}

function projectedBalanceFor(card, key, ignoreOverrideKey = null) {
  if (!card) return 0;
  ensureCardBalanceMetadata(card);

  const targetIndex = monthIndex(key);
  if (targetIndex === null) return Math.max(Number(card.balance) || 0, 0);

  const candidates = [];
  const overrides = balanceOverrideMap(card);

  Object.entries(overrides).forEach(([candidateKey, value]) => {
    if (candidateKey === ignoreOverrideKey) return;
    const index = monthIndex(candidateKey);
    const amount = Number(value);
    if (index === null || !Number.isFinite(amount) || index > targetIndex) return;
    candidates.push({ key: candidateKey, index, balance: Math.max(amount, 0) });
  });

  if (!candidates.length) {
    const anchorKey = card.balanceAnchorMonth || monthKey(new Date());
    const anchorIndex = monthIndex(anchorKey);
    if (anchorIndex !== null && anchorIndex <= targetIndex) {
      candidates.push({
        key: anchorKey,
        index: anchorIndex,
        balance: Math.max(Number(card.balance) || 0, 0),
      });
    }
  }

  if (!candidates.length) {
    return Math.max(Number(overrides[key]) || Number(card.balance) || 0, 0);
  }

  candidates.sort((a, b) => b.index - a.index);
  const start = candidates[0];
  let balance = start.balance;

  for (let index = start.index; index < targetIndex; index += 1) {
    const paymentKey = keyFromMonthIndex(index);
    balance = Math.max(balance - paidAmountFor(card, paymentKey), 0);
  }

  return balance;
}

function hasBalanceOverride(card, key) {
  return Object.prototype.hasOwnProperty.call(balanceOverrideMap(card), key);
}

function paymentComparison(card, paid) {
  const minimum = Math.max(Number(card.minimumPayment) || 0, 0);
  if (minimum <= 0) return `Minimum not set · Paid <span class="money">${money.format(paid)}</span>`;
  if (paid <= 0) return `Minimum <span class="money">${money.format(minimum)}</span> · No payment amount entered`;
  const difference = paid - minimum;
  if (difference > 0) {
    return `Minimum <span class="money">${money.format(minimum)}</span> · Paid <span class="money">${money.format(paid)}</span> · <strong class="payment-ahead"><span class="money">${money.format(difference)}</span> above minimum</strong>`;
  }
  if (difference === 0) {
    return `Minimum <span class="money">${money.format(minimum)}</span> · Paid <span class="money">${money.format(paid)}</span> · Minimum met`;
  }
  return `Minimum <span class="money">${money.format(minimum)}</span> · Paid <span class="money">${money.format(paid)}</span> · <strong class="payment-short"><span class="money">${money.format(Math.abs(difference))}</span> below minimum</strong>`;
}

function saveMonthlyCardData(cardId, key, paidRawValue, balanceRawValue) {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return;

  ensureCardBalanceMetadata(card);

  const paidAmount = Math.max(Number(paidRawValue) || 0, 0);
  card.monthlyPaidAmounts = { ...paymentAmountMap(card) };
  if (paidAmount > 0) card.monthlyPaidAmounts[key] = paidAmount;
  else delete card.monthlyPaidAmounts[key];

  const balanceText = String(balanceRawValue ?? '').trim();
  const projectedWithoutOverride = projectedBalanceFor(card, key, key);
  card.monthlyBalanceOverrides = { ...balanceOverrideMap(card) };

  if (!balanceText) {
    delete card.monthlyBalanceOverrides[key];
  } else {
    const enteredBalance = Math.max(Number(balanceText) || 0, 0);
    if (Math.abs(enteredBalance - projectedWithoutOverride) < 0.005 && key !== card.balanceAnchorMonth) {
      delete card.monthlyBalanceOverrides[key];
    } else {
      card.monthlyBalanceOverrides[key] = enteredBalance;
    }
  }

  saveState();
  renderDashboard();
  decorateAccountsPaymentAmounts();
  renderPrivacy();
  showToast(`Saved ${paymentMonthLabel(key)} card details.`);
}

function decorateDashboardPaymentAmounts() {
  const currentKey = monthKey(new Date());
  let metadataChanged = false;
  state.cards.forEach((card) => {
    if (ensureCardBalanceMetadata(card)) metadataChanged = true;
  });
  if (metadataChanged) saveState();

  const totalPaid = state.cards.reduce((sum, card) => sum + paidAmountFor(card, currentKey), 0);
  const totalBalance = state.cards.reduce((sum, card) => sum + projectedBalanceFor(card, currentKey), 0);
  const totalLimit = state.cards.reduce((sum, card) => sum + (Number(card.limit) || 0), 0);
  const available = state.cards.reduce((sum, card) => {
    const limit = Number(card.limit) || 0;
    return sum + Math.max(limit - projectedBalanceFor(card, currentKey), 0);
  }, 0);
  const utilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;

  $('totalBalance').textContent = money.format(totalBalance);
  $('availableCredit').textContent = money.format(available);
  $('utilization').textContent = `${utilization.toFixed(utilization >= 10 ? 0 : 1)}%`;

  const grid = document.querySelector('#dashboardView .metric-grid');
  if (grid) {
    let metric = $('cardPaymentsMetric');
    if (!metric) {
      metric = document.createElement('article');
      metric.className = 'metric-card';
      metric.id = 'cardPaymentsMetric';
      metric.innerHTML = '<span class="metric-label">Card payments</span><strong class="metric-value money" id="cardPaymentsThisMonth">$0.00</strong>';
      grid.append(metric);
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
      <p>Choose a month to enter what you paid and review the balance carried forward from the month before.</p>`;
    cardsList.parentNode.insertBefore(picker, cardsList);
    $('paymentMonthPicker').addEventListener('change', (event) => {
      if (!event.target.value) return;
      selectedPaymentMonth = event.target.value;
      decorateAccountsPaymentAmounts();
    });
  }
  $('paymentMonthPicker').value = selectedPaymentMonth;
}

function balanceStatusText(card, key) {
  const balance = projectedBalanceFor(card, key);
  if (hasBalanceOverride(card, key)) {
    return `Saved starting balance for ${paymentMonthLabel(key, true)}: <span class="money">${money.format(balance)}</span>`;
  }
  return `Auto-carried starting balance for ${paymentMonthLabel(key, true)}: <span class="money">${money.format(balance)}</span>`;
}

function decorateAccountsPaymentAmounts() {
  ensurePaymentMonthPicker();
  const cardsList = $('cardsList');
  if (!cardsList) return;

  let metadataChanged = false;

  cardsList.querySelectorAll('[data-edit-card]').forEach((editButton) => {
    const cardId = editButton.dataset.editCard;
    const card = state.cards.find((entry) => entry.id === cardId);
    const account = editButton.closest('.account-card');
    const main = account?.querySelector('.account-main');
    if (!card || !main) return;

    if (ensureCardBalanceMetadata(card)) metadataChanged = true;

    const selectedBalance = projectedBalanceFor(card, selectedPaymentMonth);
    const balanceLine = main.querySelector(':scope > p');
    if (balanceLine) {
      const currentKey = monthKey(new Date());
      const label = selectedPaymentMonth === currentKey
        ? 'balance'
        : `${hasBalanceOverride(card, selectedPaymentMonth) ? 'saved' : 'projected'} balance for ${paymentMonthLabel(selectedPaymentMonth, true)}`;
      balanceLine.innerHTML = `<span class="money">${money.format(selectedBalance)}</span> ${label}`;
    }

    let editor = account.querySelector('.monthly-payment-editor');
    if (!editor) {
      editor = document.createElement('div');
      editor.className = 'monthly-payment-editor';
      main.append(editor);
    }

    const amount = paidAmountFor(card, selectedPaymentMonth);
    editor.innerHTML = `
      <div class="payment-comparison">${paymentComparison(card, amount)}</div>
      <div class="balance-status">${balanceStatusText(card, selectedPaymentMonth)}</div>
      <div class="payment-entry-row">
        <label>
          <span>Amount paid in ${paymentMonthLabel(selectedPaymentMonth, true)}</span>
          <input class="monthly-paid-input" type="number" min="0" step="0.01" inputmode="decimal" value="${amount || ''}" placeholder="0.00" aria-label="Amount paid to ${escapeHtml(card.name)} in ${paymentMonthLabel(selectedPaymentMonth)}" />
        </label>
        <label>
          <span>Starting balance in ${paymentMonthLabel(selectedPaymentMonth, true)}</span>
          <input class="monthly-balance-input" type="number" min="0" step="0.01" inputmode="decimal" value="${selectedBalance}" aria-label="Starting balance for ${escapeHtml(card.name)} in ${paymentMonthLabel(selectedPaymentMonth)}" />
        </label>
        <button class="mini-button save-payment-button" type="button">Save</button>
      </div>
      <p class="balance-helper">The next month automatically subtracts this month's payment. Change the starting balance here if purchases, interest, fees, or refunds made the real balance different.</p>`;

    const paidInput = editor.querySelector('.monthly-paid-input');
    const balanceInput = editor.querySelector('.monthly-balance-input');
    const saveButton = editor.querySelector('.save-payment-button');
    const save = () => saveMonthlyCardData(cardId, selectedPaymentMonth, paidInput.value, balanceInput.value);

    saveButton.addEventListener('click', save);
    [paidInput, balanceInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          save();
        }
      });
    });
  });

  if (metadataChanged) saveState();
  updatePaymentInputPrivacy();
}

function updatePaymentInputPrivacy() {
  const hidden = document.body.classList.contains('hidden-money');
  document.querySelectorAll('.monthly-paid-input, .monthly-balance-input').forEach((input) => {
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
  if (!card) return;

  ensureCardBalanceMetadata(card);
  preservedCardData = {
    previousBalance: Math.max(Number(card.balance) || 0, 0),
    balanceAnchorMonth: card.balanceAnchorMonth,
    monthlyPaidAmounts: { ...paymentAmountMap(card) },
    monthlyBalanceOverrides: { ...balanceOverrideMap(card) },
  };
}, true);

$('itemForm').addEventListener('submit', () => {
  if (!preservedPaymentCardId || !preservedCardData) return;
  const card = state.cards.find((entry) => entry.id === preservedPaymentCardId);
  if (card) {
    const newBalance = Math.max(Number(card.balance) || 0, 0);
    card.balanceAnchorMonth = preservedCardData.balanceAnchorMonth;
    card.monthlyPaidAmounts = preservedCardData.monthlyPaidAmounts;
    card.monthlyBalanceOverrides = preservedCardData.monthlyBalanceOverrides;

    if (Math.abs(newBalance - preservedCardData.previousBalance) >= 0.005) {
      card.monthlyBalanceOverrides[monthKey(new Date())] = newBalance;
    }

    saveState();
    renderAll();
  }
  preservedPaymentCardId = null;
  preservedCardData = null;
});

renderAll();
