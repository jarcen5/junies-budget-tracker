const BUDGET_PUSH_FUNCTION_URL = 'https://uhdmbhtevttkwpbxcfpq.supabase.co/functions/v1/budget-push';
const BUDGET_PUSH_PUBLISHABLE_KEY = 'sb_publishable_uZ0aPTPY9jMVlc8Raz6T5w_J8ananFA';
const BUDGET_PUSH_VAPID_PUBLIC_KEY = 'BLM0yQ5HiLczUGzVnTPbh5iA5dGpbrrPDcqHuhtI64Ke9w7WPVJ5dBRrNMi5j3-RZDgm7JkBMyjKYZ5Sk5wJuJI';
const BUDGET_PUSH_ENABLED_KEY = 'junies-budget-push-enabled-v1';
const BUDGET_PUSH_INSTALLATION_KEY = 'junies-budget-push-installation-v1';
const BUDGET_PUSH_SECRET_KEY = 'junies-budget-push-device-secret-v1';
let budgetPushSyncTimer;

function budgetPushEnabled() {
  return localStorage.getItem(BUDGET_PUSH_ENABLED_KEY) === 'true';
}

function budgetPushRandomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function budgetPushIdentity() {
  let installationId = localStorage.getItem(BUDGET_PUSH_INSTALLATION_KEY);
  let deviceSecret = localStorage.getItem(BUDGET_PUSH_SECRET_KEY);
  if (!installationId) {
    installationId = crypto.randomUUID();
    localStorage.setItem(BUDGET_PUSH_INSTALLATION_KEY, installationId);
  }
  if (!deviceSecret) {
    deviceSecret = budgetPushRandomSecret();
    localStorage.setItem(BUDGET_PUSH_SECRET_KEY, deviceSecret);
  }
  return { installationId, deviceSecret };
}

function budgetPushBase64ToBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function budgetPushCall(action, extra = {}) {
  const response = await fetch(BUDGET_PUSH_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': BUDGET_PUSH_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${BUDGET_PUSH_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(result.error || `Push service returned ${response.status}.`);
  return result;
}

function budgetPushReminderRows() {
  const cards = state.cards.map((card) => ({
    itemKey: card.id,
    itemType: 'card',
    itemName: card.name,
    recurring: true,
    dueDay: Number(card.dueDay) || 1,
    dueDate: null,
    dueTime: card.dueTime || null,
    paidMonths: Array.isArray(card.paidMonths) ? card.paidMonths : [],
  }));
  const bills = state.bills.map((bill) => ({
    itemKey: bill.id,
    itemType: 'bill',
    itemName: bill.name,
    recurring: Boolean(bill.recurring),
    dueDay: bill.recurring ? (Number(bill.dueDay) || 1) : null,
    dueDate: bill.recurring ? null : bill.dueDate,
    dueTime: bill.dueTime || null,
    paidMonths: Array.isArray(bill.paidMonths) ? bill.paidMonths : [],
  }));
  return [...cards, ...bills];
}

async function budgetPushSubscription(createIfMissing = false) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && createIfMissing) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: budgetPushBase64ToBytes(BUDGET_PUSH_VAPID_PUBLIC_KEY),
    });
  }
  return subscription;
}

function budgetPushDisableLocalFallback() {
  if (typeof v11Prefs !== 'function' || typeof v11SavePrefs !== 'function') return;
  const prefs = v11Prefs();
  prefs.enabled = false;
  v11SavePrefs(prefs);
}

async function budgetPushSync(options = {}) {
  if (!budgetPushEnabled() || Notification.permission !== 'granted') return false;
  const subscription = await budgetPushSubscription(Boolean(options.createIfMissing));
  if (!subscription) return false;
  const identity = budgetPushIdentity();
  const prefs = typeof v11Prefs === 'function' ? v11Prefs() : { reminderTime: '09:00' };
  const payload = subscription.toJSON();
  await budgetPushCall('register', {
    ...identity,
    subscription: payload,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    reminderTime: prefs.reminderTime || '09:00',
    reminders: budgetPushReminderRows(),
  });
  budgetPushDisableLocalFallback();
  if (!options.silent) showToast('Push reminders synced.');
  return true;
}

function budgetPushQueueSync() {
  if (!budgetPushEnabled()) return;
  clearTimeout(budgetPushSyncTimer);
  budgetPushSyncTimer = setTimeout(() => {
    budgetPushSync({ silent: true }).catch((error) => console.warn('Push reminder sync failed:', error));
  }, 700);
}

async function budgetPushEnable() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Push notifications are not supported on this browser.');
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    budgetPushRefreshUI();
    showToast('Notifications were not enabled.');
    return;
  }
  try {
    localStorage.setItem(BUDGET_PUSH_ENABLED_KEY, 'true');
    await budgetPushSync({ createIfMissing: true, silent: true });
    budgetPushRefreshUI();
    showToast('Background bill reminders enabled.');
  } catch (error) {
    localStorage.setItem(BUDGET_PUSH_ENABLED_KEY, 'false');
    budgetPushRefreshUI();
    console.error(error);
    showToast('Could not enable background reminders.');
  }
}

async function budgetPushDisable() {
  const identity = budgetPushIdentity();
  localStorage.setItem(BUDGET_PUSH_ENABLED_KEY, 'false');
  try { await budgetPushCall('disable', identity); } catch (error) { console.warn(error); }
  budgetPushRefreshUI();
  showToast('Background reminders turned off.');
}

async function budgetPushTest() {
  if (!budgetPushEnabled()) return;
  const button = document.getElementById('testPushButton');
  if (button) { button.disabled = true; button.textContent = 'Sending…'; }
  try {
    await budgetPushSync({ silent: true });
    await budgetPushCall('test', budgetPushIdentity());
    showToast('Test notification sent.');
  } catch (error) {
    console.error(error);
    showToast('The test notification could not be sent.');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Send test notification'; }
  }
}

function budgetPushTimeLabel(value) {
  if (typeof v11TimeLabel === 'function') return v11TimeLabel(value);
  return value || '9:00 AM';
}

function budgetPushRefreshUI() {
  const group = document.getElementById('reminderSettingsGroup');
  if (!group) return;
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const enabled = budgetPushEnabled() && supported && Notification.permission === 'granted';
  const status = document.getElementById('reminderStatus');
  const support = document.getElementById('reminderSupportText');
  const button = document.getElementById('enableRemindersButton');
  const test = document.getElementById('testPushButton');
  const reminderTime = document.getElementById('reminderTime')?.value || '09:00';

  if (!supported) {
    status.textContent = 'Push notifications are not supported';
    support.textContent = 'Try installing the tracker or opening it in a browser that supports web push.';
    button.disabled = true;
    if (test) test.hidden = true;
    return;
  }
  if (Notification.permission === 'denied') {
    status.textContent = 'Notifications are blocked';
    support.textContent = 'Allow notifications for this site in your browser settings.';
    button.textContent = 'Blocked';
    button.disabled = true;
    if (test) test.hidden = true;
    return;
  }
  button.disabled = false;
  button.textContent = enabled ? 'Turn off' : 'Enable';
  status.textContent = enabled ? 'Background reminders are on' : 'Background reminders are off';
  support.textContent = enabled
    ? `The reminder service will notify you the day before, at about ${budgetPushTimeLabel(reminderTime)}.`
    : 'Enable once on this device to receive reminders even when the tracker is closed.';
  if (test) test.hidden = !enabled;
}

function budgetPushPrepareUI() {
  const group = document.getElementById('reminderSettingsGroup');
  if (!group) return;
  const heading = group.querySelector('h3');
  const intro = group.querySelector(':scope > p.muted');
  if (heading) heading.textContent = 'Background bill reminders';
  if (intro) intro.textContent = 'Get a push notification the day before an unpaid bill or credit-card payment is due, including any cutoff time you saved.';
  const helper = [...group.querySelectorAll('p.helper')].find((p) => p.textContent.includes('Browser-only'));
  if (helper) helper.textContent = 'Only the item nickname, due schedule, cutoff time, and paid/unpaid month marker are synced for reminders. Balances and payment amounts stay on this device.';

  const oldButton = document.getElementById('enableRemindersButton');
  if (oldButton) {
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);
    button.addEventListener('click', () => budgetPushEnabled() ? budgetPushDisable() : budgetPushEnable());
  }
  const oldTime = document.getElementById('reminderTime');
  if (oldTime) {
    const input = oldTime.cloneNode(true);
    oldTime.replaceWith(input);
    input.addEventListener('change', () => {
      if (typeof v11Prefs === 'function' && typeof v11SavePrefs === 'function') {
        const prefs = v11Prefs();
        prefs.enabled = false;
        prefs.reminderTime = input.value || '09:00';
        v11SavePrefs(prefs);
      }
      budgetPushRefreshUI();
      budgetPushQueueSync();
    });
  }
  if (!document.getElementById('testPushButton')) {
    const row = group.querySelector('.v11-reminder-row');
    row?.insertAdjacentHTML('afterend', '<div class="button-row budget-push-actions"><button class="secondary-button" id="testPushButton" type="button" hidden>Send test notification</button></div>');
    document.getElementById('testPushButton')?.addEventListener('click', budgetPushTest);
  }
  budgetPushDisableLocalFallback();
  budgetPushRefreshUI();
}

const budgetPushBaseSaveState = saveState;
saveState = function saveStateWithPushSync() {
  budgetPushBaseSaveState();
  budgetPushQueueSync();
};

window.budgetPush = {
  enable: budgetPushEnable,
  disable: budgetPushDisable,
  sync: budgetPushSync,
  test: budgetPushTest,
};

budgetPushPrepareUI();
if (budgetPushEnabled()) {
  budgetPushSync({ silent: true }).then(budgetPushRefreshUI).catch((error) => {
    console.warn('Initial push reminder sync failed:', error);
    budgetPushRefreshUI();
  });
}
