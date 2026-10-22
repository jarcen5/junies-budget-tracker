function v13RenderHome() {
  if (!$('v13TwoWeekGrid')) return;
  const start = v13StartOfDay(new Date());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 13);
  const payments = v13PaymentsBetween(start, end);
  const paydays = v13PaydayOccurrencesBetween(start, end);
  const nextPayday = v13NextPayday(start);
  const unpaid = payments.filter((row) => !row.paid);
  const due14 = unpaid.reduce((sum, row) => sum + row.amount, 0);
  const dueBeforePayday = nextPayday
    ? unpaid.filter((row) => row.date < nextPayday.date).reduce((sum, row) => sum + row.amount, 0)
    : due14;

  $('v13HomeMetrics').innerHTML = `
    <article class="metric-card v13-payday-metric">
      <span class="metric-label">Next payday</span>
      <strong class="metric-value">${nextPayday ? v13DateLabel(nextPayday.date, { weekday: 'short' }) : 'Not set'}</strong>
      <small>${nextPayday ? escapeHtml(nextPayday.schedule.name || 'Payday') : 'Add your pay schedule'}</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">Due before payday</span>
      <strong class="metric-value money">${money.format(dueBeforePayday)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Due next 14 days</span>
      <strong class="metric-value money">${money.format(due14)}</strong>
    </article>`;

  const firstSunday = new Date(start);
  firstSunday.setDate(start.getDate() - start.getDay());
  const gridEnd = new Date(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate() + 13);
  const gridPayments = v13PaymentsBetween(firstSunday, gridEnd);
  const gridPaydays = v13PaydayOccurrencesBetween(firstSunday, gridEnd);

  $('v13TwoWeekGrid').innerHTML = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate() + index);
    const inRange = date >= start && date <= end;
    const dayPayments = gridPayments.filter((row) => v13DateKey(row.date) === v13DateKey(date));
    const dayPaydays = gridPaydays.filter((row) => v13DateKey(row.date) === v13DateKey(date));
    const items = [
      ...dayPaydays.map((row) => ({ type: 'payday', label: row.schedule.name || 'Payday', amount: row.amount, row })),
      ...dayPayments.map((row) => ({ type: row.type, label: row.name, amount: row.amount, row })),
    ];
    return `<button class="v13-two-week-day${inRange ? '' : ' outside'}${v13DateKey(date) === v13DateKey(start) ? ' today' : ''}" type="button" data-v13-day="${v13DateKey(date)}">
      <span class="v13-day-number">${date.getDate()}</span>
      <span class="v13-day-items">${items.slice(0, 3).map((item) =>
        `<span class="v13-day-chip ${item.type === 'payday' ? 'payday' : item.row.paid ? 'paid' : 'due'}">${escapeHtml(item.label)}</span>`
      ).join('')}${items.length > 3 ? `<span class="v13-more">+${items.length - 3}</span>` : ''}</span>
    </button>`;
  }).join('');

  $('v13TwoWeekGrid').querySelectorAll('[data-v13-day]').forEach((button) => {
    button.addEventListener('click', () => {
      const date = v13ParseDate(button.dataset.v13Day);
      if (date) v13OpenDayDialog(date);
    });
  });

  const agendaItems = [
    ...paydays.map((row) => ({ kind: 'payday', date: row.date, payday: row })),
    ...payments.map((row) => ({ kind: 'payment', date: row.date, payment: row })),
  ].sort((a, b) => a.date - b.date);

  $('v13TwoWeekAgenda').innerHTML = agendaItems.length ? agendaItems.map((item) => {
    if (item.kind === 'payday') {
      const payday = item.payday;
      return `<article class="payment-row v13-payday-row">
        <div class="payment-date"><strong>${payday.date.getDate()}</strong><span>${shortMonthFmt.format(payday.date)}</span></div>
        <div class="payment-main"><strong>${escapeHtml(payday.schedule.name || 'Payday')}</strong><p>${payday.amount ? `<span class="money">${money.format(payday.amount)}</span> \xb7 ` : ''}${escapeHtml(V13_PAY_FREQUENCIES[payday.schedule.frequency] || 'Payday')}</p><span class="status paid">Money in</span></div>
      </article>`;
    }
    const row = item.payment;
    const status = paymentStatus(row.date, row.paid);
    return `<article class="payment-row">
      <div class="payment-date"><strong>${row.date.getDate()}</strong><span>${shortMonthFmt.format(row.date)}</span></div>
      <div class="payment-main"><strong>${escapeHtml(row.name)}</strong><p>${row.type === 'card' ? 'Card minimum' : 'Bill'} \xb7 <span class="money">${money.format(row.amount)}</span></p><span class="status ${status.key}">${status.label}</span></div>
      <div class="payment-actions"><button class="mini-button ${row.paid ? 'paid' : ''}" type="button" data-v13-paid="${row.id}" data-type="${row.type}" data-key="${row.key}">${row.paid ? '\u2713 Paid' : 'Mark paid'}</button></div>
    </article>`;
  }).join('') : '<div class="v11-clear-card"><strong>Nothing due in the next two weeks</strong><p>Your calendar is clear.</p></div>';

  $('v13TwoWeekAgenda').querySelectorAll('[data-v13-paid]').forEach((button) => {
    button.addEventListener('click', () => togglePaid(button.dataset.v13Paid, button.dataset.type, button.dataset.key));
  });
}

function v13OpenDayDialog(date) {
  const payments = v13PaymentsBetween(date, date);
  const paydays = v13PaydayOccurrencesBetween(date, date);
  $('v13DayDialogTitle').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
  const root = $('v13DayDialogList');
  root.innerHTML = [
    ...paydays.map((row) => `<article class="payment-row v13-payday-row"><div class="payment-main"><strong>${escapeHtml(row.schedule.name || 'Payday')}</strong><p>${row.amount ? `<span class="money">${money.format(row.amount)}</span> \xb7 ` : ''}Payday</p><span class="status paid">Money in</span></div></article>`),
    ...payments.map((row) => {
      const status = paymentStatus(row.date, row.paid);
      return `<article class="payment-row"><div class="payment-main"><strong>${escapeHtml(row.name)}</strong><p>${row.type === 'card' ? 'Card minimum' : 'Bill'} \xb7 <span class="money">${money.format(row.amount)}</span></p><span class="status ${status.key}">${status.label}</span></div><div class="payment-actions"><button class="mini-button ${row.paid ? 'paid' : ''}" type="button" data-v13-paid="${row.id}" data-type="${row.type}" data-key="${row.key}">${row.paid ? '\u2713 Paid' : 'Mark paid'}</button></div></article>`;
    }),
  ].join('') || '<p class="muted">Nothing scheduled for this day.</p>';
  root.querySelectorAll('[data-v13-paid]').forEach((button) => {
    button.addEventListener('click', () => {
      togglePaid(button.dataset.v13Paid, button.dataset.type, button.dataset.key);
      $('v13DayDialog').close();
    });
  });
  $('v13DayDialog').showModal();
}

function v13SelectedCardMonthDate(card, key) {
  const [year, month] = String(key).split('-').map(Number);
  if (!year || !month) return new Date();
  return new Date(year, month - 1, safeDay(year, month - 1, card.dueDay));
}

