function v13RenderCards() {
  if (!$('cardsList')) return;
  const key = selectedPaymentMonth || monthKey(new Date());
  const cards = [...state.cards].sort((a, b) => (Number(a.dueDay) || 32) - (Number(b.dueDay) || 32) || String(a.name).localeCompare(String(b.name)));
  const minimums = cards.reduce((sum, card) => sum + v12MinimumFor(card, key), 0);
  const remaining = cards.filter((card) => !isPaid(card, key)).reduce((sum, card) => sum + v12MinimumFor(card, key), 0);
  const paid = cards.reduce((sum, card) => sum + paidAmountFor(card, key), 0);
  const next = cards.find((card) => !isPaid(card, key)) || cards[0];

  if ($('cardsSummaryMetrics')) {
    $('cardsSummaryMetrics').innerHTML = `
      <article class="metric-card"><span class="metric-label">Minimums</span><strong class="metric-value money">${money.format(minimums)}</strong></article>
      <article class="metric-card"><span class="metric-label">Remaining</span><strong class="metric-value money">${money.format(remaining)}</strong></article>
      <article class="metric-card"><span class="metric-label">Next card due</span><strong class="metric-value">${next ? `${escapeHtml(next.name)} \xb7 ${v13DateLabel(v13SelectedCardMonthDate(next, key))}` : 'None'}</strong></article>
      <article class="metric-card"><span class="metric-label">Paid this month</span><strong class="metric-value money">${money.format(paid)}</strong></article>`;
  }

  const list = $('cardsList');
  cards.forEach((card) => {
    const edit = list.querySelector(`[data-edit-card="${CSS.escape(card.id)}"]`);
    const account = edit?.closest('.account-card');
    const main = account?.querySelector('.account-main');
    if (!account || !main) return;

    const due = v13SelectedCardMonthDate(card, key);
    const minimum = v12MinimumFor(card, key);
    const balanceLine = main.querySelector(':scope > p');
    if (balanceLine) balanceLine.innerHTML = `Due ${v13DateLabel(due)} \xb7 <strong class="v13-inline-amount money">${money.format(minimum)}</strong> minimum`;

    const details = main.querySelector('.account-details');
    if (details) {
      const cutoff = typeof v11TimeLabel === 'function' ? v11TimeLabel(card.dueTime) : '';
      details.innerHTML = `<span>${isPaid(card, key) ? 'Paid' : 'Not paid yet'}</span>${cutoff ? `<span>Pay by ${cutoff}</span>` : ''}${card.autopay ? '<span class="v12-badge">Autopay</span>' : ''}`;
    }
    account.querySelector('.util-bar')?.classList.add('v13-hidden-util');
    account.dataset.v13CardName = String(card.name || '').toLowerCase();
    list.append(account);
  });

  const query = v13CardQuery.trim().toLowerCase();
  list.querySelectorAll('.account-card').forEach((account) => {
    account.hidden = Boolean(query) && !String(account.dataset.v13CardName || '').includes(query);
  });
}

const v13BaseRenderAccounts = renderAccounts;
renderAccounts = function v13RenderAccounts() {
  v13BaseRenderAccounts();
  v13RenderCards();
  v13DecorateBillRows();
};

function v13DecorateBillRows() {
  const root = $('v12BillGroups');
  if (!root) return;
  root.querySelectorAll('[data-v12-edit-bill]').forEach((editButton) => {
    const billId = editButton.dataset.v12EditBill;
    const actions = editButton.closest('.payment-actions');
    if (!actions || actions.querySelector(`[data-v13-adjust-bill="${CSS.escape(billId)}"]`)) return;
    const adjust = document.createElement('button');
    adjust.className = 'mini-button';
    adjust.type = 'button';
    adjust.dataset.v13AdjustBill = billId;
    adjust.textContent = 'Adjust amount';
    adjust.addEventListener('click', () => v13OpenBillAmountDialog(billId));
    actions.append(adjust);
  });
}

if (typeof v12RenderBillsPage === 'function') {
  const v13BaseRenderBillsPage = v12RenderBillsPage;
  v12RenderBillsPage = function v13RenderBillsPage() {
    v13BaseRenderBillsPage();
    v13DecorateBillRows();
  };
}

function v13OpenBillAmountDialog(billId) {
  const bill = state.bills.find((item) => item.id === billId);
  if (!bill) return;
  v13BillAdjustId = billId;
  const key = v12BillMonth || monthKey(new Date());
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1, safeDay(year, month - 1, bill.dueDay || v12ParseDate(v12AnchorDate(bill))?.getDate() || 1));
  $('v13BillAmountTitle').textContent = `Adjust ${bill.name}`;
  $('v13BillAmountMonth').value = key;
  $('v13BillAmountValue').value = v13BillAmountForDate(bill, date);
  document.querySelector('input[name="v13AmountMode"][value="month"]').checked = true;
  $('v13BillAmountCurrent').textContent = v13BillAmountSource(bill, key);
  $('v13BillAmountDialog').showModal();
}

function v13SaveBillAmount(event) {
  event.preventDefault();
  const bill = state.bills.find((item) => item.id === v13BillAdjustId);
  if (!bill) return;
  const key = $('v13BillAmountMonth').value;
  const amount = Math.max(Number($('v13BillAmountValue').value) || 0, 0);
  const mode = document.querySelector('input[name="v13AmountMode"]:checked')?.value || 'month';
  if (!/^\d{4}-\d{2}$/.test(key)) return;

  bill.monthlyAmountOverrides = { ...v13BillAmountMaps(bill).exact };
  bill.amountChanges = { ...v13BillAmountMaps(bill).changes };
  if (mode === 'future') {
    bill.amountChanges[key] = amount;
    delete bill.monthlyAmountOverrides[key];
  } else {
    bill.monthlyAmountOverrides[key] = amount;
  }
  saveState();
  $('v13BillAmountDialog').close();
  renderAll();
  if (typeof v12RenderBillsPage === 'function') v12RenderBillsPage();
  showToast(`${bill.name} updated for ${paymentMonthLabel(key)}.`);
}

function v13ClearBillAdjustment() {
  const bill = state.bills.find((item) => item.id === v13BillAdjustId);
  const key = $('v13BillAmountMonth').value;
  if (!bill || !/^\d{4}-\d{2}$/.test(key)) return;
  const { exact, changes } = v13BillAmountMaps(bill);
  bill.monthlyAmountOverrides = { ...exact };
  bill.amountChanges = { ...changes };
  delete bill.monthlyAmountOverrides[key];
  delete bill.amountChanges[key];
  saveState();
  $('v13BillAmountDialog').close();
  renderAll();
  if (typeof v12RenderBillsPage === 'function') v12RenderBillsPage();
  showToast(`Adjustment cleared for ${paymentMonthLabel(key)}.`);
}

