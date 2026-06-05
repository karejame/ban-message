## 🚀 快速安装指南

CyberShield 项目已经构建完成！下面是立即使用的步骤。

---

### 1️⃣ 安装 Tampermonkey

根据你的浏览器选择对应的版本：

- **Chrome/Edge**: [Tampermonkey Chrome 版](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobblbb)
- **Firefox**: [Tampermonkey Firefox 版](https://addons.mozilla.org/firefox/addon/tampermonkey/)
- **Safari**: [Tampermonkey Safari 版](https://apps.apple.com/us/app/tampermonkey/id1482490089)

安装后会在浏览器右上角看到 TM 图标。

---

### 2️⃣ 安装 CyberShield 脚本

#### **方式 A：从本地文件安装（推荐用于测试）**

1. 打开 Tampermonkey 仪表板（点击浏览器右上角 TM 图标）
2. 点击 **"创建新脚本"** 或 **"Create new script"**
3. 清空默认内容
4. 打开文件：`d:\code\code\program\zwangbao\files\dist\cyber-shield.user.js`
5. 复制**全部内容**到 Tampermonkey 编辑器
6. 按 **Ctrl+S** 保存

#### **方式 B：通过直接链接安装（一键安装）**

如果你将 `dist/cyber-shield.user.js` 上传到 GitHub 或网络服务器，可以生成一个安装链接。

---

### 3️⃣ 验证安装

1. 访问任何支持的平台：
   - 微博：https://weibo.com
   - B站：https://bilibili.com
   - 知乎：https://zhihu.com
   - Twitter：https://twitter.com
   - Reddit：https://reddit.com
   - YouTube：https://youtube.com

2. 向下滚动页面，在右下角应该看到一个 **🛡️ 图标**

3. 点击 🛡️ 图标打开控制面板

---

### 4️⃣ 使用控制面板

```
┌─────────────────────────────┐
│ CyberShield 🛡️             │
├─────────────────────────────┤
│ ☑ Protection               │ ← 启用/禁用保护
│ Sensitivity: [Medium ▼]    │ ← 调整灵敏度
│ ☑ Auto-block               │ ← 自动封锁骚扰者
│ ☐ AI Mode                  │ ← 启用 Claude AI
│ ☑ API Key: [sk-ant-...]    │ ← 输入 API Key
├─────────────────────────────┤
│ [📋 Evidence] [💾 Export]   │ ← 查看/导出取证
└─────────────────────────────┘
```

**配置说明：**

| 配置项 | 说明 |
|--------|------|
| **Protection** | 开启/关闭整个脚本 |
| **Sensitivity** | 检测灵敏度（低/中/高） |
| **Auto-block** | 自动封锁检测到的骚扰者 |
| **AI Mode** | 启用 Claude AI 增强检测（可选） |
| **API Key** | Claude API 密钥（可选） |

---

### 5️⃣ 功能演示

#### **自动模糊**
有毒评论会被自动模糊显示，点击 "Show anyway" 可以查看。

#### **一键取证**
点击 **📋 Evidence** 查看所有检测到的骚扰内容，包括：
- 用户名
- 文本内容
- 判断结果（Toxic / Suspicious）
- 时间戳
- 原始 URL

#### **导出证据**
点击 **💾 Export** 可以导出 JSON 格式的日志，用于向平台举报。

---

### 6️⃣ 配置 AI 检测（可选）

如果想要更精准的检测，可以启用 Claude AI 层：

1. 在 [Anthropic 控制台](https://console.anthropic.com) 注册账号
2. 创建 API Key
3. 在 CyberShield 面板中：
   - ✅ 启用 "AI Mode"
   - 粘贴 API Key 到输入框
4. 完成！从现在开始模糊的内容会由 Claude 进行二次验证

**成本**：极便宜，每条文本约 $0.0003

---

### 📋 支持的平台

| 平台 | 状态 | 备注 |
|------|------|------|
| Twitter / X | ✅ | 支持 twitter.com 和 x.com |
| Reddit | ✅ | 新版和旧版兼容 |
| YouTube | ✅ | 评论检测 |
| 微博 | ✅ | 中文评论优化 |
| B站 | ✅ | 中文评论优化 |
| 知乎 | ✅ | 中文评论优化 |
| 贴吧 | ✅ | 中文评论优化 |
| 其他网站 | ✅ | 通用 DOM 检测器 |

---

### 🛠️ 开发模式（持续开发）

如果你想修改代码并实时查看效果：

```bash
cd d:\code\code\program\zwangbao\files

# 进入监听模式（自动重新构建）
npm run watch

# 然后在 Tampermonkey 中：
# 1. 打开仪表板
# 2. 编辑你的脚本
# 3. 重新复制最新的 dist/cyber-shield.user.js 内容
# 4. 保存并刷新测试页面
```

---

### ⚙️ 高级配置

在 Tampermonkey 中，点击你的脚本 → **存储数据**，可以手动编辑配置：

```json
{
  "enabled": true,
  "sensitivity": "medium",
  "autoBlock": false,
  "aiEnabled": false,
  "apiKey": "",
  "whitelist": ["username1", "username2"],
  "blocklist": []
}
```

---

### 🐛 故障排查

| 问题 | 解决方案 |
|------|--------|
| 看不到 🛡️ 图标 | 刷新页面或检查脚本是否启用 |
| 脚本不工作 | 检查浏览器控制台（F12）看是否有错误 |
| AI 检测不工作 | 确认 API Key 正确且账户有余额 |
| 显示"无模块" | 确保是从 `dist/` 文件夹安装的版本 |

---

### 📊 查看调试日志

打开浏览器开发者工具（**F12** → **Console**），可以看到详细的运行日志：

```
[CyberShield] Initializing on: Weibo 微博
[CyberShield] Scanner started on Weibo 微博
[CyberShield] Detected: @username — verdict: toxic
[CyberShield] Blocked: @username
```

---

### ✅ 完成

现在 CyberShield 已经准备好保护你免受网络骚扰！🛡️

有任何问题，查看浏览器开发者工具中的 Console 标签页来了解更多信息。
