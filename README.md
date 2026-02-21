# Token Auto Renewer

<p align="center">
  <img src="icons/icon128.png" alt="Logo" width="80">
</p>

<p align="center">
  <strong>自动续期 Token / Session 的 Chrome 浏览器扩展</strong>
</p>

<p align="center">
  多服务支持 · 多账号管理 · 定时续期 · Token 自动注入 · 配置导入导出
</p>

---

## ✨ 功能特性

- 🔄 **自动续期** — 基于 `chrome.alarms` 定时调用服务登录接口，自动获取新 Token / Session
- 👥 **多账号支持** — 可同时管理多个服务实例（生产/测试/预发布等），各自独立续期
- 💉 **Token 自动注入** — 续期成功后，自动将 Token 写入对应标签页的 `localStorage`，无需手动刷新登录
- 🏷️ **别名管理** — 为每个账号设置别名，方便快速识别
- 📦 **配置导入/导出** — 支持将账号配置导出为 JSON 文件，方便备份和团队共享
- 📋 **运行日志** — 详细记录每次续期的结果和时间，便于排查问题
- 🎨 **深色主题 UI** — 精致的深色 glassmorphism 设计

## 📦 安装

### 方式一：开发者模式加载（推荐）

1. 克隆或下载本项目：
   ```bash
   git clone <repo-url>
   ```

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`

3. 打开右上角的 **「开发者模式」** 开关

4. 点击 **「加载已解压的扩展程序」**

5. 选择本项目的根目录（包含 `manifest.json` 的目录）

6. 插件图标出现在工具栏中 ✅

> **Edge 浏览器**：步骤相同，地址改为 `edge://extensions/`

## 🚀 使用方法

### 1. 添加账号

点击工具栏中的插件图标 → 点击 **「+ 添加账号」** → 填写以下信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| 别名 | 可选，方便识别 | `生产环境` |
| 服务地址 | 完整 URL（含端口） | `http://your-host:8080` |
| 用户名 | 登录用户名 | `admin` |
| 密码 | 登录密码 | `your-password` |
| 续期间隔 | 分钟，默认 25 | `25` |
| 启用自动续期 | 开关 | ✅ |

### 2. 续期操作

- **自动续期**：保存配置后自动在后台定时运行
- **手动续期**：点击账号卡片右侧的 🔄 按钮可单独续期
- **全部续期**：点击 **「全部续期」** 按钮一键刷新所有账号的 Token

### 3. 配置管理

- **导出配置**：点击 **「导出配置」** 下载 JSON 文件（不含运行时数据）
- **导入配置**：点击 **「导入配置」** 选择 JSON 文件，自动去重导入

导出文件格式：
```json
[
  {
    "alias": "生产环境",
    "adminUrl": "http://your-host:8080",
    "userName": "admin",
    "password": "your-password",
    "intervalMinutes": 25,
    "enabled": true
  }
]
```

## 📁 项目结构

```
token-auto-renewer/
├── manifest.json       # Chrome Extension Manifest V3 配置
├── background.js       # Service Worker（定时续期 + Token 注入核心）
├── popup.html          # 弹窗界面
├── popup.css           # 深色主题样式
├── popup.js            # 弹窗交互逻辑（多账号 CRUD / 导入导出）
├── icons/
│   ├── icon.svg        # 矢量图标源文件
│   ├── icon16.png      # 16x16 图标
│   ├── icon48.png      # 48x48 图标
│   └── icon128.png     # 128x128 图标
└── README.md
```

## ⚙️ 技术方案

| 模块 | 技术 |
|------|------|
| 定时触发 | `chrome.alarms` API |
| 登录请求 | `GET /api/dev/user/login?userName=***&password=***` |
| Token 注入 | `chrome.scripting.executeScript` → `localStorage.setItem('token', ...)` |
| 配置存储 | `chrome.storage.local` |
| 标签页匹配 | `chrome.tabs.query({ url: origin + '/*' })` |

### 权限说明

| 权限 | 用途 |
|------|------|
| `alarms` | 创建定时任务 |
| `storage` | 存储账号配置和日志 |
| `scripting` | 向目标服务标签页注入 Token |
| `tabs` | 查找匹配的标签页 |
| `<all_urls>` | 允许跨域请求服务登录接口 |

## ⚠️ 注意事项

- **安全提醒**：用户名和密码存储在浏览器本地 (`chrome.storage.local`)，请勿在公共设备上使用
- **登录接口**：Dubbo Admin 默认调用 `GET /api/dev/user/login`，Kibana 使用 `POST /internal/security/login`，如需支持其他服务可在 `background.js` 中扩展
- **Token 存储**：Dubbo Admin 前端将 JWT 存储在 `localStorage.token` 和 `localStorage.username` 中，Kibana 使用 Cookie Session
- **更新插件**：修改代码后在 `chrome://extensions/` 页面点击插件的刷新按钮即可生效

## 📄 License

MIT
