# Agent Guide — Token Auto Renewer

## 项目概述

这是一个 Chrome 浏览器扩展 (Manifest V3)，用于自动定时续期多种 Web 服务的 Token / Session。支持 Dubbo Admin (JWT)、ES Kibana (Cookie Session) 等，支持多账号管理，各服务实例独立配置和续期。

## 核心架构

```
┌─────────────┐    chrome.runtime     ┌──────────────────┐
│  popup.js   │ ◄──── messages ────► │  background.js   │
│ (弹窗 UI)    │                      │ (Service Worker)  │
└─────────────┘                      └──────────────────┘
       │                                    │
       │ chrome.storage.local               │ chrome.alarms
       │ (配置/状态/日志)                     │ (定时触发)
       │                                    │
       ▼                                    ▼
  ┌──────────┐                   ┌───────────────────┐
  │  Storage  │                   │  Service API      │
  │ accounts  │                   │  (Dubbo/Kibana等) │
  │ logs      │                   │                   │
  └──────────┘                   └───────────────────┘
                                         │
                                         │ Token
                                         ▼
                                 ┌───────────────────┐
                                 │ chrome.scripting   │
                                 │ executeScript →    │
                                 │ localStorage.token │
                                 └───────────────────┘
```

## 数据模型

### `token_renewer_accounts` (Array)

```json
{
  "id": "m1abc123",
  "alias": "生产环境",
  "adminUrl": "http://your-host:8080",
  "userName": "admin",
  "password": "your-password",
  "intervalMinutes": 25,
  "enabled": true,
  "status": { "state": "active|error|idle|disabled", "message": "...", "updatedAt": "..." },
  "currentToken": "<jwt-token>",
  "lastRenewTime": "2026/2/19 23:30:00"
}
```

### `token_renewer_logs` (Array)

```json
{
  "time": "2026/2/19 23:30:00",
  "message": "[生产环境] ✅ 续期成功，Token: <jwt-token>...",
  "type": "info|success|error"
}
```

## 关键文件说明

### `background.js` — Service Worker
- **定时管理**：每个账号有独立的 `chrome.alarm`，命名格式 `token-renew-{id}`
- **续期流程**：根据 loginType 调用不同的续期策略（Dubbo: GET 请求获取 JWT；Kibana: POST 请求建立 Session）
- **Token 注入**：`chrome.tabs.query` 找到匹配标签页 → `chrome.scripting.executeScript` 设置 `localStorage.token`
- **消息处理**：监听 popup 发来的 `renewAccount` / `renewAll` / `saveAccounts` / `deleteAccount` / `getData` / `setupAlarms` 等 action

### `popup.js` — 弹窗交互
- **多账号 CRUD**：通过 Modal 弹窗添加/编辑账号
- **导入导出**：导出为 JSON 文件，导入时按 `adminUrl + userName` 去重
- **状态刷新**：10 秒自动刷新 + 操作后即时刷新

### `popup.html` / `popup.css` — UI 层
- 深色 glassmorphism 主题
- 账号卡片带状态指示灯（绿色活跃 / 红色错误 / 黄色禁用）
- Modal 弹窗，Toast 通知

## 开发注意事项

1. **登录接口**：Dubbo Admin 使用 GET + query params，Kibana 使用 POST + JSON body。如需支持新服务类型，在 `background.js` 中添加新的 `renewXxx` 函数并在 `renewTokenForAccount` 中按 `loginType` 分发
2. **Token 注入 key**：当前写入 `localStorage.token` 和 `localStorage.username`（Dubbo），如新服务使用不同的 key，需在对应的 renew 函数中处理
3. **Alarm 最小间隔**：Chrome 限制 `chrome.alarms` 最小周期为 1 分钟
4. **Service Worker 生命周期**：MV3 中 service worker 会在空闲时被挂起，`chrome.alarms` 能在需要时唤醒它
5. **测试方式**：在 `chrome://extensions/` 加载扩展后手动测试，修改后点击刷新按钮

## 常用修改场景

### 修改登录接口路径
编辑 `background.js`，搜索 `/api/dev/user/login`，修改为实际路径。

### 修改请求方式（GET → POST）
编辑 `background.js` 中 `renewTokenForAccount` 函数的 `fetch` 调用，将 `method: 'GET'` 改为 `POST`，并添加 `body`。

### 修改 Token 存储 key
编辑 `background.js` 中 `injectTokenToTabs` 函数内的 `localStorage.setItem('token', tok)` 改为实际 key。

### 添加新的配置字段
1. `popup.html` — 在 Modal 中添加输入框
2. `popup.js` — 在 `openModal` / `modalSaveBtn` click handler 中处理新字段
3. `background.js` — 如需在后台使用则读取新字段
