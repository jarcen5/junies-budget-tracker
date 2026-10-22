function v13InjectUI() {
  document.body.classList.add('v13-ready');

  const dashboard = $('dashboardView');
  if (dashboard && !$('v13Home')) {
    [...dashboard.children].forEach((child) => child.classList.add('v13-home-legacy'));
    dashboard.insertAdjacentHTML('afterbegin', `
      <section id="v13Home">
        <div class="v13-home-heading">
          <div><p class="eyebrow">Next 14 days</p><h2>Two-week plan</h2></div>
          <button class="text-button" id="v13HomeAddPayday" type="button">+ Payday</button>
        </div>
        <div class="v13-home-metrics" id="v13HomeMetrics"></div>
        <div class="v13-two-week-weekdays" aria-hidden="true">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
        <div class="v13-two-week-grid" id="v13TwoWeekGrid"></div>
        <div class="section-heading v13-agenda-heading"><div><p class="eyebrow">Everything coming up</p><h2>Two-week agenda</h2></div></div>
        <div class="stack" id="v13TwoWeekAgenda"></div>
      </section>`);
  }

  const accounts = $('accountsView');
  if (accounts && !$('v13CardTools')) {
    const cardsSummary = $('cardsSummary') || $('paymentMonthPickerWrap') || $('cardsList');
    cardsSummary.insertAdjacentHTML('beforebegin', `
      <div class="v13-card-tools" id="v13CardTools">
        <label><span>Find a card</span><input id="v13CardSearch" type="search" placeholder="Search cards\u2026" autocomplete="off" /></label>
        <span class="v13-sort-note">Sorted by due date</span>
      </div>`);
  }

  if (!$('v13PlanView')) {
    const settings = $('settingsView');
    const planView = document.createElement('section');
    planView.className = 'view';
    planView.id = 'v13PlanView';
    planView.hidden = true;
    planView.innerHTML = `
      <div class="section-heading top-section-heading">
        <div><p class="eyebrow">Short-term planning</p><h2>Budget plan</h2></div>
        <button class="primary-button compact" id="v13AddPlanButton" type="button">+ Purchase</button>
      </div>
      <section class="v13-plan-summary">
        <div class="metric-grid v13-plan-metrics" id="v13PlanMetrics"></div>
      </section>
      <div class="section-heading v13-plan-section-heading">
        <div><p class="eyebrow">Income timing</p><h2>Paydays</h2></div>
        <button class="text-button" id="v13AddPaydayButton" type="button">+ Add payday</button>
      </div>
      <div class="stack" id="v13PaydayList"></div>
      <div class="section-heading v13-plan-section-heading">
        <div><p class="eyebrow">Upcoming purchases</p><h2>Plans</h2></div>
      </div>
      <div class="stack" id="v13PlanList"></div>`;
    settings.parentNode.insertBefore(planView, settings);

    const nav = document.querySelector('.bottom-nav');
    const settingsTab = $('settingsTab');
    if (nav && settingsTab) {
      const planTab = document.createElement('button');
      planTab.className = 'nav-item';
      planTab.id = 'v13PlanTab';
      planTab.dataset.view = 'v13PlanView';
      planTab.type = 'button';
      planTab.innerHTML = '<span>\u25ce</span>Plan';
      nav.insertBefore(planTab, settingsTab);
      planTab.addEventListener('click', () => showView('v13PlanView'));
    }
  }

  if (!$('v13PaydayDialog')) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="v13PaydayDialog" class="v11-dialog">
        <form id="v13PaydayForm" class="dialog-card">
          <div class="dialog-header">
            <div><p class="eyebrow">Calendar income</p><h2 id="v13PaydayDialogTitle">Add payday</h2></div>
            <button class="icon-button" id="v13ClosePaydayDialog" type="button" aria-label="Close">\xd7</button>
          </div>
          <label><span>Name</span><input id="v13PaydayName" type="text" maxlength="50" placeholder="Payday" required /></label>
          <label><span>Take-home amount <small>(optional)</small></span><input id="v13PaydayAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /></label>
          <label><span>Frequency</span><select id="v13PaydayFrequency">
            <option value="weekly">Weekly</option>
            <option value="biweekly" selected>Every 2 weeks</option>
            <option value="semimonthly">Twice a month</option>
            <option value="monthly">Monthly</option>
          </select></label>
          <label id="v13PaydayAnchorWrap"><span>Pay date</span><input id="v13PaydayAnchor" type="date" /></label>
          <div class="field-grid" id="v13PaydayDaysWrap" hidden>
            <label><span>First day</span><input id="v13PaydayDay1" type="number" min="1" max="31" inputmode="numeric" value="1" /></label>
            <label><span>Second day</span><input id="v13PaydayDay2" type="number" min="1" max="31" inputmode="numeric" value="15" /></label>
          </div>
          <p class="helper">Paydays stay on this device and appear on the main two-week view and monthly calendar.</p>
          <div class="dialog-actions">
            <button class="danger-button" id="v13DeletePayday" type="button" hidden>Delete</button>
            <span class="dialog-spacer"></span>
            <button class="secondary-buttton" id="v13CancelPayday" type="button">Cancel</button>
            <button class="primary-button" type="submit">Save</button>
          </div>
        </form>
      </dialog>`);

    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="v13PlanDialog" class="v11-dialog">
        <form id="v13PlanForm" class="dialog-card">
          <div class="dialog-header">
            <div><p class="eyebrow">Short-term budget</p><h2 id="v13PlanDialogTitle">Plan a purchase</h2></div>
            <button class="icon-button" id="v13ClosePlanDialog" type="button" aria-label="Close">\xd7</button>
          </div>
          <label><span>Purchase</span><input id="v13PlanName" type="text" maxlength="60" placeholder="e.g. New tires" required /></label>
          <div class="field-grid">
            <label><span>Estimated cost</span><input id="v13PlanCost" type="number" min="0" step="0.01" inputmode="decimal" required /></label>
            <label><span>Already set aside</span><input id="v13PlanSaved" type="number" min="0" step="0.01" inputmode="decimal" value="0" /></label>
          </div>
          <label><span>Target date <small>(optional)</small></span><input id="v13PlanDate" type="date" /></label>
          <label><span>Priority</span><select id="v13PlanPriority"><option value="need">Need</option><option value="want">Want</option></select></label>
          <label><span>Notes <small>(optional)</small></span><textarea id="v13PlanNotes" rows="3" maxlength="200"></textarea></label>
          <div class="dialog-actions">
            <button class="danger-button" id="v13DeletePlan" type="button" hidden>Delete</button>
            <span class="dialog-spacer"></span>
            <button class="secondary-button" id="v13CancelPlan" type="button">Cancel</button>
            <button class="primary-button" type="submit">Save</button>
          </div>
        </form>
      </dialog>`);

    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="v13BillAmountDialog" class="v11-dialog">
        <form id="v13BillAmountForm" class="dialog-card">
          <div class="dialog-header">
            <div><p class="eyebrow">Bill amount</p><h2 id="v13BillAmountTitle">Adjust amount</h2></div>
            <button class="icon-button" id="v13CloseBillAmountDialog" type="button" aria-label="Close">\xd7</button>
          </div>
          <label><span>Month</span><input id="v13BillAmountMonth" type="month" required /></label>
          <label><span>Amount</span><input id="v13BillAmountValue" type="number" min="0" step="0.01" inputmode="decimal" required /></label>
          <div class="v13-amount-choice">
            <label class="choice-card"><input type="radio" name="v13AmountMode" value="month" checked /><span><strong>This month only</strong><small>Use a special amount for just this month.</small></span></label>
            <label class="choice-card"><input type="radio" name="v13AmountMode" value="future" /><span><strong>This month and future months</strong><small>Keep earlier months unchanged and use this amount going forward.</small></span></label>
          </div>
          <p class="helper" id="v13BillAmountCurrent"></p>
          <div class="dialog-actions">
            <button class="secondary-button" id="v13ClearBillAdjustment" type="button">Clear adjustment</button>
            <span class="dialog-spacer"></span>
            <button class="secondary-button" id="v13CancelBillAmount" type="button">Cancel</button>
            <button class="primary-button" type="submit">Save amount</button>
          </div>
        </form>
      </dialog>`);

    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="v13DayDialog" class="v11-dialog">
        <div class="dialog-card">
          <div class="dialog-header">
            <div><p class="eyebrow">Two-week plan</p><h2 id="v13DayDialogTitle">Day details</h2></div>
            <button class="icon-button" id="v13CloseDayDialog" type="button" aria-label="Close">\xd7</button>
          </div>
          <div class="stack" id="v13DayDialogList"></div>
        </div>
      </dialog>`);
  }

  const amountLabel = $('billAmount')?.closest('label');
  if (amountLabel && !amountLabel.querySelector('.v13-amount-help')) {
    amountLabel.insertAdjacentHTML('beforeend', '<small class="v13-amount-help">For a temporary or future price change, use "Adjust amount" from the Bills page so earlier months stay accurate.</small>');
  }
}
