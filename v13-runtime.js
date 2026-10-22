const v13BaseRenderDashboard = renderDashboard;
renderDashboard = function v13RenderDashboard() {
  v13BaseRenderDashboard();
  v13RenderHome();
};

const v13BaseRenderCalendar = renderCalendar;
renderCalendar = function v13RenderCalendar() {
  v13BaseRenderCalendar();
  v13EnhanceCalendarPaydays();
};

const v13BaseShowView = showView;
showView = function v13ShowView(viewId) {
  v13BaseShowView(viewId);
  if (viewId === 'v13PlanView') v13RenderPlanPage();
  if (viewId === 'accountsView') v13RenderCards();
  if (viewId === 'billsView') v13DecorateBillRows();
};

let v13PreservedBillAmounts = null;

function v13CaptureBillAmountData() {
  if ($('itemType').value !== 'bill' || !$('itemId').value) {
    v13PreservedBillAmounts = null;
    return;
  }
  const bill = state.bills.find((item) => item.id === $('itemId').value);
  if (!bill) return;
  const maps = v13BillAmountMaps(bill);
  v13PreservedBillAmounts = {
    id: bill.id,
    exact: { ...maps.exact },
    changes: { ...maps.changes },
  };
}

function v13RestoreBillAmountData() {
  if (!v13PreservedBillAmounts) return;
  const bill = state.bills.find((item) => item.id === v13PreservedBillAmounts.id);
  if (bill) {
    bill.monthlyAmountOverrides = v13PreservedBillAmounts.exact;
    bill.amountChanges = v13PreservedBillAmounts.changes;
    saveState();
  }
  v13PreservedBillAmounts = null;
}

function v13BindEvents() {
  $('v13CardSearch')?.addEventListener('input', (event) => {
    v13CardQuery = event.target.value || '';
    v13RenderCards();
  });

  $('v13HomeAddPayday')?.addEventListener('click', () => v13OpenPaydayDialog());
  $('v13AddPaydayButton')?.addEventListener('click', () => v13OpenPaydayDialog());
  $('v13AddPlanButton')?.addEventListener('click', () => v13OpenPlanDialog());

  $('v13PaydayFrequency')?.addEventListener('change', v13UpdatePaydayFields);
  $('v13PaydayForm')?.addEventListener('submit', v13SavePayday);
  $('v13ClosePaydayDialog')?.addEventListener('click', () => $('v13PaydayDialog').close());
  $('v13CancelPayday')?.addEventListener('click', () => $('v13PaydayDialog').close());
  $('v13DeletePayday')?.addEventListener('click', v13DeletePayday);

  $('v13PaydayAmountOverrideForm')?.addEventListener('submit', v13SavePaydayAmountOverride);
  $('v13ClosePaydayAmountOverrideDialog')?.addEventListener('click', () => $('v13PaydayAmountOverrideDialog').close());
  $('v13CancelPaydayAmountOverride')?.addEventListener('click', () => $('v13PaydayAmountOverrideDialog').close());
  $('v13ClearPaydayAmountOverride')?.addEventListener('click', v13ClearPaydayAmountOverride);
  $('v13PaydayAmountOverrideDate')?.addEventListener('change', () => {
    const schedule = v13Paydays().find((item) => item.id === v13AdjustingPaydayId);
    const date = v13ParseDate($('v13PaydayAmountOverrideDate').value);
    if (!schedule || !date) return;
    v13AdjustingPaydayDate = v13DateKey(date);
    $('v13PaydayAmountOverrideValue').value = v13PaydayAmountForDate(schedule, date);
    const normal = Math.max(Number(schedule.amount) || 0, 0);
    $('v13PaydayAmountOverrideCurrent').textContent = normal
      ? `Normal take-home amount: ${money.format(normal)}. This change will apply only to ${v13LongDate(date)}.`
      : `This change will apply only to ${v13LongDate(date)}.`;
  });

  $('v13PlanForm')?.addEventListener('submit', v13SavePlan);
  $('v13ClosePlanDialog')?.addEventListener('click', () => $('v13PlanDialog').close());
  $('v13CancelPlan')?.addEventListener('click', () => $('v13PlanDialog').close());
  $('v13DeletePlan')?.addEventListener('click', v13DeletePlan);

  $('v13BillAmountForm')?.addEventListener('submit', v13SaveBillAmount);
  $('v13CloseBillAmountDialog')?.addEventListener('click', () => $('v13BillAmountDialog').close());
  $('v13CancelBillAmount')?.addEventListener('click', () => $('v13BillAmountDialog').close());
  $('v13ClearBillAdjustment')?.addEventListener('click', v13ClearBillAdjustment);
  $('v13BillAmountMonth')?.addEventListener('change', () => {
    const bill = state.bills.find((item) => item.id === v13BillAdjustId);
    const key = $('v13BillAmountMonth').value;
    if (!bill || !/^\d{4}-\d{2}$/.test(key)) return;
    const [year, month] = key.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    $('v13BillAmountValue').value = v13BillAmountForDate(bill, date);
    $('v13BillAmountCurrent').textContent = v13BillAmountSource(bill, key);
  });

  $('v13CloseDayDialog')?.addEventListener('click', () => $('v13DayDialog').close());

  $('itemForm').addEventListener('submit', v13CaptureBillAmountData, true);
  $('itemForm').addEventListener('submit', v13RestoreBillAmountData);
}

function v13Init() {
  state.paydays = Array.isArray(state.paydays) ? state.paydays : [];
  state.plans = Array.isArray(state.plans) ? state.plans : [];
  v13InjectUI();
  v13BindEvents();
  renderAll();
  v13RenderPlanPage();
  v13RenderCards();
  v13DecorateBillRows();
}

v13Init();
