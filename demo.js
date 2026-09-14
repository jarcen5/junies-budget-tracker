(() => {
  const params = new URLSearchParams(window.location.search);
  const demoMode = params.get('demo') === '1';
  const demoMarkerKey = 'junies-budget-demo-mode-v1';
  const appStorageKey = 'junies-budget-tracker-v1';

  // Demo data shares the app's normal storage key so the existing app code can
  // render it, but we mark it and automatically clear it when the normal URL is
  // opened. This keeps fictional portfolio data separate from normal use.
  if (!demoMode) {
    if (localStorage.getItem(demoMarkerKey) === '1') {
      localStorage.removeItem(appStorageKey);
      localStorage.removeItem(demoMarkerKey);
      window.location.replace(window.location.pathname);
    }
    return;
  }

  const currentMonth = monthKey(new Date());
  const existingDemo = localStorage.getItem(demoMarkerKey) === '1';

  if (!existingDemo) {
    const demoState = {
      cards: [
        {
          id: 'demo-card-everyday',
          name: 'Everyday Rewards',
          balance: 684.22,
          limit: 5000,
          statementBalance: 684.22,
          minimumPayment: 45,
          dueDay: 18,
          dueTime: '17:00',
          autopay: false,
          notes: 'Fictional demo account',
          paidMonths: [],
          monthlyPaidAmounts: {},
          balanceAnchorMonth: currentMonth,
          monthlyBalanceOverrides: { [currentMonth]: 684.22 },
        },
        {
          id: 'demo-card-travel',
          name: 'Travel Card',
          balance: 1290.4,
          limit: 8000,
          statementBalance: 1290.4,
          minimumPayment: 60,
          dueDay: 24,
          dueTime: '20:00',
          autopay: true,
          notes: 'Fictional demo account',
          paidMonths: [],
          monthlyPaidAmounts: {},
          balanceAnchorMonth: currentMonth,
          monthlyBalanceOverrides: { [currentMonth]: 1290.4 },
        },
        {
          id: 'demo-card-store',
          name: 'Store Card',
          balance: 312.15,
          limit: 2500,
          statementBalance: 347.15,
          minimumPayment: 35,
          dueDay: 8,
          dueTime: '17:00',
          autopay: false,
          notes: 'Fictional demo account',
          paidMonths: [currentMonth],
          monthlyPaidAmounts: { [currentMonth]: 35 },
          balanceAnchorMonth: currentMonth,
          monthlyBalanceOverrides: { [currentMonth]: 312.15 },
        },
      ],
      bills: [
        {
          id: 'demo-bill-rent',
          name: 'Rent',
          amount: 1450,
          recurring: true,
          recurrenceType: 'monthly',
          dueDay: 1,
          category: 'Housing',
          autopay: false,
          notes: 'Fictional demo bill',
          paidMonths: [currentMonth],
        },
        {
          id: 'demo-bill-internet',
          name: 'Home Internet',
          amount: 79.99,
          recurring: true,
          recurrenceType: 'monthly',
          dueDay: 12,
          dueTime: '23:59',
          category: 'Utilities',
          autopay: true,
          notes: 'Fictional demo bill',
          paidMonths: [currentMonth],
        },
        {
          id: 'demo-bill-insurance',
          name: 'Car Insurance',
          amount: 142.5,
          recurring: true,
          recurrenceType: 'monthly',
          dueDay: 16,
          category: 'Transportation',
          autopay: true,
          notes: 'Fictional demo bill',
          paidMonths: [],
        },
        {
          id: 'demo-bill-phone',
          name: 'Phone',
          amount: 65,
          recurring: true,
          recurrenceType: 'monthly',
          dueDay: 20,
          category: 'Utilities',
          autopay: false,
          notes: 'Fictional demo bill',
          paidMonths: [],
        },
        {
          id: 'demo-bill-streaming',
          name: 'Streaming Bundle',
          amount: 18.99,
          recurring: true,
          recurrenceType: 'monthly',
          dueDay: 25,
          category: 'Subscriptions',
          autopay: true,
          notes: 'Fictional demo bill',
          paidMonths: [],
        },
      ],
      settings: { hideByDefault: false },
    };

    state = normalizeState(demoState);
    saveState();
    localStorage.setItem(demoMarkerKey, '1');
  }

  const banner = document.createElement('aside');
  banner.setAttribute('role', 'note');
  banner.style.cssText = [
    'margin: 0 auto 18px',
    'max-width: 1080px',
    'padding: 12px 16px',
    'border: 1px solid #bfdbfe',
    'border-radius: 16px',
    'background: #eff6ff',
    'color: #1e3a8a',
    'font-weight: 700',
    'line-height: 1.4',
  ].join(';');
  banner.innerHTML = 'Portfolio demo — all cards, balances, bills, and payment details shown here are fictional.';

  const main = document.querySelector('main');
  if (main) main.insertAdjacentElement('beforebegin', banner);

  renderAll();
})();
