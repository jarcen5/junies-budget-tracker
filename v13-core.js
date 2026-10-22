
const V13_PAY_FREQUENCIES = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
};

let v13CardQuery = '';
let v13BillAdjustId = null;
let v13EditingPaydayId = null;
let v13EditingPlanId = null;
let v13AdjustingPaydayId = null;
let v13AdjustingPaydayDate = '';

function v13DateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function v13MonthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function v13ParseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const result = new Date(year, month - 1, day);
  return Number.isNaN(result.getTime()) ? null : result;
}

function v13StartOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function v13DateLabel(date, options = {}) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

function v13LongDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function v13BillAmountMaps(bill) {
  const exact = bill?.monthlyAmountOverrides && typeof bill.monthlyAmountOverrides === 'object' && !Array.isArray(bill.monthlyAmountOverrides)
    ? bill.monthlyAmountOverrides
    : {};
  const changes = bill?.amountChanges && typeof bill.amountChanges === 'object' && !Array.isArray(bill.amountChanges)
    ? bill.amountChanges
    : {};
  return { exact, changes };
}

function v13BillAmountForDate(bill, date) {
  const key = v13MonthKeyFromDate(date);
  const { exact, changes } = v13BillAmountMaps(bill);
  if (Object.prototype.hasOwnProperty.call(exact, key)) return Math.max(Number(exact[key]) || 0, 0);
  const effective = Object.keys(changes)
    .filter((candidate) => /^\d{4}-\d{2}$/.test(candidate) && candidate <= key)
    .sort()
    .pop();
  if (effective) return Math.max(Number(changes[effective]) || 0, 0);
  return Math.max(Number(bill?.amount) || 0, 0);
}

function v13BillAmountSource(bill, key) {
  const { exact, changes } = v13BillAmountMaps(bill);
  if (Object.prototype.hasOwnProperty.call(exact, key)) return 'This month only';
  const effective = Object.keys(changes)
    .filter((candidate) => /^\d{4}-\d{2}$/.test(candidate) && candidate <= key)
    .sort()
    .pop();
  if (effective) return `Changed starting ${paymentMonthLabel(effective, true)}`;
  return 'Recurring amount';
}

const v13BasePaymentsForMonth = paymentsForMonth;
paymentsForMonth = function v13PaymentsForMonth(year, month) {
  return v13BasePaymentsForMonth(year, month).map((row) => {
    if (row.type !== 'bill') return row;
    const bill = state.bills.find((item) => item.id === row.id);
    return bill ? { ...row, amount: v13BillAmountForDate(bill, row.date) } : row;
  });
};

function v13Paydays() {
  state.paydays = Array.isArray(state.paydays) ? state.paydays : [];
  return state.paydays;
}

function v13Plans() {
  state.plans = Array.isArray(state.plans) ? state.plans : [];
  return state.plans;
}

function v13PaydayAmountForDate(schedule, date) {
  const overrides = schedule?.amountOverrides && typeof schedule.amountOverrides === 'object' && !Array.isArray(schedule.amountOverrides)
    ? schedule.amountOverrides
    : {};
  const key = v13DateKey(date);
  if (Object.prototype.hasOwnProperty.call(overrides, key)) return Math.max(Number(overrides[key]) || 0, 0);
  return Math.max(Number(schedule?.amount) || 0, 0);
}

function v13PaydayOccurrencesBetween(start, end) {
  const from = v13StartOfDay(start);
  const through = v13StartOfDay(end);
  const results = [];

  v13Paydays().forEach((schedule) => {
    const frequency = V13_PAY_FREQUENCIES[schedule.frequency] ? schedule.frequency : 'biweekly';

    if (frequency === 'semimonthly') {
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const last = new Date(through.getFullYear(), through.getMonth(), 1);
      while (cursor <= last) {
        [Number(schedule.day1) || 1, Number(schedule.day2) || 15].forEach((rawDay) => {
          const day = safeDay(cursor.getFullYear(), cursor.getMonth(), rawDay);
          const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          if (date >= from && date <= through) {
            results.push({ schedule, date, amount: v13PaydayAmountForDate(schedule, date) });
          }
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return;
    }

    const anchor = v13ParseDate(schedule.anchorDate);
    if (!anchor) return;

    if (frequency === 'monthly') {
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const last = new Date(through.getFullYear(), through.getMonth(), 1);
      while (cursor <= last) {
        const date = new Date(cursor.getFullYear(), cursor.getMonth(), safeDay(cursor.getFullYear(), cursor.getMonth(), anchor.getDate()));
        if (date >= from && date <= through && date >= anchor) {
          results.push({ schedule, date, amount: v13PaydayAmountForDate(schedule, date) });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return;
    }

    const stepDays = frequency === 'weekly' ? 7 : 14;
    let occurrence = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    if (occurrence < from) {
      const diff = Math.floor((from - occurrence) / 86400000);
      const jumps = Math.ceil(diff / stepDays);
      occurrence = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() + jumps * stepDays);
    }
    while (occurrence <= through) {
      if (occurrence >= anchor) {
        results.push({ schedule, date: new Date(occurrence), amount: v13PaydayAmountForDate(schedule, date) });
      }
      occurrence = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() + stepDays);
    }
  });

  return results.sort((a, b) => a.date - b.date || String(a.schedule.name).localeCompare(String(b.schedule.name)));
}

function v13NextPayday(from = new Date()) {
  const start = v13StartOfDay(from);
  const horizon = new Date(start.getFullYear() + 2, start.getMonth(), start.getDate());
  return v13PaydayOccurrencesBetween(start, horizon)[0] || null;
}

function v13PaymentsBetween(start, end) {
  if (typeof v11PaymentsBetween === 'function') return v11PaymentsBetween(start, end);
  const rows = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= finalMonth) {
    rows.push(...paymentsForMonth(cursor.getFullYear(), cursor.getMonth()));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const from = v13StartOfDay(start);
  const through = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
  return rows.filter((row) => row.date >= from && row.date <= through);
}

