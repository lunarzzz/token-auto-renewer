// ============================================================
// Token Auto Renewer - Background Service Worker
// Multi-account, multi-service support
// ============================================================

const ALARM_PREFIX = 'token-renew-';
const STORAGE_KEYS = {
  accounts: 'token_renewer_accounts', // Array of account configs
  logs: 'token_renewer_logs'
};

const MAX_LOG_ENTRIES = 100;

// ----- Logging -----

async function addLog(message, type = 'info', accountLabel = '') {
  const { [STORAGE_KEYS.logs]: logs = [] } = await chrome.storage.local.get(STORAGE_KEYS.logs);
  const prefix = accountLabel ? `[${accountLabel}] ` : '';
  const entry = {
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    message: prefix + message,
    type
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOG_ENTRIES) logs.length = MAX_LOG_ENTRIES;
  await chrome.storage.local.set({ [STORAGE_KEYS.logs]: logs });
}

// ----- Helpers -----

function getAlarmName(accountId) {
  return ALARM_PREFIX + accountId;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function getAccountLabel(account) {
  if (account.alias) return account.alias;
  try {
    const url = new URL(account.adminUrl);
    return url.hostname;
  } catch {
    return account.adminUrl || account.id;
  }
}

// ----- Account Storage -----

async function getAccounts() {
  const { [STORAGE_KEYS.accounts]: accounts = [] } = await chrome.storage.local.get(STORAGE_KEYS.accounts);
  return accounts;
}

async function saveAccounts(accounts) {
  await chrome.storage.local.set({ [STORAGE_KEYS.accounts]: accounts });
}

async function getAccountById(id) {
  const accounts = await getAccounts();
  return accounts.find(a => a.id === id) || null;
}

async function updateAccountStatus(id, state, message) {
  const accounts = await getAccounts();
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return;
  accounts[idx].status = {
    state,
    message,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false })
  };
  await saveAccounts(accounts);
}

async function updateAccountToken(id, token) {
  const accounts = await getAccounts();
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) return;
  accounts[idx].currentToken = token;
  accounts[idx].lastRenewTime = new Date().toLocaleString('zh-CN', { hour12: false });
  await saveAccounts(accounts);
}

// ----- Token Renewal -----

async function renewTokenForAccount(accountId) {
  const account = await getAccountById(accountId);

  if (!account || !account.adminUrl || !account.userName || !account.password) {
    await updateAccountStatus(accountId, 'error', '配置不完整');
    await addLog('续期失败：配置不完整', 'error', getAccountLabel(account || { id: accountId }));
    return { success: false, error: '配置不完整' };
  }

  const loginType = account.loginType || 'dubbo';
  const label = getAccountLabel(account);

  try {
    if (loginType === 'kibana') {
      return await renewKibana(account, label);
    } else {
      return await renewDubbo(account, label);
    }
  } catch (error) {
    const errorMsg = error.message || '未知错误';
    await updateAccountStatus(account.id, 'error', `续期失败: ${errorMsg}`);
    await addLog(`❌ 续期失败: ${errorMsg}`, 'error', label);
    return { success: false, error: errorMsg };
  }
}

// ----- Dubbo Admin Login Strategy -----

async function renewDubbo(account, label) {
  const baseUrl = `${account.adminUrl.replace(/\/+$/, '')}/api/dev/user/login`;
  const loginUrl = `${baseUrl}?userName=${encodeURIComponent(account.userName)}&password=${encodeURIComponent(account.password)}`;

  await addLog(`正在请求: ${baseUrl}`, 'info', label);

  const response = await fetch(loginUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json, text/plain, */*' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const text = (await response.text()).trim();

  let token = null;
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') token = data;
    else if (data && data.token) token = data.token;
    else if (data && data.data) token = typeof data.data === 'string' ? data.data : data.data.token;
  } catch {
    token = text;
  }

  if (!token) {
    throw new Error('响应中未找到 Token: ' + text.substring(0, 200));
  }

  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  await updateAccountStatus(account.id, 'active', `续期成功 (${now})`);
  await updateAccountToken(account.id, token);
  await addLog(`✅ 续期成功，Token: ${token.substring(0, 20)}...`, 'success', label);

  await injectTokenToTabs(account.adminUrl, token, account.userName);
  return { success: true, token };
}

// ----- ES Kibana Login -----

async function renewKibana(account, label) {
  const baseUrl = account.adminUrl.replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/internal/security/login`;

  await addLog(`正在请求: ${loginUrl}`, 'info', label);

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'kbn-version': account.kbnVersion || '7.10.2',
      'Accept': '*/*'
    },
    credentials: 'include',
    body: JSON.stringify({
      providerType: 'basic',
      providerName: 'basic',
      currentURL: `${baseUrl}/login?next=%2Fapp%2Fdev_tools`,
      params: {
        username: account.userName,
        password: account.password
      }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${response.statusText} ${text.substring(0, 100)}`);
  }

  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  await updateAccountStatus(account.id, 'active', `续期成功 (${now})`);
  await updateAccountToken(account.id, 'session-cookie');
  await addLog(`✅ Kibana 登录续期成功 (Cookie Session)`, 'success', label);

  return { success: true, token: 'session-cookie' };
}
// ----- Token Injection into Tabs -----

async function injectTokenToTabs(adminUrl, token, userName) {
  try {
    // Extract origin from adminUrl to match tabs
    const urlObj = new URL(adminUrl);
    const origin = urlObj.origin; // e.g. "http://your-host:8080"

    // Find all tabs matching this service instance
    const tabs = await chrome.tabs.query({ url: origin + '/*' });

    if (tabs.length === 0) {
      // No tab open now — token will be auto-injected when the tab loads
      return;
    }

    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (tok, user) => {
            localStorage.setItem('token', tok);
            if (user) localStorage.setItem('username', user);
          },
          args: [token, userName]
        });
        await addLog(`💉 已注入 Token 到标签页: ${tab.title || tab.url}`, 'success');
      } catch (e) {
        await addLog(`⚠️ 注入标签页失败 (${tab.id}): ${e.message}`, 'error');
      }
    }
  } catch (e) {
    await addLog(`⚠️ 注入流程异常: ${e.message}`, 'error');
  }
}

// ----- Alarm Management -----

async function setupAlarmForAccount(account) {
  const alarmName = getAlarmName(account.id);
  await chrome.alarms.clear(alarmName);

  if (!account.enabled) {
    await updateAccountStatus(account.id, 'disabled', '自动续期已关闭');
    await addLog('自动续期已关闭', 'info', getAccountLabel(account));
    return;
  }

  const intervalMinutes = account.intervalMinutes || 25;

  await chrome.alarms.create(alarmName, {
    delayInMinutes: 0.1,
    periodInMinutes: intervalMinutes
  });

  await updateAccountStatus(account.id, 'active', `每 ${intervalMinutes} 分钟自动续期`);
  await addLog(`⏰ 已设置每 ${intervalMinutes} 分钟自动续期`, 'info', getAccountLabel(account));
}

async function setupAllAlarms() {
  // Clear all existing token-renew alarms
  const allAlarms = await chrome.alarms.getAll();
  for (const alarm of allAlarms) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  const accounts = await getAccounts();
  for (const account of accounts) {
    if (account.enabled) {
      await setupAlarmForAccount(account);
    }
  }
}

// ----- Event Listeners -----

// Handle alarm trigger
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    const accountId = alarm.name.substring(ALARM_PREFIX.length);
    const account = await getAccountById(accountId);
    if (account) {
      await addLog('⏰ 定时触发续期...', 'info', getAccountLabel(account));
      await renewTokenForAccount(accountId);
    }
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'renewAccount') {
    renewTokenForAccount(message.accountId).then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'renewAll') {
    (async () => {
      const accounts = await getAccounts();
      const results = [];
      for (const account of accounts) {
        if (account.enabled) {
          const result = await renewTokenForAccount(account.id);
          results.push({ id: account.id, ...result });
        }
      }
      sendResponse({ success: true, results });
    })();
    return true;
  }

  if (message.action === 'saveAccounts') {
    (async () => {
      await saveAccounts(message.accounts);
      await setupAllAlarms();
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'deleteAccount') {
    (async () => {
      const accounts = await getAccounts();
      const filtered = accounts.filter(a => a.id !== message.accountId);
      await chrome.alarms.clear(getAlarmName(message.accountId));
      await saveAccounts(filtered);
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.action === 'setupAlarms') {
    setupAllAlarms().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getData') {
    (async () => {
      const accounts = await getAccounts();
      const { [STORAGE_KEYS.logs]: logs = [] } = await chrome.storage.local.get(STORAGE_KEYS.logs);
      sendResponse({ accounts, logs });
    })();
    return true;
  }
});

// On extension install / update
chrome.runtime.onInstalled.addListener(async () => {
  await addLog('🚀 插件已安装/更新');
  await setupAllAlarms();
});

// On browser startup
chrome.runtime.onStartup.addListener(async () => {
  await addLog('🔄 浏览器启动，恢复定时续期');
  await setupAllAlarms();
});

// Auto-inject token when a matching service tab loads
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const accounts = await getAccounts();
  for (const account of accounts) {
    if (!account.currentToken || !account.adminUrl) continue;

    try {
      const origin = new URL(account.adminUrl).origin;
      if (tab.url.startsWith(origin)) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (tok, user) => {
            localStorage.setItem('token', tok);
            if (user) localStorage.setItem('username', user);
          },
          args: [account.currentToken, account.userName]
        });
        await addLog(`💉 标签页加载时自动注入 Token`, 'success', getAccountLabel(account));
        break; // One account per origin
      }
    } catch { /* ignore tabs we can't access */ }
  }
});
