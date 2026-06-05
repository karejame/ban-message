# CyberShield 扩展开发文档 v2.1

> 策略调整：先交付可安装、可使用的 MVP，AI 功能作为独立后期模块。

---

## 当前实现状态

| 模块 | 文件 | 状态 | 备注 |
|------|------|------|------|
| 三层检测引擎 | `detector.js` | ✅ | Layer1/2 可用，Layer3 暂冻结 |
| DOM 扫描器 | `scanner.js` | ✅ | MutationObserver + Shadow DOM |
| 封锁执行器 | `blocker.js` | ✅ | 三级降级框架已建 |
| 取证系统 | `evidence.js` | ✅ | 截图 + JSON 导出 |
| 控制面板 | `panel.js` | ✅ | 中英双语，双页 UI |
| 平台适配 | `platforms/` | ⚠️ | B站完整，其余仅通知 |
| 构建系统 | — | ❌ | 尚无 rollup，无法打包 |
| 远程词库 | — | ❌ | 词库仍打包在脚本内 |
| AI 功能 | `ai.js` | 🔒 | 接口已通，MVP 阶段冻结 |

---

## MVP 范围定义

**MVP = 不依赖 AI、能安装、能检测、能屏蔽、能记录。**

用户安装后应能得到：
- Layer 1 关键词检测 + Layer 2 行为信号检测
- 毒性内容自动模糊，可点击展开
- 至少 3 个平台真正能自动拉黑（B站已完成，再补 2 个）
- 取证面板可查看、可导出
- 词库可远程更新，无需重装脚本

AI 功能（谐音识别、规则学习、批处理队列）**全部推迟到 MVP 稳定后**。

---

## MVP 分阶段计划

### Phase 0 — 构建系统（先决条件）

没有构建系统，所有代码都跑不起来。这是第一个必须完成的事。

**任务清单：**

```bash
npm init -y
npm install --save-dev rollup @rollup/plugin-json @rollup/plugin-node-resolve
```

创建 `rollup.config.js`：
```js
import json    from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import fs      from 'fs';

const header = fs.readFileSync('./src/header.js', 'utf8'); // Tampermonkey 注释头

export default {
  input:  'src/cyber-shield.user.js',
  output: {
    file:   'dist/cyber-shield.user.js',
    format: 'iife',
    banner: header,
  },
  plugins: [json(), resolve()],
};
```

`package.json` 加入脚本：
```json
"scripts": {
  "build": "rollup -c",
  "dev":   "rollup -c --watch"
}
```

完成主入口 wire-up（`src/cyber-shield.user.js` 真正 import 所有模块）：
```js
import { RuleManager } from './core/rule-manager.js';
import { Detector }    from './core/detector.js';
import { Scanner }     from './core/scanner.js';
import { Panel }       from './ui/panel.js';
import { PlatformRegistry } from './platforms/index.js';

async function init() {
  const config   = await Config.load();
  const rules    = await RuleManager.init();       // 加载词库
  const detector = new Detector(rules, config);
  const platform = PlatformRegistry.detect();
  Panel.mount(config);
  new Scanner(platform, detector, config).start();
}

window.addEventListener('load', init);
```

**完成标准：** `npm run build` 成功，安装后控制台打印平台名，面板可打开。

---

### Phase 1 — 检测流水线跑通

**任务清单：**

**1. MutationObserver 节流（必须，否则直播弹幕会卡死页面）**
```js
let rafPending = false;
observer = new MutationObserver(() => {
  if (rafPending) return;
  rafPending = true;
  requestIdleCallback(() => {
    _flushPendingNodes();
    rafPending = false;
  }, { timeout: 500 });
});
```

**2. 验证 Layer 1 中英文关键词匹配**
- 测试用例：硬关键词（应命中）、谐音词（应漏过，MVP 阶段预期行为）、正常词（不应误杀）

**3. 验证 Layer 2 行为信号**
- 全大写超过 60% + 长度 > 10 → suspicious
- 3 个以上感叹号/问号 → suspicious
- 2 个以上攻击性 emoji 组合 → suspicious

**4. 模糊遮罩 UI**
- toxic → 模糊 + 遮罩 + 「显示内容」按钮
- suspicious → 仅加橙色虚线边框，不模糊
- 「显示内容」点击后该条内容加入本次会话白名单，不再触发

**5. 接通 mentionsUser 检测**

每个平台适配器补充 `getCurrentUser()` 方法：
```js
// twitter.js
getCurrentUser() {
  const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img');
  return el?.getAttribute('alt') || null;
},
```
scanner.js 的 `_checkMentionsUser()` 改为真正调用此方法。

**完成标准：** 在 Twitter 和 B站手动输入一条含硬关键词的评论，5 秒内被模糊，面板取证列表有记录。

---

### Phase 2 — 词库独立

词库打包进脚本是个长期隐患，Phase 2 彻底解决。

**新增模块 `src/core/rule-manager.js`：**

```js
// 三个词库来源，优先级从高到低
const SOURCES = {
  user:   'cs_rules_user',    // GM_setValue key
  remote: 'cs_rules_remote',  // GM_setValue key
  seed:   SEED_RULES,         // 内置，构建时打包，约 200 条
};

// 远程地址，双 URL 降级（GitHub raw → jsDelivr CDN）
const REMOTE_URLS = {
  zh: [
    'https://raw.githubusercontent.com/YOUR/cyber-shield/main/rules/zh-patterns.json',
    'https://cdn.jsdelivr.net/gh/YOUR/cyber-shield@main/rules/zh-patterns.json',
  ],
  en: [
    'https://raw.githubusercontent.com/YOUR/cyber-shield/main/rules/en-patterns.json',
    'https://cdn.jsdelivr.net/gh/YOUR/cyber-shield@main/rules/en-patterns.json',
  ],
};

export const RuleManager = {
  async init() {
    await this._updateIfStale();   // 距上次更新 > 24h 才拉取
    return this.getMerged();
  },

  getMerged() {
    // 合并顺序：seed → remote → user（后者覆盖前者）
    // 返回供 Detector 使用的规则对象
  },

  async _updateIfStale() {
    const last = GM_getValue('cs_rules_updated_at', 0);
    if (Date.now() - last < 24 * 3600 * 1000) return;
    await this._fetchRemote();
  },

  async _fetchRemote() {
    // 遍历 REMOTE_URLS，第一个成功就停止
    for (const url of REMOTE_URLS.zh) {
      try {
        const data = await gmFetch(url);  // GM_xmlhttpRequest Promise 封装
        GM_setValue('cs_rules_remote', JSON.stringify(data));
        GM_setValue('cs_rules_updated_at', Date.now());
        return;
      } catch { continue; }
    }
    // 全部失败：静默降级，继续用上次缓存
  },

  addUserRule(keyword) { /* 写入 cs_rules_user，重新编译 */ },
  removeUserRule(keyword) { /* 同上 */ },
};
```

**Detector 改造：** `compileRegex()` 接受合并后的规则对象，不再直接 import JSON 文件。

**完成标准：** 修改 GitHub 上的 `zh-patterns.json` 增加一条新词，24 小时内（或手动触发更新后）本地词库包含该词。

---

### Phase 3 — 平台拉黑完善

目标：从「通知用户手动操作」升级为「真正自动拉黑」。

**优先级（按可行性排序）：**

| 平台 | 方案 | 关键点 |
|------|------|--------|
| B站 | ✅ 已完成 | 维持 `/x/relation/modify` |
| Reddit | `POST /api/block_user` | 从页面提取 `modhash` token |
| 微博 | `/friendships/blocks/create` | 从 cookie 提取 `SUB` token |
| Twitter/X | DOM 模拟（暂时） | API 需 OAuth，复杂度高，推后 |
| 知乎/贴吧 | DOM 模拟 | API 不开放，DOM 是唯一选项 |

**auth token 提取原则：** 不存储 token，每次使用前从当前页面实时读取（cookie 或页面内嵌 JSON）。token 仅用于拉黑操作，不用于其他用途。

**每个 blockStrategy 的结构：**
```js
async blockStrategy(username, sourceElement) {
  // 尝试 1：API
  const token = extractToken();
  if (token) {
    const ok = await apiBlock(username, token);
    if (ok) return;
  }
  // 尝试 2：DOM 模拟
  const done = domBlock(sourceElement);
  if (done) return;
  // 尝试 3：通知用户
  GM_notification({ title: '🛡️ CyberShield', text: `请手动拉黑 @${username}` });
},
```

**完成标准：** Reddit 和微博实现 API 自动拉黑，成功率 > 90%（网络正常情况下）。

---

### Phase 4 — MVP 收尾

**取证功能完整化：**
- `_handleToxic()` 接入截图（当前 captureScreenshot 已写好但未调用）
- 截图异步执行，失败时静默跳过（不影响主流程）

```js
_handleToxic(el, text, username, result) {
  this._blurElement(el, result);
  this.evidence.log({ text, username, result, url: location.href, timestamp: Date.now() });
  // 截图异步，不阻塞
  this.evidence.captureScreenshot(el)
    .then(dataUrl => this.evidence.attachScreenshot(dataUrl))
    .catch(() => {}); // 静默失败
  if (this.config.autoBlock && username) {
    this.blocker.block(username, el);
  }
},
```

**面板 About 页补充隐私声明：**
```
所有数据（取证日志、用户规则）仅存储在本地浏览器，不上传任何服务器。
```

**完成标准（MVP 整体）：**
- [ ] `npm run build` 成功
- [ ] Twitter、B站、Reddit、微博 四平台验证可用
- [ ] 模糊/展开/取证/拉黑 功能全部端到端跑通
- [ ] 词库远程更新正常
- [ ] 不依赖任何外部 AI 服务独立运行

---

## 暂冻结的 AI 功能（MVP 稳定后再做）

以下内容从当前文档移除，等 MVP 发布后单独立项：

- `rule-learner.js` — AI 判断结果沉淀为本地规则
- `ai.js` 批处理队列 — 攒够 N 条再发送
- 每日 token 用量上限控制
- 三档 AI 模式（关闭/省钱/完整）
- 谐音/变体专用 Prompt 工程
- 上下文敏感规则自动生成

---

## 模块依赖关系（MVP 版）

```
cyber-shield.user.js
  ├── rule-manager.js   ← 种子词 + 远程词库 + 用户规则 → 合并
  │     └── detector.js ← 消费合并规则，编译 RegExp，执行 L1/L2
  ├── scanner.js        ← 驱动检测，调用 detector
  │     ├── blocker.js  ← 三级降级拉黑
  │     └── evidence.js ← 截图 + 日志
  └── panel.js          ← 读写 config，展示 evidence
```

```
数据流（MVP）：
  新评论 → scanner 提取文本
         → detector L1 关键词匹配（~3ms）
         → [miss] detector L2 行为信号
         → [toxic]  → blur DOM + evidence.log + blocker.block
         → [suspicious] → 加警告边框 + evidence.log
         → [safe]   → 跳过
```

---

## 性能预算

| 操作 | 目标 | 备注 |
|------|------|------|
| Layer 1 匹配 | < 5ms / 1000条 | 单一 RegExp，当前 ~3ms |
| Layer 2 分析 | < 2ms / 单条 | 纯计算，无 IO |
| DOM 模糊操作 | < 1ms / 元素 | CSS filter，可忽略 |
| MutationObserver | 不阻塞主线程 | 必须用 requestIdleCallback 节流 |
| 远程词库拉取 | 后台异步 | 不影响页面加载，失败静默降级 |

---

## 工程原则

**MVP 优先，功能够用就发布。** 能跑的 70 分比完美的 0 分更有价值。

**快路径优先。** Layer 1 拦截 90%+ 内容，Layer 2 处理剩余边界情况。每个优化先看快路径。

**三级降级。** 每个功能路径都有 fallback，永远不静默崩溃。

**上下文敏感优于简单黑名单。** 触发词 + 周边负面信号组合判断，宁可漏检也不误杀。

**远程分发优于内置打包。** 词库独立于脚本，更新规则不要求用户重装。

**数据本地化。** 所有数据存本地 `GM_setValue`，不上传任何服务器。

**给用户控制权。** 灵敏度、自动拉黑全部可配置，用户决定工具边界。
