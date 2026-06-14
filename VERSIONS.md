# CyberShield（网暴保护盾）项目复盘

> 撰写时间：2026-06-07  
> 项目类型：Browser Userscript（浏览器用户脚本）  
> 目标平台：Bilibili、Twitter/X  
> 核心技术栈：Vanilla JS、Rollup、GM_api、Shadow DOM、OpenAI-compatible API

--- 

## 目录

1. [项目架构与核心设计](#1-项目架构与核心设计)
2. [AI 语义分析系统（重点）](#2-ai-语义分析系统重点)
3. [Bug 总结（重要）](#3-bug-总结重要)
4. [调试与问题排查方法论](#4-调试与问题排查方法论)
5. [可复用开发模式](#5-可复用开发模式)
6. [测试策略](#6-测试策略)
7. [项目复盘总结](#7-项目复盘总结)

---

## 1. 项目架构与核心设计

### 1.1 三层拦截架构

```
评论内容 → L1 关键词/正则匹配 → L2 行为信号(刷屏/骚扰指纹)
         → L3 AI 语义分析 → 三级墙(拉黑/模糊/标记) + 日志
```

- **L1（硬关键词层）**：同步、零延迟、高精度。匹配立即拦截。
- **L2（行为信号层）**：同步、上下文相关（刷屏指纹、骚扰指纹、上下文窗口）。
- **L3（AI 层）**：异步、批处理、耗额度。处理 L1/L2 无法确定的模糊内容。
- **三级墙**：拉黑（自动 Block）、屏蔽（模糊文本）、标记（SUSPICIOUS 边框）。

### 1.2 模块依赖图

```
cyber-shield.user.js (主入口，config 管理)
  ├── scanner.js (扫描核心，协调所有模块)
  │     ├── detector.js (检测引擎：L1 → L2 → AI 回调)
  │     │     ├── rule-learner.js (规则学习器)
  │     │     ├── memory.js (记忆系统)
  │     │     └── topic-filter.js (话题过滤器)
  │     ├── ai.js (AI 分析器：多供应商适配)
  │     ├── blocker.js (拉黑管理)
  │     ├── evidence.js (取证截图)
  │     ├── context-window.js (上下文窗口)
  │     └── event-bus (事件总线)
  ├── panel.js (UI 面板：配置/日志/统计)
  ├── i18n.js (国际化)
  ├── platforms/
  │     └── bilibili.js (B站适配器)
  └── data/ (关键词/正则模式数据)
```

### 1.3 用户脚本特有约束

1. **`@connect` 白名单**：`GM_xmlhttpRequest` 要求脚本头中 `@connect` 声明目标域名，否则请求被拒绝。`*` 通配符可以兜底但不是所有管理器支持。
2. **`GM_setValue`/`GM_getValue`**：用于持久化，但存储空间有限（约 10MB）。适合配置类数据，不适合大量日志。
3. **`responseType: 'json'` 兼容性**：Tampermonkey 支持但 Violentmonkey 等不支持，应手动 `JSON.parse`。
4. **Shadow DOM 穿透**：`GM_addStyle` 注入的 CSS 无法穿透 Shadow DOM 边界，所有样式必须用内联样式（`element.style.xxx`）。
5. **SPA 导航**：需拦截 `history.pushState`/`replaceState` + `popstate` 事件检测页面变化。

---

## 2. AI 语义分析系统（重点）

### 2.1 架构设计

```
panel.js (配置 UI) → scanner.js (协调层) → ai.js (AI 分析器)
                                                    ↓
                   ┌───────────────────────────────────────┐
                   │  _getAPIConfig()  →  URL / headers     │
                   │  _callAPI()       →  OpenAI / Claude   │
                   │                    / Gemini 格式适配    │
                   │  validateKey()    →  API 密钥验证       │
                   │  getDailyLimit()  → 额度管理           │
                   └───────────────────────────────────────┘
                                                    ↓
                   scanner.js AI 回调 → 规则学习 → 关键词提升
                                     → 话题更新 → 日志 emit
```

### 2.2 多供应商适配（OpenAI 兼容 API）

不同 AI 服务商虽然接口不同，但绝大多数（DeepSeek、GLM、Kimi、MiMo、OpenRouter、OpenAI 原生）都使用 OpenAI 兼容的 `/chat/completions` 格式。仅 Claude 和 Gemini 有独立格式。

#### 2.2.1 OpenAI 兼容格式（覆盖 7/9 的供应商）

```
// 请求格式完全一致
URL:    {base}/chat/completions
Method: POST
Headers: { Authorization: 'Bearer {key}', Content-Type: 'application/json' }
Body:   { model, messages: [{role, content}], max_tokens, temperature }
// 响应格式完全一致
Response: { choices: [{ message: { content } }], usage: { total_tokens } }
```

支持的供应商及端点：

| 供应商 | 端点 | 默认模型 | 备注 |
|--------|------|----------|------|
| DeepSeek | `api.deepseek.com` | deepseek-chat | **注意**：不是 `/v1/chat/completions`，是直接 `/chat/completions` |
| GLM | `open.bigmodel.cn/api/paas/v4` | glm-4-flash | 智谱标准 OpenAI 兼容 |
| Kimi | `api.moonshot.cn/v1` | moonshot-v1-8k | 月之暗面 |
| MiMo | `token-plan-cn.xiaomimimo.com/v1` | mimo-v2-flash | **注意**：域名是 `token-plan-cn` 不是 `api` |
| OpenRouter | `openrouter.ai/api/v1` | openai/gpt-4o-mini | 需要在 header 加 `HTTP-Referer` |
| OpenAI | `api.openai.com/v1` | gpt-4o-mini | 标准 |

#### 2.2.2 Claude 格式（独立）

```
URL:    https://api.anthropic.com/v1/messages
Headers: { 'x-api-key': '{key}', 'anthropic-version': '2023-06-01' }
Body:   { model, system, messages: [{role, content}], max_tokens }
// 响应提取：content[0].text
// Token：input_tokens + output_tokens
```

关键陷阱：Claude 使用 `x-api-key` 头（不是 `Authorization: Bearer`），且必须带 `anthropic-version` 头。

#### 2.2.3 Gemini 格式（独立）

```
URL:    https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
Auth:   URL 参数 ?key={apiKey}（不是 Header）
Body:   { contents: [{ parts: [{text}] }], systemInstruction: { parts: [{text}] } }
// 响应提取：candidates[0].content.parts[0].text
// Token：usageMetadata.promptTokenCount + candidatesTokenCount
```

关键陷阱：API Key 放在 URL 参数而非 Header，body 结构完全不同。

### 2.3 统一适配层（`_getAPIConfig`）

```javascript
_getAPIConfig(customModel) {
  switch (provider) {
    case 'deepseek': case 'mimo': case 'glm': case 'kimi':
    case 'openrouter': case 'openai': case 'custom':
      format = 'openai';
      break;
    case 'claude':
      format = 'claude';
      break;
    case 'gemini':
      format = 'gemini';
      break;
  }
  // 返回 { url, headers, body, responseParser, tokenExtractor }
}
```

### 2.4 AI 自动学习闭环

这是最关键的优化机制——AI 不只是"只读分析"，还会反向升级拦截系统：

```
AI 检测 toxic + 置信度 ≥ 0.85
  → 提取触发模式 (patterns)
  → 写入 config.autoLearnedKeywords (持久化)
  → 刷新 detector.hardKeywords
  → 下次 L1 直接拦截同类内容

AI 检测 toxic + 有 intent (话题分类)
  → 更新 topicFilter 关键词
  → 同一话题下匹配更准
```

**数量限制**：`autoLearnedKeywords` 上限 100 条，自动淘汰旧条目。

### 2.5 Token 统计与额度管理

- `dailyCount`：从 `GM_getValue('cs_ai_daily_usage')` 读取，每次 API 调用 +1
- `dailyLimit`：默认完整模式 200，用户可自定义（面板输入框）
- `_checkDailyLimit()`：超出后降级为本地规则（不调 AI）
- Token 显示：API 响应中 `usage.total_tokens`（OpenAI格式）或 `input_tokens + output_tokens`（Claude格式）

### 2.6 批处理优化（Batch API）

LI 模型支持批处理时，多个文本聚合成一个 API 请求发送，减少请求次数和 Token 消耗：

```javascript
// 攒够 batchSize 条或 timeout 到期后发送
this._queue.push({ text, context, resolve, reject });
clearTimeout(this._batchTimer);
this._batchTimer = setTimeout(() => this._flushBatch(), 300); // 300ms 窗口
```

---

## 3. Bug 总结（重要）

### Bug 分类索引

| 分类 | 数量 | 严重程度 |
|------|------|----------|
| 模块缺失/方法不存在 | 2 个 | 致命（直接崩溃） |
| 事件机制问题 | 2 个 | 高 |
| DOM 操作陷阱 | 3 个 | 高 |
| API 请求/网络 | 3 个 | 高 |
| 配置持久化 | 2 个 | 中 |
| 样式/UI | 2 个 | 低 |

### 3.1 致命 Bug（直接崩溃）

#### B1. `shouldAnalyze()` 方法不存在 → TypeError 崩溃

**现象**：开启 AI 语义分析后，扫描结果完全消失；关闭 AI 后立即恢复。

**根因**：[detector.js](file:///d:/code/code/program/zwangbao/files/src/core/detector.js#L282) 调用 `aiAnalyzer.shouldAnalyze()`，但 `AIAnalyzer` 类从未定义该方法。此调用位于 `_processComment` 的同步路径中，抛出 `TypeError` 后，`for` 循环中断，后续所有评论的处理都停止。

**修复**：在 [ai.js](file:///d:/code/code/program/zwangbao/files/src/core/ai.js#L161-L166) 添加 `shouldAnalyze()` 方法，检查 API Key 和额度。

**教训**：**方法调用的前置检查**——如果 A 模块调用 B 模块的方法，务必确认 B 确实定义了该方法。在跨模块协作时，接口契约（interface contract）必须明确。

**可复用检查清单**：
- [ ] 被调用的方法是否真的存在？
- [ ] 参数数量/类型是否匹配？
- [ ] 返回值是否符合预期类型？

#### B2. `validateKey()` 方法缺失 → Promise 永不 resolve

**现象**：测试密钥按钮一直显示"..."（loading），永远不会返回结果。

**根因**：UI 调用 `aiAnalyzer.validateKey()`，但当时 `AIAnalyzer` 类没有该方法。`await` 永远挂起。

**修复**：添加 `validateKey()` 方法。

**教训**：UI 交互路径上的异步方法缺失，会导致用户界面永久卡死。**Always check that every async function called from UI handlers actually exists before wiring up the button.**

### 3.2 高影响 Bug

#### B3. 解除按钮被批量扫描互相删除

**现象**：多个帖子同时被模糊屏蔽后，只有最后一条有「解除屏蔽」按钮，其他只有模糊效果没有按钮。

**根因**：[`_blurContent`](file:///d:/code/code/program/zwangbao/files/src/core/scanner.js#L1098)（旧版）开头的 `document.querySelectorAll('.cs-reveal-btn').forEach(b => b.remove())` 删除页面上**所有**解除按钮。批量扫描时，N 个元素逐个处理，每个都调一次 `_blurContent`，前 N-1 个的按钮被第 N 次调用删掉。

**修复**：每个目标元素分配唯一 `data-cs-id`（如 `cs-1712345678-a1b2c3`），按钮通过 `data-cs-target` 绑定，删除时只删自己的：

```javascript
document.querySelectorAll(`.cs-reveal-btn[data-cs-target="${csId}"]`).forEach(b => b.remove());
```

**教训**：**永远不要在批量操作的函数中使用全局选择器删除 DOM 元素**。如果多个操作共享同个命名空间，必须给每个元素/按钮分配唯一标识符。

#### B4. 解除后 DOM 重建再次屏蔽（Twitter"显示更多"）

**现象**：点击解除屏蔽 → 点击 Twitter "显示更多"展开全文 → 内容再次被模糊屏蔽。

**根因**：Twitter 的"显示更多"触发 DOM 重建，MutationObserver 检测到新元素，重新扫描。新文本节点没有 `data-cs-revealed` 标记，再次匹配关键词后重新屏蔽。

**修复**：双重保护——
1. **元素级**：`data-cs-revealed="true"` 标记已解除的元素
2. **文本级**：`_revealedTexts` Set 存储已解除文本的哈希值，`_handleToxic` 入口即检查

```javascript
// 文本哈希函数（取前 100 字符）
_textHash(text) {
  const s = text.slice(0, 100).toLowerCase().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash = hash & hash;
  }
  return `h${Math.abs(hash)}`;
}
```

**教训**：**SPA 平台的 DOM 重建是常态**，不能用内存状态依赖 DOM 属性。对于"防止重复处理"的需求，必须同时使用 DOM 标记（短期）和内存 Set（长期/跨 DOM 周期）。

#### B5. `change` vs `input` 事件不同步

**现象**：用户修改 API 端点和模型后直接点击「测试」按钮，配置未同步到 `aiAnalyzer`，始终用旧配置测试。

**根因**：端点和模型输入框监听 `change` 事件，但 `change` 只在**失去焦点**时触发。用户输入后直接点击测试按钮（tab 未离开输入框），`change` 事件不触发，配置未保存。

**修复**：「测试」按钮点击时，先同步读取输入框的值：

```javascript
const endpointInput = el.querySelector('#cs-ai-endpoint');
if (endpointInput) {
  this._config.aiEndpoint = endpointInput.value.trim();
}
this._save();
```

**教训**：**表单验证/同步逻辑不应依赖 `change` 事件，尤其是存在"直接点击提交/测试按钮"的场景**。解决方案：
- 按钮点击时主动读取输入框的最新值（推荐，最小改动）
- 或使用 `input` 事件实时同步（性能开销更大但更即时）

#### B6. `GM_xmlhttpRequest` Promise 永不 resolve

**现象**：某些错误场景下（如 404），测试密钥按钮永久 loading，需要刷新页面。

**根因**：`GM_xmlhttpRequest` 在某些错误（DNS 失败、网络断开等）时不触发 `onload`、`onerror`、`ontimeout` 中的任何一个回调，`await` 永远挂起。

**修复**：使用 `Promise.race` 添加超时保护 + 防重复点击：

```javascript
const result = await Promise.race([
  this._gmFetch(url, options),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 15000))
]);
```

同时 `try/catch/finally` 中重置按钮状态。

**教训**：**浏览器扩展 API 的回调可靠性不能假设**。任何 `GM_*` API 的 Promise 封装都应该加超时保护。这是 defensive programming 的必需品，不是可选优化。

#### B7. 滚动后按钮不恢复

**现象**：向下滚动后解除按钮消失，再滚回来按钮不出现，内容仍被模糊。

**根因**：IntersectionObserver 的回调中，`positionOverlay()` 检查 `getBoundingClientRect()`，如果元素在滚动过程中恰好尺寸为 0（某些 Twitter 行为）或父容器 `overflow: hidden`，按钮显示被抑制。

**修复**：
- 增加 `resize` 事件监听
- 改进 `positionOverlay()` 的视口检测逻辑
- IntersectionObserver `threshold` 改为 `[0, 0.05]` 数组

**教训**：**IntersectionObserver 的回调状态不保证与 `getBoundingClientRect()` 一致**。两个 API 使用不同机制判断可见性，应该互相配合而非互相信任。

### 3.3 API/网络类 Bug

#### B8. 404 错误（端点配置错误）

**现象**：DeepSeek 返回 404，MiMo 返回 404。

**根因**：
- DeepSeek 正确端点：`https://api.deepseek.com/chat/completions`（不是 `/v1/chat/completions`）
- MiMo 正确域名：`token-plan-cn.xiaomimimo.com`（不是 `api.xiaomimimo.com`）

**修复**：逐个验证每个供应商的官方文档，使用正确的端点。

**教训**：**永远不要假设 AI 供应商的端点格式一致**。每个供应商的 API 规范必须查阅官方文档。常见的陷阱：
- 是否带 `/v1` 前缀？
- API Key 在 Header 还是 URL 参数？
- 域名是否与品牌名一致？（如小米的 token plan 域名与品牌名不同）

#### B9. `@connect` 白名单缺失

**现象**：自定义服务商或某些供应商（如 OpenRouter）的 API 请求被静默拒绝。

**根因**：Userscript 管理器按 `@connect` 白名单过滤 `GM_xmlhttpRequest` 的目标域名。不在白名单中的域名请求被拒绝。

**修复**：在脚本头的 `@connect` 中添加 `*` 通配符兜底：

```
// @connect      *
```

**教训**：**Userscript 开发中，`@connect` 白名单是新人最常见的坑**。如果 API 请求无声无息地失败，先检查 `@connect` 是否包含目标域名。

#### B10. `responseType: 'json'` 兼容性

**现象**：某些 Userscript 管理器中，API 响应 `res.response` 返回字符串而非对象，`JSON.parse` 失败。

**根因**：`GM_xmlhttpRequest` 的 `responseType: 'json'` 不是所有管理器都支持。Tampermonkey 支持，Violentmonkey 不支持。

**修复**：移除 `responseType: 'json'`，手动 `JSON.parse`：

```javascript
try {
  return JSON.parse(res.responseText || res.response);
} catch (e) {
  return res.response;
}
```

### 3.4 配置/持久化类 Bug

#### B11. 语言切换后页面刷新重置

**现象**：切换到英文后，跳转页面后脚本界面重置为中文。

**根因**：`i18n.js` 中 `lang` 是模块级变量，页面刷新后从 `navigator.language` 重新检测，丢失用户选择。

**修复**：用 `GM_setValue('cs_lang', lang)` 持久化，初始化时先读取：

```javascript
const savedLang = GM_getValue('cs_lang', '');
this.currentLang = savedLang || (navigator.language.startsWith('zh') ? 'zh' : 'en');
```

#### B12. 记忆系统始终显示 0 条

**现象**：面板状态中"记忆条目"一直显示 0，即使 AI 已检测到 toxic 内容。

**根因**：AI 回调中 `memory.write()` 写入后没有 emit `stats:update` 事件。面板读取的是刷新前的旧统计值。

**修复**：在 `memory.write()` 和 `autoLearnedKeywords` 更新后立即调用：

```javascript
emit('stats:update', this._getStatsPayload());
```

**教训**：**任何异步写入操作后，如果影响 UI 显示的统计数据，必须主动触发 UI 刷新事件**。不要假设 UI 会在下一个周期自动更新。

### 3.5 代码架构问题

#### B13. 全局变量污染

**现象**：`Verdict`、`RiskLevel` 等常量在模块间共享方式不一致——有的用 `import`，有的在全局作用域定义。

**根因**：Userscript 的模块打包（Rollup）与普通 Node 模块不同。`export`/`import` 经过 Rollup 处理后变成 IIFE 包裹，但某些跨模块引用还是走的全局变量。

**教训**：最好是所有模块统一 import/export，避免在全局作用域定义共享常量。对于一个 Rollup 打包的 Userscript，所有代码最终在一个闭包内，模块间的 `import` 是可靠的。

---

## 4. 调试与问题排查方法论

### 4.1 Bug 排查框架（适用于所有项目）

```
遇到问题 → 
  1. 定位表现（什么功能/什么交互/什么条件下出问题）
  2. 收集错误信息（控制台错误/网络请求/UI 表现）
  3. 分析根因（逐层追踪：UI → 事件 → 业务逻辑 → API/网络）
  4. 最小复现（排除干扰因素，确定精确触发条件）
  5. 修复 → 验证 → 回归测试
```

### 4.2 Userscript 特有调试工具

1. **控制台日志**：`console.log('[CyberShield] ...')` 加上统一前缀方便过滤
2. **GM 存储检查**：`GM_listValues()` 查看所有持久化数据
3. **网络请求拦截**：检查 `GM_xmlhttpRequest` 的请求/响应，对比实际 HTTP 响应
4. **DOM 快照**：在控制台 `copy($0.outerHTML)` 导出特定元素的当前 DOM 状态
5. **Shadow DOM 检查**：在 Elements 面板中启用 "Show user agent shadow DOM"

### 4.3 AI 系统调试清单

当 AI 系统不工作时的排查步骤：

```
1. 检查 API Key 是否正确配置（`GM_getValue('cs_config').apiKey`）
2. 检查 @connect 白名单（dist 文件头部是否有所需域名）
3. 检查网络请求（控制台是否有 GM_xmlhttpRequest 错误）
4. 检查每日额度（`GM_getValue('cs_ai_daily_usage')`）
5. 检查 `shouldAnalyze()` → `_checkDailyLimit()` → `_getAPIConfig()` 链路
6. 检查面板 AI 状态显示（连接指示点颜色、Token 统计）
7. 检查 AI 回调是否执行（在 `onAIResult` 中加日志）
8. 检查格式适配是否正确（OpenAI/Claude/Gemini 格式差异）
```

### 4.4 SPA 平台调试技巧

SPA（Twitter/X、Bilibili）是 Userscript 的噩梦，调试要点：

1. **MutationObserver 触发时刻**：记录 DOM 变化的节点类型和目标选择器
2. **Twitter 的 Shadow DOM**：检查 `getRootNode()` 返回的是 `ShadowRoot` 还是 `Document`
3. **"Show more" 展开**：监听 Twitter 的展开事件后的 DOM 变化
4. **SPA 导航**：拦截 `pushState`/`replaceState` + `popstate` 事件

---

## 5. 可复用开发模式

### 5.1 三层检测架构（通用设计模式）

```
Layer 1: Sync + Cheap (关键词/正则匹配)
Layer 2: Sync + Moderate (行为分析/上下文)
Layer 3: Async + Expensive (AI/ML 分析)
```

优点：
- L1 零延迟，拦截 80% 的简单违规
- L3 只有模糊内容才触发，节省 API 费用
- 各层独立，可单独优化/替换

**适用场景**：内容审核、垃圾评论过滤、内容推荐系统中的多级排序。

### 5.2 多供应商 AI 适配模式

```
统一接口 (_getAPIConfig)
  → 供应商特定适配 (openai/claude/gemini)
  → 统一返回 { url, headers, body, responseParser, tokenExtractor }
```

适配器的核心思想：将差异封装在内部，对外暴露统一接口。新增供应商时只需添加一个 `case`。

### 5.3 Event Bus 模式（解耦模块）

```javascript
const events = {};
function on(name, fn) { (events[name] ||= []).push(fn); }
function emit(name, data) { (events[name] || []).forEach(fn => fn(data)); }
```

将 scanner、panel、detector 等模块之间的通信解耦。模块不再直接引用彼此方法，而是通过事件通信。

**项目中使用的关键事件**：
- `scan:result` — 扫描结果 → 面板日志
- `scan:progress` — 扫描进度更新
- `stats:update` — 统计数据更新 → 面板状态
- `config:updated` — 配置变更 → 各模块同步

### 5.4 Promise 超时保护包装器

```javascript
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ]);
}
```

**项目中使用场景**：
- `GM_xmlhttpRequest` 在某些错误下不触发回调
- AI API 调用可能因网络慢而无限等待
- 测试按钮需要明确失败反馈

### 5.5 Config 自动同步模式

```javascript
// 1. 面板修改 → save → emit config:updated
this._config.aiEndpoint = value;
this._save();
emit('config:updated', { type: 'aiEndpoint' });

// 2. 监听方自动同步
on('config:updated', (data) => {
  if (data.type === 'aiEndpoint' || data.type === 'aiModel') {
    scanner.updateAIConfig({ aiEndpoint: config.aiEndpoint, aiModel: config.aiModel });
  }
});
```

### 5.6 唯一 ID 分配模式（防批量冲突）

在批量操作中，每个操作对象分配唯一 ID：

```javascript
if (!element.dataset.csId) {
  element.dataset.csId = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

然后用 `[data-cs-id="xxx"]` 选择器精确定位相关元素/按钮，避免全局选择器的误伤。

### 5.7 SPA 导航检测模式

```javascript
// 拦截 SPA 路由变化
const origPushState = history.pushState;
history.pushState = function(...args) {
  origPushState.apply(this, args);
  checkAndRescan(); // 自定义重新扫描逻辑
};
window.addEventListener('popstate', checkAndRescan);
```

### 5.8 Shadow DOM 穿透模式

```javascript
// 递归查询 Shadow DOM
function deepQuerySelector(root, selector) {
  let el = root.querySelector(selector);
  if (el) return el;
  for (const child of root.querySelectorAll('*')) {
    if (child.shadowRoot) {
      el = deepQuerySelector(child.shadowRoot, selector);
      if (el) return el;
    }
  }
  return null;
}
```

---

## 6. 测试策略

### 6.1 测试方法

由于本项目是 Userscript，难以使用单元测试框架（Jest/Mocha）。主要依赖：

1. **手动功能测试**：在目标平台上安装构建后的 `.user.js` 文件，切换不同配置验证
2. **控制台断言**：关键路径加 `console.assert()`：
   ```javascript
   console.assert(result.verdict === Verdict.TOXIC, 'Expected toxic for keyword match');
   ```
3. **构建验证**：`npm run build` 确保无 Rollup 编译错误
4. **配置持久化测试**：修改配置后刷新页面，验证配置是否保持

### 6.2 AI 系统测试步骤

```
1. ✅ API Key 验证（测试按钮返回成功/失败）
2. ✅ 连接状态指示（绿色/红色指示点）
3. ✅ Token 统计显示（调用后数字更新）
4. ✅ 每日额度显示（调用后 dailyCount 递增）
5. ✅ 额度耗尽降级（超出后 AI 不再调用）
6. ✅ 扫描日志显示（L3 AI 标签出现）
7. ✅ 规则自动学习（AI 检测后检测器的 hardKeywords 有新增）
8. ✅ 话题自动更新（AI 检测后 topicFilter 关键词有新增）
```

### 6.3 回归测试清单

每次修改后应验证的核心功能：

1. **扫描功能**：启停扫描、手动/自动扫描
2. **检测功能**：关键词命中、正则命中、AI 分析
3. **屏蔽效果**：文本模糊、解除按钮、再次屏蔽
4. **拉黑功能**：用户拉黑、取消拉黑
5. **配置持久化**：修改后刷新页面
6. **语言切换**：中英文切换后跳转页面
7. **面板 UI**：功能栏、日志、统计、关于
8. **AI 配置**：不同供应商切换、端点修改、Key 测试

---

## 7. 项目复盘总结

### 7.1 关键经验

1. **Userscript 不是 Web 应用**——`GM_*` API 的怪异行为、Shadow DOM、CSP 限制是日常挑战，需要大量防御性编程。
2. **AI 供应商集成总是比看起来复杂**——使用者以为"加个 API Key 就能用"，但新用户准入涉及端点配置、格式适配、配额管理、错误处理、可视化反馈。
3. **三层架构的关键在于解耦**——L1/L2/L3 之间不互相依赖，每层可以独立开启/关闭/优化。
4. **用户反馈循环是产品护城河**——AI 不只是分析，还要反向优化规则（自动学习关键词/话题），才能持续提升拦截率、减少误杀。
5. **批量操作的 DOM 安全需要预见性设计**——批量扫描 + 批量 UI 更新是 Bug 高发区，必须从一开始就使用唯一 ID + 定向选择器。

### 7.2 如果重做这个项目

1. **从一开始就使用唯一 ID 模式**——避免批量操作互相覆盖
2. **更早引入 Event Bus 模式**——模块间通信更清晰
3. **AI 适配层要有完善的错误分类**——区分"Key 无效"、"额度不足"、"网络错误"、"格式错误"
4. **添加更多的配置迁移测试**——版本升级时配置格式变化的兼容性
5. **从 v1 就添加 `@connect *` 兜底**——避免不断添加新域名的维护成本

### 7.3 项目架构演进路径

```
v1: L1 关键词 + 面板 → v2: L2 行为信号 + B站适配
  → v3: L3 AI 分析 + Claude → v4: 多供应商 + 自动学习
  → v5: 话题过滤 + 上下文窗口 → v6: Twitter 适配 + Shadow DOM 穿透
  → v7: 规则系统 + 记忆系统 + 取证
```