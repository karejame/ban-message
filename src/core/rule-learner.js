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

    // 同步上下文敏感规则到 contextRuleEngine
    const ctxRules = this.getContextSensitiveRules();
    if (ctxRules.length > 0 && detector.contextRuleEngine) {
      detector.contextRuleEngine.addRules(ctxRules);
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