// ============================================================
// Token Auto Renewer - Popup Script (Multi-account, Multi-service)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // ----- DOM Elements -----
    const accountListEl = document.getElementById('accountList');
    const addAccountBtn = document.getElementById('addAccountBtn');
    const renewAllBtn = document.getElementById('renewAllBtn');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const logsContainer = document.getElementById('logsContainer');

    // Modal elements
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSaveBtn = document.getElementById('modalSaveBtn');
    const editAccountId = document.getElementById('editAccountId');
    const editLoginType = document.getElementById('editLoginType');
    const editAlias = document.getElementById('editAlias');
    const editAdminUrl = document.getElementById('editAdminUrl');
    const editKbnVersion = document.getElementById('editKbnVersion');
    const kbnVersionGroup = document.getElementById('kbnVersionGroup');
    const editUserName = document.getElementById('editUserName');
    const editPassword = document.getElementById('editPassword');
    const editInterval = document.getElementById('editInterval');
    const editEnabled = document.getElementById('editEnabled');
    const togglePasswordBtn = document.getElementById('togglePassword');

    // Show/hide kbn-version based on login type
    editLoginType.addEventListener('change', () => {
        kbnVersionGroup.style.display = editLoginType.value === 'kibana' ? '' : 'none';
    });

    let accounts = [];

    // ----- Load data -----
    await refreshAll();

    // ----- Toggle password visibility -----
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = editPassword.type === 'password';
        editPassword.type = isPassword ? 'text' : 'password';
        const eyeIcon = document.getElementById('eyeIcon');
        if (isPassword) {
            eyeIcon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      `;
        } else {
            eyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      `;
        }
    });

    // ----- Modal controls -----
    function openModal(account = null) {
        if (account) {
            modalTitle.textContent = '编辑账号';
            editAccountId.value = account.id;
            editLoginType.value = account.loginType || 'dubbo';
            editAlias.value = account.alias || '';
            editAdminUrl.value = account.adminUrl || '';
            editKbnVersion.value = account.kbnVersion || '7.10.2';
            editUserName.value = account.userName || '';
            editPassword.value = account.password || '';
            editInterval.value = account.intervalMinutes || 25;
            editEnabled.checked = account.enabled !== false;
        } else {
            modalTitle.textContent = '添加账号';
            editAccountId.value = '';
            editLoginType.value = 'dubbo';
            editAlias.value = '';
            editAdminUrl.value = '';
            editKbnVersion.value = '7.10.2';
            editUserName.value = '';
            editPassword.value = '';
            editInterval.value = 25;
            editEnabled.checked = true;
        }
        // Reset password field to hidden
        editPassword.type = 'password';
        const eyeIcon = document.getElementById('eyeIcon');
        eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    `;
        kbnVersionGroup.style.display = editLoginType.value === 'kibana' ? '' : 'none';
        modalOverlay.classList.add('show');
    }

    function closeModal() {
        modalOverlay.classList.remove('show');
    }

    addAccountBtn.addEventListener('click', () => openModal());
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // ----- Save account from modal -----
    modalSaveBtn.addEventListener('click', async () => {
        const loginType = editLoginType.value;
        const alias = editAlias.value.trim();
        const url = editAdminUrl.value.trim();
        const kbnVersion = editKbnVersion.value.trim() || '7.10.2';
        const userName = editUserName.value.trim();
        const password = editPassword.value;
        const intervalMinutes = parseInt(editInterval.value, 10) || 25;
        const enabled = editEnabled.checked;

        if (!url) {
            showToast('请输入服务地址', 'error');
            editAdminUrl.focus();
            return;
        }
        if (!userName || !password) {
            showToast('请输入用户名和密码', 'error');
            if (!userName) editUserName.focus();
            else editPassword.focus();
            return;
        }

        const existingId = editAccountId.value;

        if (existingId) {
            // Update existing account
            const idx = accounts.findIndex(a => a.id === existingId);
            if (idx !== -1) {
                accounts[idx].loginType = loginType;
                accounts[idx].alias = alias;
                accounts[idx].adminUrl = url;
                accounts[idx].kbnVersion = kbnVersion;
                accounts[idx].userName = userName;
                accounts[idx].password = password;
                accounts[idx].intervalMinutes = intervalMinutes;
                accounts[idx].enabled = enabled;
            }
        } else {
            // Add new account
            const newAccount = {
                id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
                loginType: loginType,
                alias: alias,
                adminUrl: url,
                kbnVersion: kbnVersion,
                userName: userName,
                password: password,
                intervalMinutes: intervalMinutes,
                enabled: enabled,
                status: { state: 'idle', message: '尚未续期' },
                currentToken: null,
                lastRenewTime: null
            };
            accounts.push(newAccount);
        }

        // Save and setup alarms
        chrome.runtime.sendMessage({ action: 'saveAccounts', accounts }, () => {
            closeModal();
            showToast(existingId ? '账号已更新' : '账号已添加', 'success');
            refreshAll();
        });
    });

    // ----- Renew All -----
    renewAllBtn.addEventListener('click', async () => {
        renewAllBtn.disabled = true;
        renewAllBtn.classList.add('loading');

        chrome.runtime.sendMessage({ action: 'renewAll' }, (result) => {
            renewAllBtn.disabled = false;
            renewAllBtn.classList.remove('loading');

            if (result && result.success) {
                const successCount = result.results.filter(r => r.success).length;
                const totalCount = result.results.length;
                showToast(`续期完成: ${successCount}/${totalCount} 成功`, successCount === totalCount ? 'success' : 'error');
            } else {
                showToast('续期失败', 'error');
            }
            refreshAll();
        });
    });

    // ----- Clear logs -----
    clearLogsBtn.addEventListener('click', async () => {
        await chrome.storage.local.set({ token_renewer_logs: [] });
        refreshAll();
        showToast('日志已清除', 'success');
    });

    // ----- Export config -----
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFileInput = document.getElementById('importFileInput');

    exportBtn.addEventListener('click', () => {
        if (accounts.length === 0) {
            showToast('没有可导出的配置', 'error');
            return;
        }
        // Export only config fields, strip runtime data
        const exportData = accounts.map(a => ({
            loginType: a.loginType || 'dubbo',
            alias: a.alias || '',
            adminUrl: a.adminUrl,
            kbnVersion: a.kbnVersion || '',
            userName: a.userName,
            password: a.password,
            intervalMinutes: a.intervalMinutes || 25,
            enabled: a.enabled !== false
        }));
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `token-renewer-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`已导出 ${exportData.length} 个账号配置`, 'success');
    });

    // ----- Import config -----
    importBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (!Array.isArray(imported)) {
                    showToast('配置文件格式错误：需要数组格式', 'error');
                    return;
                }

                let addedCount = 0;
                for (const item of imported) {
                    if (!item.adminUrl || !item.userName || !item.password) continue;
                    // Check for duplicate by adminUrl + userName
                    const exists = accounts.some(a =>
                        a.adminUrl === item.adminUrl && a.userName === item.userName
                    );
                    if (exists) continue;

                    accounts.push({
                        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
                        loginType: item.loginType || 'dubbo',
                        alias: item.alias || '',
                        adminUrl: item.adminUrl,
                        kbnVersion: item.kbnVersion || '',
                        userName: item.userName,
                        password: item.password,
                        intervalMinutes: item.intervalMinutes || 25,
                        enabled: item.enabled !== false,
                        status: { state: 'idle', message: '尚未续期' },
                        currentToken: null,
                        lastRenewTime: null
                    });
                    addedCount++;
                }

                if (addedCount === 0) {
                    showToast('没有新账号可导入（可能已存在）', 'error');
                } else {
                    chrome.runtime.sendMessage({ action: 'saveAccounts', accounts }, () => {
                        showToast(`成功导入 ${addedCount} 个账号`, 'success');
                        refreshAll();
                    });
                }
            } catch (err) {
                showToast('配置文件解析失败: ' + err.message, 'error');
            }
            // Reset file input so the same file can be re-imported
            importFileInput.value = '';
        };
        reader.readAsText(file);
    });

    // ----- Render account list -----
    function renderAccounts() {
        if (accounts.length === 0) {
            accountListEl.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <p>尚未添加任何账号</p>
          <p class="empty-hint">点击下方「添加账号」开始配置</p>
        </div>
      `;
            return;
        }

        accountListEl.innerHTML = accounts.map(account => {
            const status = account.status || { state: 'idle', message: '尚未续期' };
            const label = getAccountLabel(account);
            const tokenPreview = account.currentToken
                ? account.currentToken.substring(0, 12) + '...'
                : '无';

            return `
        <div class="account-card ${status.state}" data-id="${account.id}">
          <div class="account-header">
            <div class="account-info">
              <span class="status-dot ${status.state}"></span>
              <span class="account-label" title="${escapeHtml(account.adminUrl)}">${escapeHtml(label)}</span>
              <span class="badge badge-type">${(account.loginType || 'dubbo') === 'kibana' ? 'Kibana' : 'Dubbo'}</span>
              ${account.enabled
                    ? '<span class="badge badge-on">已启用</span>'
                    : '<span class="badge badge-off">已关闭</span>'
                }
            </div>
            <div class="account-actions">
              <button class="btn-icon btn-renew" data-id="${account.id}" title="立即续期">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
              <button class="btn-icon btn-edit" data-id="${account.id}" title="编辑">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-icon btn-delete" data-id="${account.id}" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="account-details">
            <span class="detail-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${escapeHtml(account.userName)}
            </span>
            <span class="detail-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${account.intervalMinutes || 25}分钟
            </span>
            <span class="detail-item ${status.state === 'error' ? 'text-error' : ''}">
              ${escapeHtml(status.message)}
            </span>
          </div>
          ${account.lastRenewTime ? `<div class="account-meta">上次续期: ${account.lastRenewTime} · Token: ${tokenPreview}</div>` : ''}
        </div>
      `;
        }).join('');

        // Bind account card actions
        accountListEl.querySelectorAll('.btn-renew').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                btn.classList.add('loading');
                chrome.runtime.sendMessage({ action: 'renewAccount', accountId: id }, (result) => {
                    btn.classList.remove('loading');
                    if (result && result.success) {
                        showToast('续期成功', 'success');
                    } else {
                        showToast(`续期失败: ${result?.error || '未知错误'}`, 'error');
                    }
                    refreshAll();
                });
            });
        });

        accountListEl.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const account = accounts.find(a => a.id === id);
                if (account) openModal(account);
            });
        });

        accountListEl.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const account = accounts.find(a => a.id === id);
                const label = account ? getAccountLabel(account) : id;
                if (confirm(`确定要删除账号「${label}」吗？`)) {
                    chrome.runtime.sendMessage({ action: 'deleteAccount', accountId: id }, () => {
                        accounts = accounts.filter(a => a.id !== id);
                        renderAccounts();
                        showToast('账号已删除', 'success');
                    });
                }
            });
        });
    }

    // ----- Render logs -----
    function renderLogs(logs) {
        if (!logs || logs.length === 0) {
            logsContainer.innerHTML = '<div class="log-empty">暂无日志</div>';
        } else {
            logsContainer.innerHTML = logs.map(log => `
        <div class="log-entry ${log.type || 'info'}">
          <span class="log-time">${log.time}</span>
          <span class="log-message">${escapeHtml(log.message)}</span>
        </div>
      `).join('');
        }
    }

    // ----- Refresh all data -----
    async function refreshAll() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getData' }, (data) => {
                if (data) {
                    accounts = data.accounts || [];
                    renderAccounts();
                    renderLogs(data.logs);
                }
                resolve();
            });
        });
    }

    // ----- Utilities -----
    function getAccountLabel(account) {
        if (account.alias) return account.alias;
        try {
            const url = new URL(account.adminUrl);
            return url.hostname;
        } catch {
            return account.adminUrl || account.id;
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // Auto-refresh every 10 seconds
    setInterval(refreshAll, 10000);
});
