function v13RenderPlanPage() {
  if (!$('v13PlanList')) return;
  const active = v13Plans().filter((plan) => !plan.completed);
  const total = active.reduce((sum, plan) => sum + (Number(plan.cost) || 0), 0);
  const saved = active.reduce((sum, plan) => sum + Math.min(Number(plan.saved) || 0, Number(plan.cost) || 0), 0);
  const remaining = Math.max(total - saved, 0);
  const dated = active.filter((plan) => v13ParseDate(plan.targetDate)).sort((a, b) => v13ParseDate(a.targetDate) - v13ParseDate(b.targetDate));
  $('v13PlanMetrics').innerHTML = `
    <article class="metric-card"><span class="metric-label">Planned</span><strong class="metric-value money">${money.format(total)}</strong></article>
    <article class="metric-card"><span class="metric-label">Set aside</span><strong class="metric-value money">${money.format(saved)}</strong></article>
    <article class="metric-card"><span class="metric-label">Still needed</span><strong class="metric-value money">${money.format(remaining)}</strong></article>
    <article class="metric-card"><span class="metric-label">Next target</span><strong class="metric-value">${dated[0] ? v13DateLabel(v13ParseDate(dated[0].targetDate)) : 'None'}</strong></article>`;

  $('v13PaydayList').innerHTML = v13Paydays().length ? v13Paydays().map((schedule) => {
    const upcoming = v13PaydayOccurrencesBetween(new Date(), new Date(Date.now() + 120 * 86400000)).find((row) => row.schedule.id === schedule.id);
    return `<article class="account-card v13-payday-card">
      <div class="account-icon">+$</div>
      <div class="account-main"><strong>${escapeHtml(schedule.name || 'Payday')}</strong><p>${escapeHtml(V13_PAY_FREQUENCIES[schedule.frequency] || 'Every 2 weeks')}${schedule.amount ? ` \xb7 <span class="money">${money.format(schedule.amount)}</span>` : ''}</p><div class="account-details"><span>${upcoming ? `Next ${v13LongDate(upcoming.date)}` : 'No upcoming date'}</span></div></div>
      <button class="mini-button" type="button" data-v13-edit-payday="${schedule.id}">Edit</button>
    </article>`;
  }).join('') : `<div class="empty-state"><strong>Add your payday</strong><p>Your payday will appear on the home view and calendar, and it lets purchase plans calculate how much to set aside per paycheck.</p><button class="primary-button compact" id="v13EmptyAddPayday" type="button">Add payday</button></div>`;

  $('v13PaydayList').querySelectorAll('[data-v13-edit-payday]').forEach((button) => button.addEventListener('click', () => v13OpenPaydayDialog(button.dataset.v13EditPayday)));
  $('v13EmptyAddPayday')?.addEventListener('click', () => v13OpenPaydayDialog());

  const plans = [...v13Plans()].sort((a, b) => {
    if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
    const ad = v13ParseDate(a.targetDate);
    const bd = v13ParseDate(b.targetDate);
    if (ad && bd) return ad - bd;
    if (ad) return -1;
    if (bd) return 1;
    return String(a.name).localeCompare(String(b.name));
  });

  $('v13PlanList').innerHTML = plans.length ? plans.map((plan) => {
    const cost = Math.max(Number(plan.cost) || 0, 0);
    const setAside = Math.min(Math.max(Number(plan.saved) || 0, 0), cost);
    const remainingAmount = Math.max(cost - setAside, 0);
    const progress = cost > 0 ? Math.min(setAside / cost * 100, 100) : 0;
    const suggestion = v13PaycheckSuggestion(plan);
    return `<article class="v13-plan-card${plan.completed ? ' completed' : ''}">
      <div class="v13-plan-card-head"><div><span class="v13-plan-priority">${plan.priority === 'want' ? 'Want' : 'Need'}</span><strong>${escapeHtml(plan.name)}</strong></div><strong class="money">${money.format(cost)}</strong></div>
      <div class="v13-progress"><span style="width:${progress}%"></span></div>
      <div class="v13-plan-details"><span>Set aside <strong class="money">${money.format(setAside)}</strong></span><span>Remaining <strong class="money">${money.format(remainingAmount)}</strong></span>${plan.targetDate ? `<span>Target ${v13DateLabel(v13ParseDate(plan.targetDate))}</span>` : ''}</div>
      <p class="v13-paycheck-suggestion">${escapeHtml(suggestion.text)}</p>
      <div class="v13-plan-actions"><button class="mini-button" type="button" data-v13-edit-plan="${plan.id}">Edit</button><button class="mini-button ${plan.completed ? 'paid' : ''}" type="button" data-v13-complete-plan="${plan.id}">${plan.completed ? 'Undo purchased' : 'Mark purchased'}</button></div>
    </article>`;
  }).join('') : '<div class="empty-state"><strong>No purchases planned</strong><p>Add something you want to budget for over the next few paychecks.</p><button class="primary-button compact" id="v13EmptyAddPlan" type="button">Plan a purchase</button></div>';

  $('v13PlanList').querySelectorAll('[data-v13-edit-plan]').forEach((button) => button.addEventListener('click', () => v13OpenPlanDialog(button.dataset.v13EditPlan)));
  $('v13PlanList').querySelectorAll('[data-v13-complete-plan]').forEach((button) => button.addEventListener('click', () => {
    const plan = v13Plans().find((item) => item.id === button.dataset.v13CompletePlan);
    if (!plan) return;
    plan.completed = !plan.completed;
    saveState();
    v13RenderPlanPage();
  }));
  $('v13EmptyAddPlan')?.addEventListener('click', () => v13OpenPlanDialog());
}

function v13EnhanceCalendarPaydays() {
  const grid = $('calendarGrid');
  if (!grid) return;
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const paydays = v13PaydayOccurrencesBetween(start, end);
  grid.querySelectorAll('.calendar-day:not(.other-month)').forEach((day) => {
    const dayNumber = Number(day.querySelector('.day-number')?.textContent);
    const matches = paydays.filter((row) => row.date.getDate() === dayNumber);
    matches.forEach((row) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-item v13-calendar-payday';
      button.innerHTML = `<span>${escapeHtml(row.schedule.name || 'Payday')}</span>${row.amount ? ` <span class="money">${money.format(row.amount)}</span>` : ''}`;
      button.addEventListener('click', () => v13OpenPaydayDialog(row.schedule.id));
      day.append(button);
    });
  });
}

