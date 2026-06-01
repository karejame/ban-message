# 🛡️ CyberShield — 交接文档 / Handoff Document

> 如果 Claude 额度用完，下一个会话从这里接着做。

---

## ✅ 已完成的文件

```
src/cyber-shield.user.js    ✅  主入口 + Tampermonkey header + Config 系统
src/core/detector.js        ✅  三层检测引擎（规则/行为/AI）
src/core/scanner.js         ✅  MutationObserver DOM 扫描器 + 模糊遮罩 UI
src/core/blocker.js         ✅  封锁执行器 + domClickBlockStrategy 工具函数
src/core/evidence.js        ✅  取证日志 + 截图 + JSON 导出
src/platforms/index.js      ✅  平台注册中心 + 自动检测
src/platforms/twitter.js    ✅  Twitter/X 适配器
src/platforms/reddit.js     ✅  Reddit 适配器（新版+旧版兼容）
src/platforms/youtube.js    ✅  YouTube 适配器
src/platforms/weibo.js      ✅  微博适配器
src/platforms/bilibili.js   ✅  B站适配器
src/platforms/zhihu.js      ✅  知乎适配器
src/platforms/tieba.js      ✅  贴吧适配器
src/platforms/generic.js    ✅  通用 fallback 适配器
src/rules/en-patterns.json  ✅  英文规则库（hard/soft 关键词 + regex）
src/rules/zh-patterns.json  ✅  中文规则库（硬关键词 + 软词 + regex）
src/ui/panel.js             ✅  浮动控制面板 + 取证 Modal
README.md                   ✅  项目文档
```

---

## ❌ 尚未完成的工作

### 1. 构建系统（优先级：高）
**目标**: 将所有 ES 模块打包成一个 `.user.js` 文件（Tampermonkey 不支持 import）

**需要做的**:
```bash
npm init -y
npm install --save-dev rollup @rollup/plugin-json @rollup/plugin-node-resolve
```

创建 `rollup.config.js`:
```js
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/cyber-shield.user.js',
  output: {
    file: 'dist/cyber-shield.user.js',
    format: 'iife',
    banner: '// ==UserScript==\n// ...（从入口文件复制 header）\n// ==/UserScript==',
  },
  plugins: [json(), resolve()],
};
```

Build 命令: `npx rollup -c`

---

### 2. 主入口 wire-up（优先级：高）
`src/cyber-shield.user.js` 目前只有骨架，需要把真正的模块导入和初始化接起来：

```js
// 在 cyber-shield.user.js 顶部添加：
import { Scanner }          from './core/scanner.js';
import { Panel }            from './ui/panel.js';
import { PlatformRegistry } from './platforms/index.js';

// CyberShield.init() 里改成真正调用：
async init() {
  this.config   = await Config.load();
  this.platform = PlatformRegistry.detect();
  Panel.mount(this.config);
  const scanner = new Scanner(this.platform, this.config);
  scanner.start();
}
```

---

### 3. 规则库扩充（优先级：中）
当前规则库是最小可用集，需要扩充：
- `en-patterns.json`: 补充更多变体拼写（k1ll, $tupid 等绕过写法）
- `zh-patterns.json`: 补充台湾/香港繁体常用骂词、数字谐音（如 2 = 儿 = 二）
- 考虑添加 `tw-patterns.json`（繁中）和 `jp-patterns.json`（日语，未来扩展）

---

### 4. 截图功能接入 Evidence（优先级：中）
`evidence.js` 的 `captureScreenshot()` 已写好，但 `scanner.js` 里的 `_handleToxic()` 还没调用它。

在 `scanner.js` 的 `_handleToxic()` 里加:
```js
// 异步截图，不阻塞主流程
this.evidence.captureScreenshot(el).then(dataUrl => {
  const log = this.evidence.getAll();
  if (log[0]) { log[0].screenshot = dataUrl; this.evidence._save(log); }
}).catch(() => {}); // 截图失败静默处理
```

---

### 5. 当前用户检测（mentionsUser）（优先级：中）
`scanner.js` 里的 `_checkMentionsUser()` 返回 `false`，是 TODO。

每个平台适配器需要实现 `getCurrentUser()`:
```js
// twitter.js 示例:
getCurrentUser() {
  const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img');
  return el?.alt || null;
}
```

然后在 `scanner.js` 的 `_buildContext()` 里使用:
```js
_checkMentionsUser(el) {
  const me = this.platform.getCurrentUser?.();
  if (!me) return false;
  const text = this._extractText(el);
  return text.includes('@' + me);
}
```

---

### 6. Greasy Fork 发布准备（优先级：低，最后做）
- 注册 [Greasy Fork](https://greasyfork.org) 账号
- 确保 `@namespace` 是真实的 GitHub 仓库 URL
- 上传 `dist/cyber-shield.user.js`
- 写英/中双语描述
- 设置 GitHub 仓库: MIT license, issue template for rule contributions

---

## 架构关键约定

| 约定 | 说明 |
|------|------|
| 平台适配器形状 | 见 `src/platforms/index.js` 顶部注释 |
| Detector 返回格式 | `{ verdict, confidence, layer, reason, matched }` |
| Config 存储 | `GM_setValue('cs_config', JSON.stringify(...))` |
| Evidence 存储 | `GM_setValue('cs_evidence_log', JSON.stringify([...]))` |
| GM_addStyle | scanner.js 和 panel.js 各自调用，重复注入无害 |

---

## 下一次会话建议的第一句话

> "继续 CyberShield 项目，请先读 HANDOFF.md，然后完成构建系统（rollup）和主入口 wire-up，让项目可以打包成单文件跑起来。"
