/**
 * context-rule.js — 上下文敏感规则引擎（升级版）
 *
 * 用于 Layer 2 行为分析中的上下文感知判断。
 *
 * 增强功能：
 *   - 支持 context_requires / context_excludes（来自 AI 输出契约 A4）
 *   - 置信度动态联动（命中 +0.02，用户纠正 -0.1）
 *   - 记忆污染恢复（累计 3 次反向标记强制删除）
 *
 * 规则来源：ai_learned（AI 学习器自动生成）、manual（用户手动添加）
 */

const CONTEXT_RULES_KEY = 'cs_context_rules';

// 置信度参数
const CONFIDENCE = {
  HIT_BOOST: 0.02,
  CORRECTION_PENALTY: 0.1,
  MAX: 0.95,
  AUTO_DELETE: 0.45,
  FORCE_DELETE_REVERSES: 3,
};

export class ContextRuleEngine {
  constructor() {
    this.rules = [];
    this._load();
  }

  /**
   * 添加一条上下文敏感规则
   */
  addRule(rule) {
    const exists = this.rules.some(r => r.trigger === rule.trigger);
    if (exists) {
      // 更新已有规则（合并负面信号和排除信号）
      const existing = this.rules.find(r => r.trigger === rule.trigger);
      if (existing && rule.negativeSignals) {
        const newSignals = rule.negativeSignals.filter(s => !existing.negativeSignals.includes(s));
        existing.negativeSignals.push(...newSignals);
      }
      if (existing && rule.excludeSignals) {
        const newExcludes = rule.excludeSignals.filter(s => !existing.excludeSignals.includes(s));
        existing.excludeSignals.push(...newExcludes);
      }
      this._save();
      return;
    }

    this.rules.push({
      trigger: rule.trigger,
      canonical: rule.canonical || rule.trigger,
      requireNegativeContext: true,
      negativeSignals: rule.negativeSignals || [],     // 必须至少命中一个
      excludeSignals: rule.excludeSignals || [],        // 出现这些则为正常用法
      confidence: rule.confidence || 0.5,
      source: rule.source || 'ai_learned',
      createdAt: Date.now(),
      hitCount: 0,
      reverseCount: 0,
      lastHit: 0,
    });
    this._save();
  }

  /**
   * 批量添加规则（供 rule-learner 同步）
   */
  addRules(rules) {
    for (const r of rules) {
      this.addRule(r);
    }
  }

  /**
   * 评估文本是否触发上下文敏感规则
   * @param {string} text
   * @returns {object|null}
   */
  evaluate(text) {
    const lower = text.toLowerCase();

    for (const rule of this.rules) {
      // 检查触发词是否在文本中
      if (!lower.includes(rule.trigger)) continue;

      // 检查排除信号（excludes）— 如果命中排除词，则判定为 safe
      const matchedExclude = (rule.excludeSignals || []).find(s => lower.includes(s));
      if (matchedExclude) {
        rule.hitCount++;
        rule.lastHit = Date.now();
        this._save();
        return {
          verdict: 'safe',
          trigger: rule.trigger,
          canonical: rule.canonical,
          confidence: 1.0,
          matchedSignal: null,
          matchedExclude,
          source: rule.source,
          note: `Trigger "${rule.trigger}" found but excluded by "${matchedExclude}"`,
        };
      }

      // 检查负面信号（requires / negativeSignals）
      const matchedSignal = rule.negativeSignals.find(s => lower.includes(s));

      if (matchedSignal) {
        // 有负面信号 → suspicious
        rule.hitCount++;
        rule.lastHit = Date.now();
        rule.confidence = Math.min(rule.confidence + CONFIDENCE.HIT_BOOST, CONFIDENCE.MAX);
        this._save();
        return {
          verdict: 'suspicious',
          trigger: rule.trigger,
          canonical: rule.canonical,
          confidence: rule.confidence,
          matchedSignal,
          source: rule.source,
          ruleId: rule.trigger,
        };
      } else {
        // 触发词出现但无负面信号 → safe
        rule.hitCount++;
        rule.lastHit = Date.now();
        this._save();
        return {
          verdict: 'safe',
          trigger: rule.trigger,
          canonical: rule.canonical,
          confidence: 1.0,
          matchedSignal: null,
          source: rule.source,
          note: 'Trigger word found but no negative context',
          ruleId: rule.trigger,
        };
      }
    }

    return null;
  }

  /**
   * 用户标记误判（记忆污染恢复 A5）
   * @param {string} trigger  触发词
   * @returns {{ deleted: boolean, reason: string }}
   */
  recordCorrection(trigger) {
    const rule = this.rules.find(r => r.trigger === trigger);
    if (!rule) return { deleted: false, reason: 'Rule not found' };

    rule.reverseCount = (rule.reverseCount || 0) + 1;
    rule.confidence = Math.max(rule.confidence - CONFIDENCE.CORRECTION_PENALTY, 0);

    // 累计 3 次反向标记 → 强制删除
    if (rule.reverseCount >= CONFIDENCE.FORCE_DELETE_REVERSES) {
      this.rules = this.rules.filter(r => r.trigger !== trigger);
      this._save();
      return { deleted: true, reason: 'force_delete_3_reverses' };
    }

    // 置信度低于阈值 → 自动删除
    if (rule.confidence < CONFIDENCE.AUTO_DELETE) {
      this.rules = this.rules.filter(r => r.trigger !== trigger);
      this._save();
      return { deleted: true, reason: 'confidence_below_threshold' };
    }

    this._save();
    return { deleted: false, reason: 'confidence_reduced' };
  }

  /** 获取所有规则 */
  getAllRules() {
    return [...this.rules];
  }

  /** 清理低置信度规则 */
  prune(minConfidence = 0.3) {
    this.rules = this.rules.filter(r => r.confidence >= minConfidence);
    this._save();
  }

  _load() {
    try {
      const data = GM_getValue(CONTEXT_RULES_KEY, '[]');
      this.rules = JSON.parse(data);
      // 向后兼容：确保旧格式有新字段
      for (const r of this.rules) {
        r.excludeSignals = r.excludeSignals || [];
        r.reverseCount = r.reverseCount || 0;
        r.lastHit = r.lastHit || 0;
      }
    } catch (e) {
      this.rules = [];
    }
  }

  _save() {
    try {
      GM_setValue(CONTEXT_RULES_KEY, JSON.stringify(this.rules));
    } catch (e) { /* silent */ }
  }
}
