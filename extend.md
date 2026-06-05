## CyberShield 扩展开发文档

本文档基于当前 v0.6.1 的代码实现状态，梳理核心架构的设计意图、已发现的工程漏洞及其解决方案，为后续迭代提供明确的技术方向。

---

## 当前实现状态

CyberShield 采用三层检测流水线架构，当前各层实现情况如下。

Layer 1 关键词规则引擎已完成，由 `detector.js` 在启动时将全部关键词编译为单一 RegExp，单次 `text.match()` 完成匹配，实测约 3ms 处理 1000 条内容。规则数据来自本地 JSON 文件（`rules-zh.json`、`rules-en.json`），共 25 条模式，构建时打包进脚本。

Layer 2 行为模式分析已实现基础框架，能够识别重复刷屏、@提及频率异常等行为特征，但尚未接入上下文敏感规则系统。

Layer 3 Claude AI 异步检测已完成接口对接（`ai.js`），支持通过 `GM_xmlhttpRequest` 调用 Claude API，具备基础的 toxic/suspicious/safe 三分类能力。但缺少批处理机制、每日调用上限控制和规则学习回路。

平台适配层已覆盖 Twitter/X、Reddit、YouTube、微博、B站、知乎、贴吧及 Generic fallback 共 8+1 个平台。其中 B站实现了完整的 API 拉黑/取消拉黑（`/x/relation/modify`），其余平台多为通知提示用户手动操作。

扫描引擎（`scanner.js`）通过 MutationObserver 实现实时 DOM 监听，支持 Shadow DOM 递归遍历，兼容 B站新版 Web Component 评论结构。控制面板（`panel.js`）提供双页 UI，支持中英文切换、手动扫描、勾选拉黑/取消拉黑、自定义关键词管理。

---

## 核心设计漏洞与演进方案

### 漏洞 1：词库与脚本耦合

当前所有关键词规则在构建时打包进 `dist/cyber-shield.user.js`。这意味着更新词库必须重新安装脚本，词库膨胀直接导致文件体积增长，社区贡献规则需要修改源码并提交 PR。

演进方案借鉴 uBlock Origin 的分发模式。安装时内置约 200 个种子词保证离线可用；首次运行时从 GitHub raw 地址拉取完整词库并存入 `GM_setValue`；之后每 24 小时后台静默更新一次；用户自定义规则存本地独立命名空间，永不覆盖。

```
数据流：
  内置种子词 → 立即可用
  远程词库   → fetch → GM_setValue('cs_rules_remote') → 合并到 RegExp
  用户规则   → GM_setValue('cs_rules_user') → 最高优先级
  社区 PR    → 更新远程词库 JSON → 用户自动同步
```

实现要点：`detector.js` 的 `compileRegex()` 方法需要接受三个来源的词库并合并。远程拉取使用 `GM_xmlhttpRequest` 获取 GitHub raw 内容，失败时静默降级到本地词库。更新频率通过 `GM_getValue('cs_rules_last_update')` 时间戳控制。

### 漏洞 2：关键词匹配的性能隐患

虽然 RegExp 编译已实现，但当远程词库扩展到数万条时，单一正则的构建时间和匹配性能可能出现退化。当前 25 条规则下约 3ms 的基准不可作为长期参考。

分阶段优化策略如下。词库规模在 1 万条以内维持当前单一 RegExp 方案，V8 引擎对交替正则的优化足够高效。1 万到 10 万条时，按首字母或类别拆分为多个子 RegExp，并行匹配后合并结果。10 万条以上引入 Aho-Corasick 多模式匹配算法，以 O(n) 复杂度一次扫描完成所有匹配，但实现复杂度显著上升，仅在词库规模确实到达此量级时再引入。

```
当前基准：
  25 规则 × 1000 条内容 ≈ 3ms
  预估上限（单一 RegExp）：约 5000 规则仍可保持 < 10ms
```

### 漏洞 3：AI 实时判断的成本失控

当前每次 Layer 3 触发都会发送一条 API 请求。在高流量场景（如直播间弹幕、热门评论区）下，token 消耗会快速累积。

核心思路转变：AI 的职责不是当裁判，而是训练规则库。判过一次的内容应沉淀为本地规则，后续由 Layer 1 零成本拦截。

具体机制包括四个层面。规则晋升：AI 判定为 toxic 后，提取触发模式（关键词、句式结构、上下文特征），写入本地缓存规则，下次同类内容由 Layer 1 直接命中。批处理：攒够 10 条灰色内容后打包为一次请求，利用 Claude 的长上下文窗口同时分析多条，单次请求成本降低约 80%。每日上限：默认 30 次 API 调用/天，通过 `GM_getValue('cs_ai_daily_count')` 计数，达到上限后自动降级为仅 Layer 1 + Layer 2。三档模式：关闭（纯规则引擎）、省钱模式（仅 Layer 1 miss 且 Layer 2 不确定时触发 AI）、完整模式（Layer 1 miss 全部送 AI）。

```
规则晋升示例：
  AI 判定 "你这个筹集，滚" → toxic
  提取模式：{ trigger: "筹集", context: ["滚", "你"], sentiment: negative }
  写入本地：context_sensitive_rules.push(...)
  下次 "筹集善款" → Layer 2 检查上下文 → 无负面信号 → SAFE（不误杀）
  下次 "你这个筹集" → Layer 2 检查上下文 → 负面信号命中 → TOXIC（Layer 1 直接拦）
```

### 漏洞 4：谐音与变体绕过规则库

中文网络暴力中最常见的绕过手法包括：谐音字替换（臭鸡→筹集，傻逼→沙比/煞笔）、拼音缩写（sb、nmsl、zz、cnm）、数字谐音（250、38）、故意错别字（死→四，妈→马）、词义污化（普通词被赋予贬义含义）。

传统词库只能匹配字面，无法理解意图。这正是 AI 不可替代的场景——AI 判断的是语义意图而非字面匹配。

Prompt 工程需要在系统提示中明确列出上述五类绕过手法，要求模型在判断时主动识别。同时 Prompt 应包含正负例对照，防止模型过度敏感。例如「筹集善款」应为 SAFE，「你这个筹集」应为 TOXIC。

实现层面，`ai.js` 的 Prompt 模板需要包含以下指令段落：

```
你正在检测中文网络暴力内容。特别注意以下绕过手法：
1. 谐音字替换（如用"筹集"代替"臭鸡"）
2. 拼音缩写（如 sb、nmsl）
3. 数字谐音
4. 故意错别字
5. 词义污化

判断标准是说话者的意图，而非字面用词。
同一词汇在不同语境下可能有完全不同的判定。
```

### 漏洞 5：上下文敏感规则缺失

当前系统只有硬规则（关键词命中即判定）和软规则（加权评分），缺少上下文敏感规则。这导致一个两难困境：要么词库过于严格（误杀正常内容），要么过于宽松（漏检变体攻击）。

上下文敏感规则的数据结构如下：

```json
{
  "context_sensitive": [
    {
      "trigger": "筹集",
      "canonical": "臭鸡",
      "require_negative_context": true,
      "negative_signals": ["滚", "去死", "你个", "废物"],
      "confidence": 0.82,
      "source": "ai_learned",
      "created_at": "2026-06-01"
    }
  ]
}
```

Layer 2 在遇到触发词时，检查周边文本是否包含负面信号。如果命中至少一个负面信号，判定为 suspicious 并送 Layer 3 二次确认；如果无负面信号，判定为 safe，不误杀正常内容。

这类规则不应由人工维护，而应由 AI 学习回路自动生成（见漏洞 3 的规则晋升机制）。每条规则附带置信度分数，多次验证后置信度上升，误判后自动降级或删除。

### 漏洞 6：平台适配深度不均

当前 8 个平台适配器中，只有 B站实现了完整的 API 拉黑/取消拉黑。Twitter 使用 DOM 模拟点击（依赖页面结构不变），Reddit/YouTube/微博/知乎/贴吧仅弹出通知要求用户手动操作。

后续应逐步加深各平台的适配深度。优先级排序依据用户量分布和 API 开放程度。Twitter/X 应迁移到 API 方式（`/1.1/blocks/create.json`），但需要 OAuth 认证流程。YouTube 可通过 `youtubei/v1` 内部 API 实现隐藏用户。微博有 `/friendships/create` 系列 API 可用。Reddit 的 `POST /api/block_user` 接口相对简单。

每个适配器的 `blockStrategy` 应实现三级降级：优先 API 调用 → 回退 DOM 模拟 → 最终通知用户手动操作。

---

## 待实现模块

### rule-learner.js（规则学习器）

这是当前架构中缺失的最关键模块。职责是接收 AI 判断结果，提取可复用的模式，写入本地规则库。

核心接口：

```javascript
export const RuleLearner = {
  // 接收 AI 判断结果，提取模式并写入本地规则
  learn(aiResult, originalText, context) {},

  // 从本地缓存中加载已学习的规则
  loadLearnedRules() {},

  // 清理低置信度或过期的规则
  pruneRules() {},

  // 将规则变更同步到 detector 的 RegExp
  syncToDetector(detector) {},
};
```

模式提取策略：从 AI 返回的 reason 字段中抽取关键短语；分析触发词的上下文窗口（前后各 5 个 token）；提取句式结构模板（如「你个 [X]」「[X] 去死」）。

### 远程词库管理器

独立模块，负责词库的版本控制、增量更新和合并逻辑。

```javascript
export const RuleManager = {
  REMOTE_URL: 'https://raw.githubusercontent.com/.../rules-zh.json',
  UPDATE_INTERVAL: 24 * 60 * 60 * 1000, // 24h

  async init() {},           // 首次运行拉取，后续检查更新
  async fetchRemote() {},    // GM_xmlhttpRequest 获取远程词库
  mergeRules() {},           // 合并内置 + 远程 + 用户规则
  getCompiledRegex() {},     // 返回合并后的 RegExp
  getUserRules() {},         // 读取用户自定义规则
  addUserRule(keyword) {},   // 添加用户规则
};
```

### 批处理队列

嵌入 `ai.js` 的批处理机制，避免逐条发送请求。

```javascript
// 攒够 N 条或等待 T 秒后触发一次批量请求
const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 5000; // 5s

aiQueue.push(text, context) → Promise<result>
```

---

## 性能预算

整个检测流水线必须在浏览器主线程的空闲时间内完成，不能造成可感知的卡顿。各层的性能预算如下。

Layer 1 关键词匹配：目标 < 5ms / 1000 条内容。当前已达标（约 3ms），远程词库扩展到 5000 条后需重新测量。

Layer 2 行为分析：目标 < 2ms / 单条内容。当前实现足够轻量，引入上下文敏感规则后需关注负面信号的匹配开销。

Layer 3 AI 调用：异步执行，不阻塞主线程。关注点在于请求频率控制和响应结果的规则提取延迟。

DOM 操作（模糊/取消模糊）：单元素 < 1ms。当前 `_blurContent()` 使用 CSS filter + overlay 方案，性能开销可忽略。MutationObserver 回调需要节流，避免在大量 DOM 变更时形成回调风暴。

---

## 工程原则

**快路径优先。** 绝大多数内容是安全的，三层流水线的设计确保 Layer 1 能拦截 90% 以上的违规内容，Layer 3 只处理真正需要语义理解的边界情况。任何优化都应优先加速快路径。

**AI 生成规则，而非 AI 做判断。** 每次 AI 调用都应产生可复用的本地规则。判过一次的内容沉淀成规则后，后续拦截成本为零。这个原则将 token 消耗从 O(n) 降低到 O(1)。

**上下文敏感优于简单黑名单。** 任何可能被用于攻击的词，同时也可能在正常语境中出现。触发词加周边语境的组合判断，误杀率远低于简单屏蔽。宁可漏检一条变体攻击，也不可误杀一条正常内容。

**远程分发优于内置打包。** 词库、规则、平台配置都应独立于脚本文件。更新规则不应要求用户重新安装脚本。参考 uBlock Origin 的种子词库加远程订阅模式。

**给用户控制权。** Token 消耗上限、灵敏度、自动拉黑、AI 模式——全部做成可配置的开关。工具的边界由用户定义，不是开发者强制决定。

**三级降级。** 每个功能路径都应有 fallback。API 调用失败回退 DOM 模拟，DOM 模拟失败回退通知用户。远程词库拉取失败回退本地种子词。AI 服务不可用时纯规则引擎继续工作。
