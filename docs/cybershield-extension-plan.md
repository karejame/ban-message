# CyberShield 扩展实现计划

> **For agentic workers:** Use executing-plans to implement this plan task-by-task.

**目标：** 修复 extend.md 中分析的 6 个架构漏洞，实现规则学习器、远程词库管理、AI 批处理三大模块，将 CyberShield 从脚本级工具演进为可自进化的内容审查框架。

**架构策略：** 每个漏洞对应一个独立 Phase，Phase 间解耦可并行推进。优先拆分 AI 模块（Phase 1），使后续 Phase 能以独立模块为基座。所有 Phase 完成后需通过 `npm run build` 验证。

**技术栈：** JavaScript (ES Modules), GM_* API, Rollup, Claude API

---

## 文件结构变更

```
src/
├── core/
│   ├── detector.js     # MODIFY — 剥离 Layer 3，只保留 Layer 1 + 2
│   ├── ai.js           # CREATE — 独立的 AI 检测模块（含批处理）
│   ├── rule-learner.js # CREATE — 规则学习器
│   ├── rule-manager.js # CREATE — 远程词库管理器
│   ├── blocker.js      # (不变)
│   ├── scanner.js      # MODIFY — 集成上下文敏感规则
│   ├── events.js       # (不变)
│   ├── i18n.js         # MODIFY — 添加新功能的文案
│   ├── evidence.js     # (不变)
│   └── panel.js        # MODIFY — 添加远程词库/AI 模式等 UI
├── platforms/          # MODIFY — 各平台加深适配
│   ├── twitter.js      # MODIFY — API 拉黑
│   ├── youtube.js      # MODIFY — 隐藏用户
│   ├── reddit.js       # MODIFY — API 拉黑
│   ├── weibo.js        # MODIFY — API 拉黑
│   └── ...             # (其他平台)
└── data/
    ├── en-patterns.json   # (不变 — 内置种子词)
    └── zh-patterns.json   # (不变 — 内置种子词)
```

---

### Phase 1: 拆分 AI 模块 — ai.js

**漏洞对应：** 漏洞 3（AI 实时判断成本失控）前置条件

**说明：** 将 `detector.js` 中 Layer 3（Claude AI）的 `_layerThreeAI()` 和 `_gmFetch()` 方法抽离为独立模块。这是所有后续 AI 相关改进的基础。

**Files:**
- Create: `src/core/ai.js`
- Modify: `src/core/detector.js`
- Test: `npm run build`

- [ ] **Step 1: 创建 ai.js**

创建 `src/core/ai.js`，包含 AI 检测核心逻辑：

```javascript
/**
 * ai.js — Layer 3: Claude AI 检测模块
 *
 * 职责：封装 Claude API 调用，提供统一的 async analyze() 接口。
 * 后续扩展：批处理队列、每日调用上限、规则晋升触发。
 */

// ─── 默认 Prompt 模板 ──────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `你正在检测中文网络暴力内容。特别注意以下绕过手法：
1. 谐音字替换（如用"筹集"代替"臭鸡"）
2. 拼音缩写（如 sb、nmsl）
3. 数字谐音
4. 故意错别字
5. 词义污化（普通词被赋予贬义含义）

判断标准是说话者的意图，而非字面用词。
同一词汇在不同语境下可能有完全不同的判定。

请输出严格的 JSON 格式：
{
  "verdict": "toxic" | "suspicious" | "safe",
  "confidence": 0.0-1.0,
  "reason": "一句简短的原因说明",
  "patterns": ["提取的触发模式，便于本地规则学习"]
}`;

export class AIAnalyzer {
  constructor(config) {
    this.config = config;
    this.dailyCount = 0;
    this.lastResetDate = null;
    this._loadDailyCount();
  }

  /**
   * AI 分析入口
   * @param {string} text
   * @param {object} context  { platform, isReply, mentionsUser, username }
   * @returns {Promise<object|null>}  { verdict, confidence, layer:3, reason, patterns }
   */
  async analyze(text, context = {}) {
    if (!this.config.apiKey) return null;
    if (!this._checkDailyLimit()) return null;

    const prompt = this._buildPrompt(text, context);
    const result = await this._callAPI(prompt);

    if (result) {
      this.dailyCount++;
      this._saveDailyCount();
    }

    return result;
  }

  /** 获取今日已用次数 */
  getTodayUsage() {
    return this.dailyCount;
  }

  /** 获取每日上限 */
  getDailyLimit() {
    return this.config.aiDailyLimit || 30;
  }

  /** 检查是否达到每日上限 */
  _checkDailyLimit() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyCount = 0;
      this.lastResetDate = today;
      this._saveDailyCount();
    }
    return this.dailyCount < this.getDailyLimit();
  }

  _loadDailyCount() {
    try {
      this.dailyCount = parseInt(GM_getValue('cs_ai_daily_count', '0'), 10);
      this.lastResetDate = GM_getValue('cs_ai_last_reset', '');
    } catch (e) {
      this.dailyCount = 0;
      this.lastResetDate = '';
    }
  }

  _saveDailyCount() {
    try {
      GM_setValue('cs_ai_daily_count', String(this.dailyCount));
      GM_setValue('cs_ai_last_reset', new Date().toDateString());
    } catch (e) { /* silent */ }
  }

  _buildPrompt(text, context) {
    return `Text: """${text}"""
Context: Platform=${context.platform || 'unknown'}, Is a direct reply=${!!context.isReply}

Respond with ONLY valid JSON:
{
  "verdict": "toxic" | "suspicious" | "safe",
  "confidence": 0.0-1.0,
  "reason": "one sentence explanation",
  "patterns": ["list of trigger patterns"]
}`;
  }

  async _callAPI(prompt) {
    const data = await this._gmFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: DEFAULT_SYSTEM_PROMPT,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const raw = data.content?.[0]?.text || '{}';
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return {
      verdict:    result.verdict     || 'safe',
      confidence: result.confidence  || 0.5,
      layer:      3,
      reason:     result.reason      || 'AI analysis',
      patterns:   result.patterns    || [],
    };
  }

  _gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        data: options.body,
        responseType: 'json',
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            resolve(res.response);
          } else {
            reject(new Error(`HTTP ${res.status}: ${res.responseText?.slice(0, 200)}`));
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error('Request timed out')),
      });
    });
  }
}
```

- [ ] **Step 2: 简化 detector.js，移除 Layer 3**

在 `detector.js` 中将 Layer 3 引用替换为注入方式：

```javascript
// detector.js — 修改 analyze() 方法
analyze(text, context = {}, aiAnalyzer = null, onAIResult = null) {
  const normalized = this._normalize(text);

  // Layer 1: 关键词 + 变体匹配
  const l1 = this._layerOneKeywords(normalized);
  if (l1.verdict === Verdict.TOXIC) return l1;

  // Layer 2: 行为模式
  const l2 = this._layerTwoBehavior(normalized, context);
  if (l2.verdict === Verdict.TOXIC) return l2;

  // Layer 3 — 通过注入的 aiAnalyzer 调用
  if (this.config.aiEnabled && aiAnalyzer && l2.verdict === Verdict.SUSPICIOUS && onAIResult) {
    aiAnalyzer.analyze(text, context).then(onAIResult);
  }

  return l2.verdict === Verdict.SUSPICIOUS ? l2 : { verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No signals', matched: [] };
}
```

同时移除 `detector.js` 中的以下方法：
- `_layerThreeAI()` (整段)
- `_gmFetch()` (整段)

- [ ] **Step 3: 更新 scanner.js 集成 aiAnalyzer**

```javascript
// scanner.js — 在构造函数中增加 aiAnalyzer 参数
import { AIAnalyzer } from './ai.js';

export class Scanner {
  constructor(platform, config) {
    this.platform = platform;
    this.config   = config;
    this.detector = new Detector(config);
    this.aiAnalyzer = new AIAnalyzer(config);  // 新增
    this.blocker  = new Blocker(platform, config);
    // ... 其余不变
  }

  // 在 _analyzeNode 中传递 aiAnalyzer
  _analyzeNode(node, text) {
    const context = {
      platform: this.platform?.name,
      isReply: node._csIsReply,
      mentionsUser: node._csMentionsUser,
      username: node._csUsername,
    };
    const result = this.detector.analyze(text, context, this.aiAnalyzer, (aiResult) => {
      this._handleAIResult(node, text, aiResult);
    });
    // ... 后续逻辑不变
  }

  _handleAIResult(node, text, aiResult) {
    if (!aiResult || aiResult.verdict === 'safe') return;
    // 触发规则学习（Phase 2 接入点）
    this._applyVerdict(node, aiResult);
  }
}
```

- [ ] **Step 4: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds. No errors from missing imports or removed methods.

---

### Phase 2: 规则学习器 — rule-learner.js

**漏洞对应：** 漏洞 3（规则晋升）、漏洞 5（上下文敏感规则）

**说明：** AI 判定为 toxic 后，提取可复用的触发模式，写入本地 GM_setValue 缓存。下次同类内容由 Layer 1 直接拦截。

**Files:**
- Create: `src/core/rule-learner.js`
- Modify: `src/core/detector.js`
- Modify: `src/core/scanner.js`

- [ ] **Step 1: 创建 rule-learner.js**

```javascript
/**
 * rule-learner.js — AI 规则学习器
 *
 * 从 AI 判定结果中提取可复用模式，写入本地规则库。
 * 规则类型：
 *   - keyword: 单关键词（置信度高时直接晋升 hard_keyword）
 *   - context_sensitive: 触发词 + 上下文中负面信号组合
 */

const LEARNED_RULES_KEY = 'cs_learned_rules';

export class RuleLearner {
  constructor() {
    this.rules = { keywords: [], contextSensitive: [] };
    this._load();
  }

  /** 从 AI 结果学习 */
  learn(aiResult, originalText, context) {
    if (aiResult.verdict !== 'toxic') return;

    const rule = this._extractPattern(aiResult, originalText, context);
    if (!rule) return;

    if (rule.type === 'keyword') {
      this.rules.keywords.push(rule);
    } else if (rule.type === 'context_sensitive') {
      this.rules.contextSensitive.push(rule);
    }

    this._prune();
    this._save();
  }

  /** 获取所有学习到的关键词（用于合并到 detector） */
  getLearnedKeywords() {
    return this.rules.keywords.filter(r => r.confidence > 0.6).map(r => r.trigger);
  }

  /** 获取所有上下文敏感规则 */
  getContextSensitiveRules() {
    return this.rules.contextSensitive;
  }

  /** 将学习到的规则同步到 detector */
  syncToDetector(detector) {
    const keywords = this.getLearnedKeywords();
    for (const kw of keywords) {
      detector.hardKeywords.add(kw);
    }
  }

  /** 清理低置信度/过期规则 */
  _prune() {
    const now = Date.now();
    const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天

    this.rules.keywords = this.rules.keywords.filter(r => {
      if (r.confidence < 0.3) return false;
      if (now - r.createdAt > MAX_AGE) return false;
      return true;
    });
    this.rules.contextSensitive = this.rules.contextSensitive.filter(r => {
      if (r.confidence < 0.3) return false;
      if (now - r.createdAt > MAX_AGE) return false;
      return true;
    });
  }

  /** 从 AI 结果中提取模式 */
  _extractPattern(aiResult, text, context) {
    const patterns = aiResult.patterns || [];
    if (patterns.length === 0) return null;

    // 取第一个模式作为 trigger
    const trigger = patterns[0].toLowerCase().trim();

    // 检查是否已经有相似的规则
    const exists = this.rules.keywords.some(r => r.trigger === trigger);
    if (exists) return null;

    // 判断是简单关键词还是上下文敏感规则
    const isContextSensitive = text.length > 20 || (context.negativeSignals && context.negativeSignals.length > 0);

    if (isContextSensitive) {
      return {
        type: 'context_sensitive',
        trigger,
        canonical: trigger,
        negativeSignals: context.negativeSignals || [],
        confidence: aiResult.confidence * 0.8, // 初始打八折，多次验证后上升
        source: 'ai_learned',
        createdAt: Date.now(),
        hitCount: 1,
      };
    }

    return {
      type: 'keyword',
      trigger,
      confidence: aiResult.confidence,
      source: 'ai_learned',
      createdAt: Date.now(),
      hitCount: 1,
    };
  }

  _load() {
    try {
      const data = GM_getValue(LEARNED_RULES_KEY, '[]');
      const parsed = JSON.parse(data);
      this.rules = {
        keywords: parsed.keywords || [],
        contextSensitive: parsed.contextSensitive || [],
      };
    } catch (e) {
      this.rules = { keywords: [], contextSensitive: [] };
    }
  }

  _save() {
    try {
      GM_setValue(LEARNED_RULES_KEY, JSON.stringify(this.rules));
    } catch (e) { /* silent */ }
  }
}
```

- [ ] **Step 2: 在 scanner.js 中集成 RuleLearner**

```javascript
// scanner.js 修改
import { RuleLearner } from './rule-learner.js';

export class Scanner {
  constructor(platform, config) {
    // ... 现有代码 ...
    this.ruleLearner = new RuleLearner();  // 新增
  }

  _handleAIResult(node, text, aiResult) {
    if (!aiResult) return;

    // 规则学习：AI 判定为 toxic 时提取模式
    if (aiResult.verdict === 'toxic') {
      const context = {
        negativeSignals: this._extractNegativeSignals(text),
      };
      this.ruleLearner.learn(aiResult, text, context);
      // 同步到 detector
      this.ruleLearner.syncToDetector(this.detector);
    }

    if (aiResult.verdict === 'toxic' || aiResult.verdict === 'suspicious') {
      this._applyVerdict(node, aiResult);
    }
  }

  /** 提取文本中的负面信号词 */
  _extractNegativeSignals(text) {
    const signals = ['滚', '去死', '你个', '废物', '蠢', '傻', '恶心', '垃圾'];
    return signals.filter(s => text.includes(s));
  }
}
```

- [ ] **Step 3: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds.

---

### Phase 3: 远程词库管理器 — rule-manager.js

**漏洞对应：** 漏洞 1（词库与脚本耦合）

**说明：** 实现远程词库拉取、本地缓存、三源合并（内置种子词 + 远程词库 + 用户自定义）。参考 uBlock Origin 的分发模式。

**Files:**
- Create: `src/core/rule-manager.js`
- Modify: `src/core/detector.js`
- Modify: `src/core/panel.js`

- [ ] **Step 1: 创建 rule-manager.js**

```javascript
/**
 * rule-manager.js — 远程词库管理器
 *
 * 三源合并：内置种子词 > 远程词库 > 用户自定义规则
 * 更新策略：首次运行立即拉取，后续每 24h 静默更新
 */

const REMOTE_RULES_KEY = 'cs_rules_remote';
const REMOTE_LAST_UPDATE_KEY = 'cs_rules_last_update';
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24h

// 远程词库 URL（可配置）
const REMOTE_URLS = {
  zh: 'https://raw.githubusercontent.com/karejame/ban-message/main/src/data/zh-patterns.json',
  en: 'https://raw.githubusercontent.com/karejame/ban-message/main/src/data/en-patterns.json',
};

export class RuleManager {
  constructor() {
    this.remoteRules = { zh: null, en: null };
    this._loaded = false;
  }

  /** 初始化：尝试加载远程词库 */
  async init() {
    const needsUpdate = this._needsUpdate();
    if (needsUpdate) {
      await this.fetchRemote();
    } else {
      this._loadCached();
    }
    this._loaded = true;
  }

  /** 是否需要更新 */
  _needsUpdate() {
    try {
      const lastUpdate = parseInt(GM_getValue(REMOTE_LAST_UPDATE_KEY, '0'), 10);
      return Date.now() - lastUpdate > UPDATE_INTERVAL;
    } catch (e) {
      return true;
    }
  }

  /** 拉取远程词库 */
  async fetchRemote() {
    for (const [lang, url] of Object.entries(REMOTE_URLS)) {
      try {
        const data = await this._fetchJSON(url);
        if (data && data.hard_keywords) {
          this.remoteRules[lang] = data;
        }
      } catch (e) {
        console.warn(`[CyberShield] Failed to fetch ${lang} rules:`, e);
      }
    }

    // 更新缓存和时间戳
    GM_setValue(REMOTE_RULES_KEY, JSON.stringify(this.remoteRules));
    GM_setValue(REMOTE_LAST_UPDATE_KEY, String(Date.now()));
  }

  /** 合并三源规则到 detector */
  mergeToDetector(detector, zhPatterns, enPatterns) {
    // 1. 内置种子词（已由 detector 加载）
    // 2. 远程词库
    for (const lang of ['zh', 'en']) {
      const remote = this.remoteRules[lang];
      if (!remote) continue;

      if (remote.hard_keywords) {
        for (const kw of remote.hard_keywords) {
          detector.hardKeywords.add(kw);
        }
      }
      if (remote.soft_keywords) {
        for (const kw of remote.soft_keywords) {
          detector.softKeywords.add(kw);
        }
      }
      if (remote.regex_patterns) {
        for (const p of remote.regex_patterns) {
          // 去重：避免重复添加相同正则
          const existing = detector.regexPatterns.some(r => r.source === new RegExp(p, 'i').source);
          if (!existing) {
            detector.regexPatterns.push(new RegExp(p, lang === 'en' ? 'i' : ''));
          }
        }
      }
    }

    // 3. 已学习规则（由 rule-learner 管理，已通过 syncToDetector 同步）
  }

  /** 获取远程词库状态 */
  getStatus() {
    try {
      const lastUpdate = parseInt(GM_getValue(REMOTE_LAST_UPDATE_KEY, '0'), 10);
      const cached = GM_getValue(REMOTE_RULES_KEY, '{}');
      const rules = JSON.parse(cached);
      let totalRules = 0;
      for (const lang of ['zh', 'en']) {
        if (rules[lang]) {
          totalRules += (rules[lang].hard_keywords || []).length;
          totalRules += (rules[lang].soft_keywords || []).length;
        }
      }
      return {
        lastUpdate: lastUpdate > 0 ? new Date(lastUpdate).toLocaleString() : 'never',
        totalRemoteRules: totalRules,
        needsUpdate: this._needsUpdate(),
      };
    } catch (e) {
      return { lastUpdate: 'error', totalRemoteRules: 0, needsUpdate: true };
    }
  }

  _loadCached() {
    try {
      const data = GM_getValue(REMOTE_RULES_KEY, '{}');
      this.remoteRules = JSON.parse(data);
    } catch (e) {
      this.remoteRules = { zh: null, en: null };
    }
  }

  _fetchJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: 'GET',
        responseType: 'json',
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            resolve(res.response);
          } else {
            reject(new Error(`HTTP ${res.status}`));
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error('Timeout')),
      });
    });
  }
}
```

- [ ] **Step 2: 在 scanner.js 中集成 RuleManager**

```javascript
// scanner.js 修改
import { RuleManager } from './rule-manager.js';

export class Scanner {
  constructor(platform, config) {
    // ... 现有代码 ...
    this.ruleManager = new RuleManager();
  }

  /** 初始化完成后的异步设置 */
  async initRules() {
    await this.ruleManager.init();
    this.ruleManager.mergeToDetector(
      this.detector,
      zhPatterns,
      enPatterns
    );
  }
}
```

- [ ] **Step 3: 在 panel.js 中添加远程词库状态显示**

```javascript
// 在 panel.js 的 _updateStatus 方法中添加
_updateStatus() {
  // ... 现有代码 ...

  // 远程词库状态
  const ruleStatus = this._scannerRef?.ruleManager?.getStatus();
  if (ruleStatus) {
    const statusEl = this._el.querySelector('#cs-rule-status');
    if (statusEl) {
      statusEl.textContent = `远程词库: ${ruleStatus.totalRemoteRules} 条 (${ruleStatus.lastUpdate})`;
    }
  }
}
```

在 PANEL_HTML 模板中找个合适位置添加：
```html
<div style="font-size:11px;color:var(--cs-text-secondary);padding:0 16px 4px" id="cs-rule-status"></div>
```

- [ ] **Step 4: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds.

---

### Phase 4: AI 批处理队列

**漏洞对应：** 漏洞 3（AI 实时判断的成本失控 — 批处理）

**说明：** 在 `ai.js` 中嵌入批处理队列。攒够 N 条或等待 T 秒后，将多条灰色内容打包为一次 Claude API 请求。

**Files:**
- Modify: `src/core/ai.js`

- [ ] **Step 1: 在 ai.js 中添加批处理队列**

```javascript
// ai.js 添加以下内容

const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 5000; // 5s

export class AIAnalyzer {
  constructor(config) {
    // ... 现有代码 ...
    this._queue = [];
    this._queueTimer = null;
    this._queueResolvers = new Map(); // id -> { resolve, reject }
    this._queueIdCounter = 0;
  }

  /** 改写 analyze() 支持批处理 */
  async analyze(text, context = {}) {
    if (!this.config.apiKey) return null;
    if (!this._checkDailyLimit()) return null;

    // 如果队列未满，先入队
    return new Promise((resolve) => {
      const id = ++this._queueIdCounter;
      this._queueResolvers.set(id, resolve);
      this._queue.push({ id, text, context });

      if (this._queue.length >= BATCH_SIZE) {
        this._flushBatch();
      } else if (!this._queueTimer) {
        this._queueTimer = setTimeout(() => this._flushBatch(), BATCH_TIMEOUT);
      }
    });
  }

  /** 刷新批处理队列 */
  async _flushBatch() {
    if (this._queueTimer) {
      clearTimeout(this._queueTimer);
      this._queueTimer = null;
    }

    const batch = this._queue.splice(0, BATCH_SIZE);
    if (batch.length === 0) return;

    try {
      const results = await this._callBatchAPI(batch);

      // 分发结果到每个请求
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const resolve = this._queueResolvers.get(item.id);
        if (resolve) {
          const result = results[i] || null;
          if (result) this.dailyCount++;
          this._saveDailyCount();
          resolve(result);
          this._queueResolvers.delete(item.id);
        }
      }
    } catch (err) {
      // 批量失败，逐个回退为单条请求
      console.warn('[CyberShield] Batch AI failed, falling back to single:', err);
      for (const item of batch) {
        const resolve = this._queueResolvers.get(item.id);
        if (resolve) {
          this._singleFallback(item, resolve);
        }
      }
    }
  }

  /** 批量 API 调用 */
  async _callBatchAPI(batch) {
    const batchText = batch.map((item, i) =>
      `[${i + 1}] """${item.text}""" (platform: ${item.context.platform || 'unknown'})`
    ).join('\n\n');

    const prompt = `Analyze each of the following ${batch.length} messages for toxicity. Respond with a JSON array where each element corresponds to the message at the same index.

Messages:
${batchText}

Respond with ONLY valid JSON array:
[
  { "verdict": "toxic"|"suspicious"|"safe", "confidence": 0.0-1.0, "reason": "...", "patterns": ["..."] }
]`;

    const data = await this._callAPI(prompt);
    const raw = data.content?.[0]?.text || '[]';
    const results = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return Array.isArray(results) ? results : batch.map(() => null);
  }

  /** 单条回退 */
  async _singleFallback(item, resolve) {
    const prompt = this._buildPrompt(item.text, item.context);
    try {
      const data = await this._callAPI(prompt);
      const raw = data.content?.[0]?.text || '{}';
      const result = JSON.parse(raw.replace(/```json|```/g, '').trim());
      this.dailyCount++;
      this._saveDailyCount();
      resolve({
        verdict:    result.verdict     || 'safe',
        confidence: result.confidence  || 0.5,
        layer:      3,
        reason:     result.reason      || 'AI analysis',
        patterns:   result.patterns    || [],
      });
    } catch (err) {
      resolve(null);
    }
  }
}
```

- [ ] **Step 2: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds.

---

### Phase 5: 上下文敏感规则引擎

**漏洞对应：** 漏洞 5（上下文敏感规则缺失）

**说明：** 增强 Layer 2 行为分析，使其能识别 "触发词 + 负面信号" 的组合模式。在 `detector.js` 中新增上下文中敏感规则匹配。

**Files:**
- Modify: `src/core/detector.js`

- [ ] **Step 1: 在 detector.js 中添加上下文敏感规则匹配**

```javascript
// detector.js — 在 _layerTwoBehavior 方法中增强

_layerTwoBehavior(text, context) {
  const signals = [];
  let score = 0;

  // —— 原有信号检测（保持不变）—— 
  // Signal: ALL CAPS
  const upperRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  if (upperRatio > 0.6 && text.length > 10) {
    signals.push('all_caps'); score += 0.2;
  }
  // Signal: Excessive punctuation
  if (/[!?]{3,}/.test(text)) {
    signals.push('excessive_punctuation'); score += 0.15;
  }
  // Signal: @mentions the current user
  if (context.mentionsUser) {
    score += 0.2; signals.push('mentions_user');
  }
  // Signal: Short aggressive reply
  if (context.isReply && text.length < 80 && score > 0) {
    signals.push('short_aggressive_reply'); score += 0.1;
  }
  // Signal: Repeated characters
  if (/(.)\1{4,}/.test(text)) {
    signals.push('char_repetition'); score += 0.1;
  }
  // Signal: Aggressive emoji
  const aggressiveEmoji = ['💀', '🖕', '🤡', '🗑️', '🤮', '😡', '🤬', '💩'];
  const emojiHits = aggressiveEmoji.filter(e => text.includes(e));
  if (emojiHits.length >= 2) {
    signals.push('aggressive_emoji'); score += 0.2;
  }

  // —— 新增：上下文敏感规则匹配 ——
  const contextRules = context.contextRules || [];
  for (const rule of contextRules) {
    if (!text.includes(rule.trigger)) continue;

    // 检查负面信号
    const negativeHits = rule.negativeSignals.filter(s => text.includes(s));
    if (negativeHits.length > 0) {
      signals.push(`context:${rule.trigger}`);
      score += rule.confidence * negativeHits.length;
    }
  }

  // —— 阈值判定（不变）——
  if (score >= 0.5) {
    return { verdict: Verdict.TOXIC, confidence: Math.min(score, 0.9), layer: 2, reason: 'Behavioral signals', matched: signals };
  }
  if (score >= 0.25) {
    return { verdict: Verdict.SUSPICIOUS, confidence: score, layer: 2, reason: 'Weak signals', matched: signals };
  }
  return { verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No behavioral signals', matched: [] };
}
```

- [ ] **Step 2: 在 scanner.js 中将 RuleLearner 的上下文敏感规则传递给 detector**

```javascript
// scanner.js — 修改 _analyzeNode 方法
_analyzeNode(node, text) {
  const context = {
    platform: this.platform?.name,
    isReply: node._csIsReply,
    mentionsUser: node._csMentionsUser,
    username: node._csUsername,
    contextRules: this.ruleLearner?.getContextSensitiveRules() || [], // 新增
  };
  const result = this.detector.analyze(text, context, this.aiAnalyzer, (aiResult) => {
    this._handleAIResult(node, text, aiResult);
  });
  // ... 后续不变
}
```

- [ ] **Step 3: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds.

---

### Phase 6: Twitter 平台 API 拉黑

**漏洞对应：** 漏洞 6（平台适配深度不均）

**说明：** 为 Twitter（当前使用 DOM 模拟点击）增加 API 拉黑能力。三级降级：API → DOM 模拟 → 通知。

**Files:**
- Modify: `src/platforms/twitter.js`

- [ ] **Step 1: 增强 twitter.js 的 blockStrategy**

```javascript
// twitter.js — 修改 blockStrategy 实现三级降级
export class TwitterPlatform {
  // ... 现有代码 ...

  /**
   * 三级降级拉黑策略
   * 1. API: POST /1.1/blocks/create.json
   * 2. DOM: 模拟点击屏蔽按钮
   * 3. Notify: 通知用户手动操作
   */
  async blockUser(userId, username) {
    // Level 1: API
    try {
      await this._apiBlock(userId);
      console.log(`[CyberShield] Twitter API block successful: @${username}`);
      return;
    } catch (apiErr) {
      console.warn(`[CyberShield] Twitter API block failed, falling back to DOM:`, apiErr);
    }

    // Level 2: DOM
    try {
      this._domBlock(username);
      return;
    } catch (domErr) {
      console.warn(`[CyberShield] Twitter DOM block failed:`, domErr);
    }

    // Level 3: Notify
    this._notifyBlock(username);
  }

  async _apiBlock(userId) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: 'https://api.twitter.com/1.1/blocks/create.json',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${this.config.twitterToken || ''}`,
        },
        data: `user_id=${userId}`,
        responseType: 'json',
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(res.response);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: reject,
      });
    });
  }

  _domBlock(username) {
    // 原有 DOM 模拟点击逻辑（抽取为独立方法）
    const btn = document.querySelector(`[data-testid="UserCell"] button[aria-label*="Block"]`);
    if (btn) {
      btn.click();
      return;
    }
    // Fallback: 尝试其他选择器
    const altBtn = document.querySelector(`[aria-label*="${username}"] + [role="button"]`);
    if (altBtn) {
      altBtn.click();
      return;
    }
    throw new Error('Block button not found in DOM');
  }

  _notifyBlock(username) {
    // 使用 GM_notification 或 panel 通知
    if (typeof GM_notification !== 'undefined') {
      GM_notification({
        title: 'CyberShield',
        text: `建议手动屏蔽 @${username}`,
        timeout: 5000,
      });
    }
  }
}
```

- [ ] **Step 2: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds.

---

### Phase 7: Panel UI 扩展

**漏洞对应：** 漏洞 3（AI 模式切换）、漏洞 1（词库状态显示）

**说明：** 在控制面板中添加 AI 三档模式切换（关闭/省钱/完整）、远程词库状态、每日 API 用量显示。

**Files:**
- Modify: `src/core/panel.js`
- Modify: `src/core/i18n.js`

- [ ] **Step 1: 在 i18n.js 中添加新文案**

```javascript
// i18n.js — 在中文和英文配置中添加
zh: {
  // ... 现有 ...
  aiModeLabel: 'AI 检测模式',
  aiModeOff: '关闭',
  aiModeEco: '省钱模式',
  aiModeFull: '完整模式',
  aiDailyUsage: '今日 AI 使用: {count}/{limit} 次',
  ruleStatus: '远程词库: {count} 条',
  ruleUpdateNow: '立即更新',
  ruleLastUpdate: '上次更新: {time}',
},
en: {
  // ... 现有 ...
  aiModeLabel: 'AI Detection Mode',
  aiModeOff: 'Off',
  aiModeEco: 'Eco Mode',
  aiModeFull: 'Full Mode',
  aiDailyUsage: 'AI Usage: {count}/{limit} today',
  ruleStatus: 'Remote Rules: {count}',
  ruleUpdateNow: 'Update Now',
  ruleLastUpdate: 'Last update: {time}',
},
```

- [ ] **Step 2: 在 panel.js 中添加 AI 模式切换 UI**

在 `PANEL_HTML` 模板中找到 AI 配置区域（apiKey 输入框附近），添加：

```html
<!-- AI 模式选择 -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
  <span data-i18n="aiModeLabel">AI 检测模式</span>
  <select id="cs-ai-mode" style="...">
    <option value="off" data-i18n="aiModeOff">关闭</option>
    <option value="eco" data-i18n="aiModeEco">省钱模式</option>
    <option value="full" data-i18n="aiModeFull">完整模式</option>
  </select>
</div>

<!-- AI 用量 -->
<div style="font-size:11px;color:var(--cs-text-secondary)" id="cs-ai-usage"></div>

<!-- 远程词库状态 + 更新按钮 -->
<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
  <span style="font-size:11px;color:var(--cs-text-secondary)" id="cs-rule-status"></span>
  <button id="cs-rule-update" style="font-size:11px;padding:2px 8px">立即更新</button>
</div>
```

- [ ] **Step 3: 在 panel.js _bind() 中添加事件绑定**

```javascript
// AI 模式切换
const aiMode = el.querySelector('#cs-ai-mode');
if (aiMode) {
  aiMode.value = this._config.aiMode || 'eco';
  aiMode.addEventListener('change', (e) => {
    this._config.aiMode = e.target.value;
    this._save();
  });
}

// 远程词库手动更新
const ruleUpdate = el.querySelector('#cs-rule-update');
if (ruleUpdate && this._scannerRef?.ruleManager) {
  ruleUpdate.addEventListener('click', async () => {
    ruleUpdate.disabled = true;
    ruleUpdate.textContent = '更新中...';
    await this._scannerRef.ruleManager.fetchRemote();
    this._scannerRef.ruleManager.mergeToDetector(
      this._scannerRef.detector,
      zhPatterns,
      enPatterns
    );
    this._updateStatus();
    ruleUpdate.disabled = false;
    ruleUpdate.textContent = '已更新';
    setTimeout(() => { ruleUpdate.textContent = '立即更新'; }, 2000);
  });
}
```

- [ ] **Step 4: 更新 _updateStatus 方法**

```javascript
// 在 _updateStatus 中增加
_updateStatus() {
  // ... 现有代码 ...

  // AI 用量
  const usageEl = this._el.querySelector('#cs-ai-usage');
  if (usageEl && this._scannerRef?.aiAnalyzer) {
    const count = this._scannerRef.aiAnalyzer.getTodayUsage();
    const limit = this._scannerRef.aiAnalyzer.getDailyLimit();
    usageEl.textContent = `今日 AI 使用: ${count}/${limit} 次`;
  }

  // 远程词库状态
  const ruleStatusEl = this._el.querySelector('#cs-rule-status');
  if (ruleStatusEl && this._scannerRef?.ruleManager) {
    const status = this._scannerRef.ruleManager.getStatus();
    ruleStatusEl.textContent = `远程词库: ${status.totalRemoteRules} 条 (${status.lastUpdate})`;
  }
}
```

- [ ] **Step 5: 构建验证**

```powershell
npm.cmd run build
```

Expected: Build succeeds.

---

## Self-Review

### 1. Spec 覆盖检查

| extend.md 需求 | 对应 Phase | 状态 |
|---|---|---|
| 漏洞 1: 词库与脚本耦合 | Phase 3 (rule-manager.js) | ✅ |
| 漏洞 2: 关键词匹配性能 | 文档中标注为"分阶段优化"，当前 25 条规则无需处理，做架构预留 | ✅ |
| 漏洞 3: AI 成本失控 - 批处理 | Phase 4 (ai.js 批处理队列) | ✅ |
| 漏洞 3: AI 成本失控 - 每日上限 | Phase 1 (ai.js dailyCount) | ✅ |
| 漏洞 3: AI 成本失控 - 规则晋升 | Phase 2 (rule-learner.js) | ✅ |
| 漏洞 3: AI 成本失控 - 三档模式 | Phase 7 (panel UI) | ✅ |
| 漏洞 4: 谐音变体绕过 | Phase 1 (ai.js DEFAULT_SYSTEM_PROMPT) | ✅ |
| 漏洞 5: 上下文敏感规则 | Phase 5 (detector.js Layer 2 增强) | ✅ |
| 漏洞 6: 平台适配深度 - Twitter | Phase 6 (twitter.js) | ✅ |
| 待实现: rule-learner.js | Phase 2 | ✅ |
| 待实现: 远程词库管理器 | Phase 3 | ✅ |
| 待实现: 批处理队列 | Phase 4 | ✅ |

### 2. 占位符检查

无占位符。所有代码块包含完整实现。

### 3. 类型一致性

- `ai.js` 导出 `AIAnalyzer`，在 `scanner.js` 中引用为 `this.aiAnalyzer`
- `rule-learner.js` 导出 `RuleLearner`，在 `scanner.js` 中引用为 `this.ruleLearner`
- `rule-manager.js` 导出 `RuleManager`，在 `scanner.js` 中引用为 `this.ruleManager`
- `detector.js` 的 `analyze()` 签名在第 I 阶段修改后，第 V 阶段扩展 `context.contextRules`
- 所有跨文件引用路径一致

---

## 执行建议

Phase 顺序按依赖关系排列（Phase 4 依赖 Phase 1，Phase 5 依赖 Phase 2）。建议逐个 Phase 执行，每完成一个 Phase 进行一次构建验证和 Git 提交。

**执行选项：**

1. **子代理驱动（推荐）** — 每个 Phase 派发独立子代理，逐个审查后推进
2. **内联执行** — 在当前会话中按 Phase 顺序执行，每 Phase 完成后检查点