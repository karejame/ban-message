/**
 * rule-learner.js — AI 规则学习器（升级版）
 *
 * 从 AI 判定结果中提取可复用模式，写入本地规则库。
 *
 * 增强功能 (Wiki A5)：
 *   - 置信度动态调整：命中 +0.02（上限 0.95），用户纠正 -0.1
 *   - 过期清理：30 天未命中自动删除
 *   - 记忆污染恢复：累计 3 次反向标记强制删除
 *   - 支持 learned_rule 输出契约（context_requires / context_excludes）
 *
 * 规则类型：
 *   - keyword: 单关键词（置信度 > 0.6 时直接晋升 hard_keyword）
 *   - context_sensitive: 触发词 + context_requires/context_excludes
 */

const LEARNED_RULES_KEY = 'cs_learned_rules';

// 置信度参数 (A5)
const CONFIDENCE = {
  INITIAL_DISCOUNT: 0.8,     // 初始置信度打八折
  HIT_BOOST: 0.02,           // 每次命中 +0.02
  CORRECTION_PENALTY: 0.1,   // 用户纠正 -0.1
  MAX: 0.95,                 // 上限
  AUTO_DELETE: 0.45,         // 低于此值自动删除
  PROMOTION_THRESHOLD: 0.6,  // 晋升为 hard_keyword 的阈值
  FORCE_DELETE_REVERSES: 3,  // 累计反向标记强制删除
};

const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天

export class RuleLearner {
  constructor() {
    this.rules = { keywords: [], contextSensitive: [] };
    this._load();
  }

  /**
   * 从 AI 结果学习
   * @param {object} aiResult      AI 分析结果（含 patterns, learned_rule）
   * @param {string} originalText  原始文本
   * @param {object} context       { negativeSignals, ... }
   */
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

  /**
   * 记录一次规则命中，提升置信度 (A5)
   * @param {string} trigger  规则触发词
   * @returns {boolean} 规则是否仍然存在
   */
  recordHit(trigger) {
    const rule = this._findRule(trigger);
    if (!rule) return false;

    rule.hitCount = (rule.hitCount || 0) + 1;
    rule.lastHit = Date.now();
    rule.confidence = Math.min(rule.confidence + CONFIDENCE.HIT_BOOST, CONFIDENCE.MAX);
    this._save();
    return true;
  }

  /**
   * 记录一次用户反向标记（误判纠正）(A5)
   * @param {string} trigger  规则触发词
   * @returns {{ deleted: boolean, reason: string }}
   */
  recordCorrection(trigger) {
    const rule = this._findRule(trigger);
    if (!rule) return { deleted: false, reason: 'Rule not found' };

    rule.reverseCount = (rule.reverseCount || 0) + 1;
    rule.confidence = Math.max(rule.confidence - CONFIDENCE.CORRECTION_PENALTY, 0);

    // 累计反向标记达到阈值 → 强制删除
    if (rule.reverseCount >= CONFIDENCE.FORCE_DELETE_REVERSES) {
      this._removeRule(trigger);
      this._save();
      return { deleted: true, reason: 'force_delete_3_reverses' };
    }

    // 置信度低于阈值 → 自动删除
    if (rule.confidence < CONFIDENCE.AUTO_DELETE) {
      this._removeRule(trigger);
      this._save();
      return { deleted: true, reason: 'confidence_below_threshold' };
    }

    this._save();
    return { deleted: false, reason: 'confidence_reduced' };
  }

  /** 获取所有学习到的关键词（用于合并到 detector） */
  getLearnedKeywords() {
    return this.rules.keywords
      .filter(r => r.confidence > CONFIDENCE.PROMOTION_THRESHOLD)
      .map(r => r.trigger);
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

    const ctxRules = this.getContextSensitiveRules();
    if (ctxRules.length > 0 && detector.contextRuleEngine) {
      detector.contextRuleEngine.addRules(ctxRules.map(r => ({
        trigger: r.trigger,
        canonical: r.canonical,
        negativeSignals: r.contextRequires || r.negativeSignals || [],
        excludeSignals: r.contextExcludes || [],
        confidence: r.confidence,
        source: r.source,
      })));
    }
  }

  /** 获取所有规则（供面板展示） */
  getAllRulesDetailed() {
    return {
      keywords: this.rules.keywords.map(r => ({ ...r })),
      contextSensitive: this.rules.contextSensitive.map(r => ({ ...r })),
    };
  }

  /** 清理低置信度/过期规则 (A5) */
  _prune() {
    const now = Date.now();

    const isAlive = (r) => {
      if (r.confidence < CONFIDENCE.AUTO_DELETE) return false;
      // 30 天未命中 且 创建超过 30 天 → 删除
      if (r.hitCount === 0 && now - r.createdAt > MAX_AGE) return false;
      // 最后命中超过 30 天 → 删除
      if (r.lastHit && now - r.lastHit > MAX_AGE) return false;
      return true;
    };

    this.rules.keywords = this.rules.keywords.filter(isAlive);
    this.rules.contextSensitive = this.rules.contextSensitive.filter(isAlive);
  }

  /** 从 AI 结果中提取模式（升级版 — 支持 learned_rule 契约） */
  _extractPattern(aiResult, text, context) {
    // 优先使用 AI 返回的 learned_rule
    const lr = aiResult.learned_rule;
    if (lr && lr.trigger) {
      const trigger = lr.trigger.toLowerCase().trim();
      const exists = this._findRule(trigger);
      if (!exists) {
        const hasContext = (lr.context_requires && lr.context_requires.length > 0)
          || (lr.context_excludes && lr.context_excludes.length > 0)
          || (context.negativeSignals && context.negativeSignals.length > 0);

        if (hasContext) {
          return {
            type: 'context_sensitive',
            trigger,
            canonical: lr.canonical || trigger,
            contextRequires: lr.context_requires || [],
            contextExcludes: lr.context_excludes || [],
            negativeSignals: context.negativeSignals || [],
            confidence: aiResult.confidence * CONFIDENCE.INITIAL_DISCOUNT,
            intent: aiResult.intent || null,
            source: 'ai_learned',
            createdAt: Date.now(),
            lastHit: 0,
            hitCount: 1,
            reverseCount: 0,
          };
        }

        return {
          type: 'keyword',
          trigger,
          canonical: lr.canonical || trigger,
          confidence: aiResult.confidence * CONFIDENCE.INITIAL_DISCOUNT,
          intent: aiResult.intent || null,
          source: 'ai_learned',
          createdAt: Date.now(),
          lastHit: 0,
          hitCount: 1,
          reverseCount: 0,
        };
      }
      return null;
    }

    // 降级：使用 patterns 数组
    const patterns = aiResult.patterns || [];
    if (patterns.length === 0) return null;

    const trigger = patterns[0].toLowerCase().trim();
    const exists = this._findRule(trigger);
    if (exists) return null;

    const isContextSensitive = text.length > 20 || (context.negativeSignals && context.negativeSignals.length > 0);

    if (isContextSensitive) {
      return {
        type: 'context_sensitive',
        trigger,
        canonical: trigger,
        contextRequires: [],
        contextExcludes: [],
        negativeSignals: context.negativeSignals || [],
        confidence: aiResult.confidence * CONFIDENCE.INITIAL_DISCOUNT,
        intent: aiResult.intent || null,
        source: 'ai_learned',
        createdAt: Date.now(),
        lastHit: 0,
        hitCount: 1,
        reverseCount: 0,
      };
    }

    return {
      type: 'keyword',
      trigger,
      canonical: trigger,
      confidence: aiResult.confidence * CONFIDENCE.INITIAL_DISCOUNT,
      intent: aiResult.intent || null,
      source: 'ai_learned',
      createdAt: Date.now(),
      lastHit: 0,
      hitCount: 1,
      reverseCount: 0,
    };
  }

  /** 查找规则（按 trigger） */
  _findRule(trigger) {
    return this.rules.keywords.find(r => r.trigger === trigger)
      || this.rules.contextSensitive.find(r => r.trigger === trigger);
  }

  /** 删除规则 */
  _removeRule(trigger) {
    this.rules.keywords = this.rules.keywords.filter(r => r.trigger !== trigger);
    this.rules.contextSensitive = this.rules.contextSensitive.filter(r => r.trigger !== trigger);
  }

  _load() {
    try {
      const data = GM_getValue(LEARNED_RULES_KEY, '[]');
      const parsed = JSON.parse(data);
      this.rules = {
        keywords: parsed.keywords || [],
        contextSensitive: parsed.contextSensitive || [],
      };
      // 向后兼容：确保旧格式有 reverseCount 和 lastHit
      for (const r of [...this.rules.keywords, ...this.rules.contextSensitive]) {
        r.reverseCount = r.reverseCount || 0;
        r.lastHit = r.lastHit || 0;
        r.hitCount = r.hitCount || 0;
      }
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
