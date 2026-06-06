/**
 * base-provider.js — AI Provider 抽象基类
 *
 * 所有 AI 提供商必须实现此接口。
 * 提供统一的 _gmFetch 和 JSON 解析工具方法。
 */

/**
 * AI 输出契约 (A4)
 * @typedef {Object} AIResult
 * @property {'toxic'|'suspicious'|'safe'} verdict
 * @property {number} confidence  0.0~1.0
 * @property {string|null} intent  话题类别 id 或 null
 * @property {string} reason  一句话说明
 * @property {string[]} patterns  触发模式列表
 * @property {Object|null} learned_rule  可学习规则（为 null 时跳过写回）
 * @property {string} learned_rule.trigger  触发词
 * @property {string} learned_rule.canonical  该词的真实含义
 * @property {string[]} learned_rule.context_requires  至少需要一个的周边词
 * @property {string[]} learned_rule.context_excludes  出现这些词则为正常用法
 */

/** 默认系统 Prompt — 升级版输出契约 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个网络内容安全分析引擎，专门检测中文和英文网络暴力、骚扰和有害内容。

特别注意以下绕过手法：
1. 谐音字替换（如用"筹集"代替"臭鸡"）
2. 拼音缩写（如 sb、nmsl、yyds）
3. 数字谐音（如 250、38）
4. 故意错别字和变体字
5. 词义污化（普通词被赋予贬义含义）
6. 拆字、插空格、插符号
7. 跨消息拆分攻击

判断标准是说话者的意图，而非字面用词。同一词汇在不同语境下可能有完全不同的判定。

你必须返回严格的 JSON 格式，包含以下字段：
{
  "verdict": "toxic" | "suspicious" | "safe",
  "confidence": 0.0到1.0之间的数字,
  "intent": "话题类别id，如 gender_attack/race_attack/personal_attack/political_extreme/spam_harass/other，无法分类时为null",
  "reason": "一句话说明判断原因",
  "patterns": ["提取的触发模式列表，便于本地规则学习"],
  "learned_rule": {
    "trigger": "触发词",
    "canonical": "该词的真实含义",
    "context_requires": ["至少需要一个的周边词，无则为空数组"],
    "context_excludes": ["出现这些词则为正常用法，无则为空数组"]
  }
}

learned_rule 仅在你能提取可复用的语义规则时填写，否则设为 null。`;

/** 批量分析 Prompt 模板 */
export const BATCH_PROMPT_TEMPLATE = (count, messages) =>
  `Analyze each of the following ${count} messages for toxicity. Respond with a JSON array where each element corresponds to the message at the same index.

Messages:
${messages}

Respond with ONLY valid JSON array:
[
  { "verdict": "toxic"|"suspicious"|"safe", "confidence": 0.0-1.0, "intent": "topic_id"|null, "reason": "...", "patterns": ["..."], "learned_rule": {...}|null }
]`;

/** 单条分析 Prompt 模板 */
export const SINGLE_PROMPT_TEMPLATE = (text, context) =>
  `Text: """${text}"""
Context: Platform=${context.platform || 'unknown'}, Is a direct reply=${!!context.isReply}, Mentions user=${!!context.mentionsUser}

Respond with ONLY valid JSON:
{
  "verdict": "toxic" | "suspicious" | "safe",
  "confidence": 0.0-1.0,
  "intent": "topic_id" | null,
  "reason": "one sentence explanation",
  "patterns": ["list of trigger patterns"],
  "learned_rule": { "trigger": "...", "canonical": "...", "context_requires": [], "context_excludes": [] } | null
}`;

export class BaseAIProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey
   * @param {string} [config.aiModel]  用户指定的模型覆盖
   */
  constructor(config) {
    this.config = config;
  }

  /** 提供商名称 */
  get name() { return 'base'; }

  /** 默认模型 ID */
  get defaultModel() { return ''; }

  /** 当前使用的模型 */
  get model() { return this.config.aiModel || this.defaultModel; }

  /**
   * 单条分析
   * @param {string} text
   * @param {object} context
   * @returns {Promise<AIResult>}
   */
  async analyzeSingle(text, context) {
    throw new Error('Not implemented');
  }

  /**
   * 批量分析
   * @param {Array<{text: string, context: object}>} items
   * @returns {Promise<AIResult[]>}
   */
  async analyzeBatch(items) {
    throw new Error('Not implemented');
  }

  /** 验证 API Key 是否有效（快速测试） */
  async validateKey() {
    throw new Error('Not implemented');
  }

  // ─── 工具方法 ──────────────────────────────────────────────────────────────

  /** GM_xmlhttpRequest Promise 封装 */
  _gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        data: options.body,
        responseType: 'json',
        timeout: options.timeout || 30000,
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

  /** 安全解析 AI 返回的 JSON（处理 markdown 代码块包裹） */
  _parseAIResponse(raw) {
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn('[CyberShield] Failed to parse AI response:', e, '\nRaw:', raw.slice(0, 500));
      return null;
    }
  }

  /** 将原始 AI 输出标准化为 AIResult 格式 */
  _normalizeResult(raw) {
    if (!raw) return null;
    return {
      verdict:      raw.verdict      || 'safe',
      confidence:   typeof raw.confidence === 'number' ? raw.confidence : 0.5,
      intent:       raw.intent       || null,
      reason:       raw.reason       || 'AI analysis',
      patterns:     Array.isArray(raw.patterns) ? raw.patterns : [],
      learned_rule: raw.learned_rule || null,
    };
  }
}
