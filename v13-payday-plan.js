function v13OpenPaydayDialog(id = null) {
  const schedule = id ? v13Paydays().find((item) => item.id === id) : null;
  v13EditingPaydayId = schedule?.id || null;
  $('v13PaydayForm').reset();
  $('v13PaydayDialogTitle').textContent = schedule ? 'Edit payday' : 'Add payday';
  $('v13PaydayName').value = schedule?.name || 'Payday';
  $('v13PaydayAmount').value = schedule?.amount || '';
  $('v13PaydayFrequency').value = schedule?.frequency || 'biweekly';
  $('v13PaydayAnchor').value = schedule?.anchorDate || v13DateKey(new Date());
  $('v13PaydayDay1').value = schedule?.day1 || 1;
  $('v13PaydayDay2').value = schedule?.day2 || 15;
  $('v13DeletePayday').hidden = !schedule;
  v13UpdatePaydayFields();
  $('v13PaydayDialog').showModal();
}

function v13UpdatePaydayFields() {
  const semimonthly = $('v13PaydayFrequency').value === 'semimonthly';
  $('v13PaydayAnchorWrap').hidden = semimonthly;
  $('v13PaydayDaysWrap').hidden = !semimonthly;
}

function v13SavePayday(event) {
  event.preventDefault();
  const frequency = $('v13PaydayFrequency').value;
  const semimonthly = frequency === 'semimonthly';
  if (!semimonthly && !$('v13PaydayAnchor').value) {
    showToast('Choose a pay date.');
    return;
  }
  const schedule = {
    id: v13EditingPaydayId || uid(),
    name: $('v13PaydayName').value.trim() || 'Payday',
    amount: Math.max(Number($('v13PaydayAmount').value) || 0, 0),
    frequency: V13_PAY_FREQUENCIES[frequency] ? frequency : 'biweekly',
    anchorDate: semimonthly ? '' : $('v13PaydayAnchor').value,
    day1: semimonthly ? clampDueDay($('v13PaydayDay1').value) : null,
    day2: semimonthly ? clampDueDay($('v13PaydayDay2').value) : null,
  };
  const index = v13Paydays().findIndex((item) => item.id === schedule.id);
  if (index >= 0) state.paydays[index] = schedule;
  else state.paydays.push(schedule);
  saveState();
  $('v13PaydayDialog').close();
  renderAll();
  v13RenderPlanPage();
  showToast('Payday saved.');
}

function v13DeletePayday() {
  if (!v13EditingPaydayId) return;
  const schedule = v13Paydays().find((item) => item.id === v13EditingPaydayId);
  if (!schedule || !confirm(`Delete ${schedule.name || 'this payday'}?`)) return;
  state.paydays = state.paydays.filter((item) => item.id !== v13EditingPaydayId);
  saveState();
  $('v13PaydayDialog').close();
  renderAll();
  v13RenderPlanPage();
  showToast('Payday removed.');
}

function v13OpenPlanDialog(id = null) {
  const plan = id ? v13Plans().find((item) => item.id === id) : null;
  v13EditingPlanId = plan?.id || null;
  $('v13PlanForm').reset();
  $('v13PlanDialogTitle').textContent = plan ? 'Edit purchase plan' : 'Plan a purchase';
  $('v13PlanName').value = plan?.name || '';
  $('v13PlanCost').value = plan?.cost ?? '';
  $('v13PlanSaved').value = plan?.saved ?? 0;
  $('v13PlanDate').value = plan?.targetDate || '';
  $('v13PlanPriority').value = plan?.priority || 'need';
  $('v13PlanNotes').value = plan?.notes || '';
  $('v13DeletePlan').hidden = !plan;
  $('v13PlanDialog').showModal();
}

function v13SavePlan(event) {
  event.preventDefault();
  const plan = {
    id: v13EditingPlanId || uid(),
    name: $('v13PlanName').value.trim(),
    cost: Math.max(Number($('v13PlanCost').value) || 0, 0),
    saved: Math.max(Number($('v13PlanSaved').value) || 0, 0),
    targetDate: $('v13PlanDate').value,
    priority: $('v13PlanPriority').value === 'want' ? 'want' : 'need',
    notes: $('v13PlanNotes').value.trim(),
    completed: v13Plans().find((item) => item.id === v13EditingPlanId)?.completed || false,
  };
  if (!plan.name || plan.cost <= 0) return;
  const index = v13Plans().findIndex((item) => item.id === plan.id);
  if (index >= 0) state.plans[index] = plan;
  else state.plans.push(plan);
  saveState();
  $('v13PlanDialog').close();
  v13RenderPlanPage();
  showToast('Purchase plan saved.');
}

function v13DeletePlan() {
  if (!v13EditingPlanId) return;
  const plan = v13Plans().find((item) => item.id === v13EditingPlanId);
  if (!plan || !confirm(`Delete ${plan.name}?`)) return;
  state.plans = state.plans.filter((item) => item.id !== v13EditingPlanId);
  saveState();
  $('v13PlanDialog').close();
  v13RenderPlanPage();
  showToast('Plan deleted.');
}

function v13PaycheckSuggestion(plan) {
  const remaining = Math.max((Number(plan.cost) || 0) - (Number(plan.saved) || 0), 0);
  if (remaining <= 0) return { text: 'Fully funded', amount: 0 };
  const target = v13ParseDate(plan.targetDate);
  if (!target) return { text: 'Add a target date for a per-paycheck goal', amount: null };
  const today = v13StartOfDay(new Date());
  if (target < today) return { text: 'Target date has passed', amount: null };
  const paydays = v13PaydayOccurrencesBetween(today, target);
  if (!paydays.length) return { text: 'Add a payday to calculate a per-paycheck goal', amount: null };
  const amount = remaining / paydays.length;
  return { text: `${money.format(amount)} per payday \xb7 ${paydays.length} paydays`, amount };
}

