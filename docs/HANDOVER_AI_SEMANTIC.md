# CyberShield AI 语义模块 — 交接文档

> 生成时间: 2026-06-06
> 状态: 全部 13 项任务已完成，验证通过

---

## 一、本次完成的工作总览

按照 `docs/ai_semantic_filter_wiki (1).md` 的设计规范，完整实现了 AI 语义模块的所有核心能力，涵盖新建 7 个模块 + 改造 5 个现有模块。

### 新建模块

| 模块 | 文件路径 | 职责 |
|------|---------|------|
| 文本归一化 | `src/core/text-normalizer.js` | 零宽字符去除、全角半角、leet speak 还原、重复字符压缩 |
| AI Provider 基类 | `src/core/ai-providers/base-provider.js` | 抽象接口、输出契约定义、Prompt 模板、工具方法 |
| Claude Provider | `src/core/ai-providers/claude-provider.js` | Anthropic Claude API 适配 |
| OpenAI Provider | `src/core/ai-providers/openai-provider.js` | OpenAI/兼容端点适配 |
| Provider 工厂 | `src/core/ai-providers/index.js` | createProvider 工厂 + 注册中心 |
| 话题过滤 | `src/core/topic-filter.js` | 8 个内置话题 + 用户自定义话题、关键词匹配 |
| 短时上下文 | `src/core/context-window.js` | 按发言者分组、60s 窗口、拆分消息组合检测 |
| 记忆管理 | `src/core/memory.js` | 短期/中期/长期三级记忆、置信度衰减、过期清理 |

### 改造模块

| 模块 | 文件路径 | 改动要点 |
|------|---------|---------|
| AI 分析器 | `src/core/ai.js` | 多 Provider 集成、三档路由(off/eco/full)、升级输出契约(intent+learned_rule)、shouldAnalyze()路由 |
| 检测引擎 | `src/core/detector.js` | 集成 text-normalizer、四级风险(SAFE/LOW/MEDIUM/HIGH)、上下文窗口组合检测、话题路由 |
| 规则学习器 | `src/core/rule-learner.js` | 置信度动态调整(+0.02/-0.1)、30天过期、3次反向强制删除、learned_rule契约支持 |
| 上下文规则 | `src/core/context-rule.js` | excludeSignals排除词支持、recordCorrection误判纠正、置信度联动 |
| 扫描器 | `src/core/scanner.js` | 集成所有新模块、extras传参、markFalsePositive()、AI记忆写入 |
| 国际化 | `src/core/i18n.js` | 中英双语新增约 60 条字符串 |
| 控制面板 | `src/core/panel.js` | AI三档模式选择器、Provider选择器、端点/模型配置、测试按钮、话题偏好列表、取证面板误判标记+可解释性展示 |

---

## 二、架构数据流

```
用户评论
   │
   ▼
[归一化] text-normalizer.js
   │ normalizeText() + normalizeDeep()
   ▼
[Layer 1] detector._layerOneKeywords()    ────→ toxic → HIGH/MEDIUM 风险 → 模糊+取证+拉黑
   │ 未命中
   ▼
[Layer 2] detector._layerTwoBehavior()    ────→ toxic → MEDIUM 风险 → 模糊+取证
   │ 含上下文规则引擎(context-rule.js)
   │
   ├── [短时上下文窗口] context-window.js
   │     同一用户 + ≥2条 + 短消息(≤5字) + 均未命中 → 拼接后重跑 L1
   │
   │ 未命中/suspicious
   ▼
[AI 路由] ai.shouldAnalyze()
   │ 条件: AI 非 off + Provider 可用 + 未达日限 + L1 miss
   │        eco 模式: 仅 L2 suspicious 触发
   │        full 模式: L1 miss 全部触发
   ▼
[Layer 3] ai.analyze() → Provider API
   │ 批处理队列(10条/5s超时) → 单条降级
   │ 输出契约: verdict + confidence + intent + patterns + learned_rule
   ▼
[规则学习] rule-learner.learn()
   │ 提取 trigger → keyword 或 context_sensitive 规则
   │ 支持 context_requires / context_excludes
   │ 置信度初始打八折，命中+0.02，纠正-0.1
   │ syncToDetector() → detector + contextRuleEngine
   ▼
[记忆写入] memory.write()
   │ pattern 类型写入中期记忆（7天过期）
   ▼
[风险处理]
   shouldAct(riskLevel, sensitivity)
   │ 低灵敏度: 只处理 HIGH
   │ 中灵敏度: MEDIUM 以上
   │ 高灵敏度: LOW 以上
   ▼
  toxic → _handleToxic()  → 模糊 + 取证 + 截图 + 拉黑
  suspicious → _handleSuspicious() → 橙色虚线边框
```

---

## 三、关键接口定义

### 3.1 AI 输出契约（所有 Provider 必须返回此格式）

```json
{
  "verdict": "toxic | suspicious | safe",
  "confidence": 0.0~1.0,
  "intent": "gender_attack | race_attack | personal_attack | political_extreme | spoiler | fan_war | spam_harass | game_toxic | other | null",
  "reason": "一句话说明",
  "patterns": ["触发模式列表"],
  "learned_rule": {
    "trigger": "触发词",
    "canonical": "真实含义",
    "context_requires": ["周边词"],
    "context_excludes": ["排除词"]
  } | null
}
```

### 3.2 检测结果 schema（detector.analyze 返回）

```js
{
  verdict: 'toxic' | 'suspicious' | 'safe',
  confidence: 0.0~1.0,
  layer: 1 | 2 | 3,
  riskLevel: 'safe' | 'low' | 'medium' | 'high',
  reason: string,
  matched: string[],
  intent: string | null,
  explainChain: object[],  // 命中链路
}
```

### 3.3 新增 Provider 方法

在 `src/core/ai-providers/` 新建文件，继承 `BaseAIProvider`：

```js
class MyProvider extends BaseAIProvider {
  get name() { return 'my_provider'; }
  get defaultModel() { return 'model-name'; }
  async analyzeSingle(text, context) { /* 返回 AIResult */ }
  async analyzeBatch(items) { /* 返回 AIResult[] */ }
  async validateKey() { /* 返回 boolean */ }
}
```

然后在 `index.js` 的 REGISTRY 中注册。

---

## 四、配置字段（config 对象新增字段）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `aiMode` | `'off'\|'eco'\|'full'` | `'eco'` | AI 模式 |
| `aiProvider` | `'claude'\|'openai'` | `'claude'` | AI 提供商 |
| `aiModel` | `string` | `''`（使用默认） | 模型覆盖 |
| `aiEndpoint` | `string` | `''` | 自定义端点（OpenAI 兼容） |
| `aiDailyLimit` | `number` | `30` | 每日 AI 调用上限 |
| `aiEnabled` | `boolean` | `false` | 全局 AI 开关（由 aiMode 联动） |

---

## 五、GM Storage 新增 Key

| Key | 用途 |
|-----|------|
| `cs_topic_filter` | 话题偏好配置（启用状态 + 用户自定义话题） |
| `cs_memory` | 三级记忆条目数组 |

已有的 Key（未改动）：`cs_learned_rules`、`cs_context_rules`、`cs_ai_daily_count`、`cs_ai_last_reset`、`cs_rules_remote`、`cs_rules_last_update`

---

## 六、已知小问题（可选修复）

1. **scanner.js 冗余导入**：第 1 行 `RiskLevel` 被导入但未直接使用（`shouldAct` 内部已处理风险等级），可删除该导入
2. **话题偏好未持久化到 config**：话题偏好存储在独立的 GM key 中，config 对象不包含，如果后续需要导入/导出配置需注意
3. **面板主题偏好在面板折叠时不可见**：当前话题列表在控制面板第一页，内容较多时可考虑折叠或放到第二页

---

## 七、构建与测试

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run watch
```

构建后产物：`dist/cyber-shield.user.js`（Tampermonkey 单文件脚本）

### 测试要点

1. **无 API Key 降级**：不填 API Key 时 AI 模式应静默跳过，面板显示"未配置 API 密钥"
2. **三档切换**：off → 不调 AI；eco → 仅 suspicious 触发；full → 所有 miss 触发
3. **Provider 切换**：Claude / OpenAI 端点、模型、密钥可独立配置
4. **话题偏好**：勾选话题后涉及该话题的内容会被标记
5. **误判标记**：取证面板中点击"这是正常内容"后相关规则置信度降低
6. **短时上下文**：同一用户连续发送短消息（如拆分词语）应被组合检测
7. **归一化**：零宽字符、全角、leet speak、重复字符应被正确还原

---

## 八、文件清单（本次改动）

```
src/core/
├── ai-providers/
│   ├── base-provider.js    [NEW]
│   ├── claude-provider.js  [NEW]
│   ├── openai-provider.js  [NEW]
│   └── index.js            [NEW]
├── text-normalizer.js      [NEW]
├── topic-filter.js         [NEW]
├── context-window.js       [NEW]
├── memory.js               [NEW]
├── ai.js                   [REWRITE]
├── detector.js             [REWRITE]
├── rule-learner.js         [REWRITE]
├── context-rule.js         [REWRITE]
├── scanner.js              [MODIFIED - surgical edits]
├── i18n.js                 [MODIFIED - added strings]
├── panel.js                [MODIFIED - UI + events + CSS]
├── blocker.js              [unchanged]
├── evidence.js             [unchanged]
├── events.js               [unchanged]
└── rule-manager.js         [unchanged]
```
