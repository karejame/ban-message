/**
 * detector.js — Three-Layer Toxicity Detection Engine (升级版)
 *
 * Layer 1: Keyword Rules      (sync,  ~0ms)   — hard pattern match + variant/fuzzy matching
 * Layer 2: Behavioral Rules   (sync,  ~1ms)   — structural/contextual signals
 * Layer 3: AI Semantic        (async, ~500ms) — ambiguous gray-zone content
 *
 * 新增：
 *   - 集成 text-normalizer.js 归一化流水线
 *   - 四级风险等级：SAFE / LOW / MEDIUM / HIGH
 *   - 集成 context-window 短时上下文
 *   - 集成 topic-filter 话题过滤
 *   - 增强路由逻辑（分层路由 Wiki 11）
 */

import enPatterns from '../data/en-patterns.json';
import zhPatterns from '../data/zh-patterns.json';
import { ContextRuleEngine } from './context-rule.js';
import { normalizeText, normalizeDeep } from './text-normalizer.js';

// ─── Result schema ────────────────────────────────────────────────────────────
//
//  {
//    verdict:    'toxic' | 'suspicious' | 'safe',
//    confidence: 0.0–1.0,
//    layer:      1 | 2 | 3,
//    riskLevel:  'safe' | 'low' | 'medium' | 'high',
//    reason:     string,          // human-readable explanation
//    matched:    string[],        // matched keywords or patterns
//    intent:     string | null,   // 话题类别 (from AI layer)
//    explainChain: object[],      // 命中链路（可解释性 A9）
//  }

export const Verdict = {
  TOXIC:      'toxic',
  SUSPICIOUS: 'suspicious',
  SAFE:       'safe',
};

// ─── 四级风险等级 (A6) ────────────────────────────────────────────────────────

export const RiskLevel = {
  SAFE:   'safe',
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
};

/**
 * 将 verdict + confidence 映射为风险等级
 * 灵敏度设置会影响映射阈值
 */
function verdictToRiskLevel(verdict, confidence, sensitivity) {
  if (verdict === Verdict.TOXIC) {
    return confidence >= 0.8 ? RiskLevel.HIGH : RiskLevel.MEDIUM;
  }
  if (verdict === Verdict.SUSPICIOUS) {
    return confidence >= 0.5 ? RiskLevel.MEDIUM : RiskLevel.LOW;
  }
  return RiskLevel.SAFE;
}

/**
 * 灵敏度 → 最低处理风险等级
 *   低灵敏度：只处理 HIGH
 *   中灵敏度（默认）：处理 MEDIUM 以上
 *   高灵敏度：处理 LOW 以上
 */
export function getMinRiskLevel(sensitivity) {
  switch (sensitivity) {
    case 'low':    return RiskLevel.HIGH;
    case 'high':   return RiskLevel.LOW;
    default:       return RiskLevel.MEDIUM;
  }
}

/**
 * 判断风险等级是否达到处理阈值
 */
export function shouldAct(riskLevel, sensitivity) {
  const minLevel = getMinRiskLevel(sensitivity);
  const order = [RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH];
  return order.indexOf(riskLevel) >= order.indexOf(minLevel);
}

// ─── Sensitivity thresholds ───────────────────────────────────────────────────

const SENSITIVITY = {
  low:    { l1: 0.9, l2: 0.85, l3: 0.80 },
  medium: { l1: 0.7, l2: 0.65, l3: 0.60 },
  high:   { l1: 0.5, l2: 0.45, l3: 0.40 },
};

// ─── Detector ─────────────────────────────────────────────────────────────────

export class Detector {
  constructor(config) {
    this.config = config;
    this.thresholds = SENSITIVITY[config.sensitivity] || SENSITIVITY.medium;
    this.contextRuleEngine = new ContextRuleEngine();
    this._buildRuleCache();
  }

  _buildRuleCache() {
    // Merge English + Chinese rules into flat sets
    this.hardKeywords  = new Set([
      ...(enPatterns.hard_keywords  || []),
      ...(zhPatterns.hard_keywords  || []),
    ]);
    this.softKeywords  = new Set([
      ...(enPatterns.soft_keywords  || []),
      ...(zhPatterns.soft_keywords  || []),
    ]);
    this.regexPatterns = [
      ...(enPatterns.regex_patterns || []).map(p => new RegExp(p, 'i')),
      ...(zhPatterns.regex_patterns || []).map(p => new RegExp(p)),
    ];

    this.variantMap = [
      ...(enPatterns.variant_map || []),
      ...(zhPatterns.variant_map || []),
    ];

    this.pinyinMap = zhPatterns.pinyin_map || {};

    this._addCustomKeywords();
    this._addCustomRegex();
    this._addAutoLearnedKeywords();
  }

  _addCustomKeywords() {
    this._customKeywordKeys = new Set();
    const customs = this.config.customKeywords || [];
    for (const entry of customs) {
      if (entry.keyword) {
        const kw = entry.keyword.toLowerCase();
        if (!this.hardKeywords.has(kw)) {
          this._customKeywordKeys.add(kw);
        }
        this.hardKeywords.add(kw);
      }
      if (entry.aliases && entry.aliases.length > 0) {
        for (const alias of entry.aliases) {
          const a = alias.toLowerCase();
          if (!this.hardKeywords.has(a)) {
            this._customKeywordKeys.add(a);
          }
          this.hardKeywords.add(a);
        }
      }
    }
  }

  reloadCustomKeywords() {
    if (this._customKeywordKeys) {
      for (const kw of this._customKeywordKeys) {
        this.hardKeywords.delete(kw);
      }
    }
    this._addCustomKeywords();
  }

  _addCustomRegex() {
    this._customRegexSources = new Set();
    const customs = this.config.customRegex || [];
    for (const entry of customs) {
      if (entry.pattern) {
        try {
          const flags = entry.flags || 'i';
          const rx = new RegExp(entry.pattern, flags);
          this.regexPatterns.push(rx);
          this._customRegexSources.add(entry.pattern);
        } catch (e) {
          console.warn(`[CyberShield] Invalid custom regex: ${entry.pattern}`, e);
        }
      }
    }
  }

  reloadCustomRegex() {
    if (this._customRegexSources) {
      this.regexPatterns = this.regexPatterns.filter(p => !this._customRegexSources.has(p.source));
    }
    this._addCustomRegex();
  }

  /** 加载 AI 自动学习的关键词到硬关键词 */
  _addAutoLearnedKeywords() {
    this._autoLearnedKeywordKeys = new Set();
    const learned = this.config.autoLearnedKeywords || [];
    for (const kw of learned) {
      const lower = kw.toLowerCase().trim();
      if (lower.length >= 2 && !this.hardKeywords.has(lower)) {
        this._autoLearnedKeywordKeys.add(lower);
        this.hardKeywords.add(lower);
      }
    }
  }

  /** 重载 AI 自动学习的关键词（配置变更后调用） */
  reloadAutoLearnedKeywords() {
    if (this._autoLearnedKeywordKeys) {
      for (const kw of this._autoLearnedKeywordKeys) {
        this.hardKeywords.delete(kw);
      }
    }
    this._addAutoLearnedKeywords();
  }

  getAllRules() {
    // 区分内置正则和自定义正则
    const builtinRegex = [];
    const customRegex = this.config.customRegex || [];
    const customSources = new Set(customRegex.map(e => e.pattern));
    for (const rx of this.regexPatterns) {
      if (!customSources.has(rx.source)) {
        builtinRegex.push(rx.source);
      }
    }

    return {
      hardKeywords: [...this.hardKeywords],
      softKeywords: [...this.softKeywords],
      regexPatterns: builtinRegex,
      customRegex: customRegex,
      customKeywords: this.config.customKeywords || [],
      variantMap: this.variantMap,
      pinyinMap: this.pinyinMap,
    };
  }

  /**
   * 主入口 — 运行检测流水线。
   *
   * @param {string}   text          原始文本
   * @param {object}   context       { username, platform, isReply, mentionsUser }
   * @param {object}   aiAnalyzer    AIAnalyzer 实例
   * @param {Function} onAIResult    AI 结果回调
   * @param {object}   [extras]      额外模块
   * @param {object}   [extras.topicFilter]     TopicFilter 实例
   * @param {object}   [extras.contextWindow]  ContextWindow 实例
   * @returns {object}  同步结果（含 riskLevel）
   */
  analyze(text, context = {}, aiAnalyzer = null, onAIResult = null, extras = {}) {
    const explainChain = [];

    // ★ 灵敏度路由
    const sensitivity = this.config.sensitivity || 'medium';
    const accountLevel = extras.accountLevel || 'normal';
    const skipL2 = (sensitivity === 'low') ||
      (sensitivity === 'medium' && accountLevel === 'official');
    const skipAI = skipL2 ||
      (sensitivity === 'medium' && accountLevel === 'official');

    // ── Step 1: 归一化（使用 text-normalizer）──────────────────────────────
    const normalized = normalizeText(text, { preserveNumbers: true });
    const deepNormalized = normalizeDeep(text, { preserveNumbers: true });

    // ── Step 2: Layer 1 — 关键词 + 变体匹配 ──────────────────────────────
    const l1 = this._layerOneKeywords(normalized, deepNormalized, sensitivity === 'high');
    if (l1.verdict === Verdict.TOXIC) {
      explainChain.push({ layer: 1, verdict: l1.verdict, matched: l1.matched, reason: l1.reason });
      l1.riskLevel = verdictToRiskLevel(l1.verdict, l1.confidence, sensitivity);
      l1.explainChain = explainChain;
      l1.intent = null;
      return l1;
    }

    // ★ LOW / MEDIUM+official: L1 未命中则直接返回 SAFE，不走 L2 / AI
    if (skipL2) {
      const result = { ...l1, riskLevel: verdictToRiskLevel(l1.verdict, l1.confidence, sensitivity) };
      result.explainChain = explainChain;
      return result;
    }

    // ── Step 3: Layer 2 — 行为信号 ──────────────────────────────────────
    const l2 = this._layerTwoBehavior(normalized, context);
    if (l2.verdict === Verdict.TOXIC) {
      explainChain.push({ layer: 2, verdict: l2.verdict, matched: l2.matched, reason: l2.reason });
      l2.riskLevel = verdictToRiskLevel(l2.verdict, l2.confidence, sensitivity);
      l2.explainChain = explainChain;
      l2.intent = null;
      return l2;
    }

    // ── Step 4: 短时上下文窗口组合检测 ──────────────────────────────────
    if (extras.contextWindow && context.username) {
      const syncResult = l2.verdict !== Verdict.SAFE ? l2 : l1;
      extras.contextWindow.addMessage(context.username, text, syncResult, context._element);

      if (extras.contextWindow.shouldCombine(context.username)) {
        const combined = extras.contextWindow.getCombined(context.username);
        if (combined) {
          const combinedNormalized = normalizeText(combined.combinedText, { preserveNumbers: true });
          const combinedL1 = this._layerOneKeywords(combinedNormalized, normalizeDeep(combined.combinedText, { preserveNumbers: true }));
          if (combinedL1.verdict === Verdict.TOXIC) {
            explainChain.push({
              layer: 'context_window',
              verdict: combinedL1.verdict,
              matched: combinedL1.matched,
              reason: 'Combined message analysis detected toxicity',
              messageCount: combined.messages.length,
            });
            combinedL1.layer = 2;
            combinedL1.riskLevel = verdictToRiskLevel(combinedL1.verdict, combinedL1.confidence, sensitivity);
            combinedL1.explainChain = explainChain;
            combinedL1.intent = null;
            return combinedL1;
          }
        }
      }
    }

    // ── Step 5: Layer 3 — AI 语义分析（异步） ─────────────────────────
    if (!skipAI && aiAnalyzer && onAIResult && this.config.aiEnabled) {
      const currentResult = l2.verdict === Verdict.SUSPICIOUS ? l2 : l1;
      const involvesTopic = extras.topicFilter
        ? extras.topicFilter.involvesUserTopic(normalized)
        : true;

      if (aiAnalyzer.shouldAnalyze(currentResult, involvesTopic)) {
        explainChain.push({ layer: 3, action: 'queued_for_ai', reason: 'Ambiguous content sent to AI' });

        // 附加话题信息到 context
        const aiContext = {
          ...context,
          topics: extras.topicFilter ? extras.topicFilter.detectTopics(normalized) : [],
        };

        aiAnalyzer.analyze(text, aiContext).then(aiResult => {
          if (aiResult) {
            aiResult.riskLevel = verdictToRiskLevel(
              aiResult.verdict, aiResult.confidence, sensitivity
            );
            aiResult.explainChain = [
              ...explainChain,
              { layer: 3, verdict: aiResult.verdict, reason: aiResult.reason, intent: aiResult.intent },
            ];
          }
          onAIResult(aiResult);
        });
      }
    }

    // 返回同步结果
    const finalResult = l2.verdict === Verdict.SUSPICIOUS ? l2 : {
      verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No signals', matched: [],
    };
    finalResult.riskLevel = verdictToRiskLevel(finalResult.verdict, finalResult.confidence, sensitivity);
    finalResult.explainChain = explainChain;
    finalResult.intent = null;
    return finalResult;
  }

  // ── Layer 1: Keyword Matching + Variant/Fuzzy Matching ─────────────────────

  _layerOneKeywords(text, deepText, lowThreshold) {
    const matched = [];

    // Hard keywords: instant toxic verdict
    for (const kw of this.hardKeywords) {
      if (text.includes(kw)) matched.push(kw);
    }
    if (matched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.95, layer: 1, reason: 'Hard keyword match', matched };
    }

    // ── 深度归一化后的匹配（变体/谐音） ──────────────────────────────
    const variantMatched = [];
    for (const kw of this.hardKeywords) {
      if (deepText.includes(kw)) variantMatched.push(kw);
    }
    if (variantMatched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.90, layer: 1, reason: 'Variant keyword match (normalized)', matched: variantMatched };
    }

    // ── 拼音缩写还原（在 deepText 基础上额外检测） ──────────────────
    const pinyinNormalized = this._normalizePinyin(text);
    if (pinyinNormalized !== text) {
      const pinyinMatched = [];
      for (const kw of this.hardKeywords) {
        if (pinyinNormalized.includes(kw)) pinyinMatched.push(kw);
      }
      if (pinyinMatched.length > 0) {
        return { verdict: Verdict.TOXIC, confidence: 0.85, layer: 1, reason: 'Pinyin variant match', matched: pinyinMatched };
      }
    }

    // Regex patterns
    const regexMatched = [];
    for (const rx of this.regexPatterns) {
      const m = text.match(rx) || deepText.match(rx);
      if (m) regexMatched.push(m[0]);
    }
    if (regexMatched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.88, layer: 1, reason: 'Regex pattern match', matched: regexMatched };
    }

    // ── 变体映射还原（保留旧逻辑兼容性）────────────────────────────
    const legacyVariant = this._normalizeForVariants(text);
    const legacyMatched = [];
    for (const kw of this.hardKeywords) {
      if (legacyVariant.includes(kw)) legacyMatched.push(kw);
    }
    if (legacyMatched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.82, layer: 1, reason: 'Legacy variant match', matched: legacyMatched };
    }

    // Soft keywords: accumulate score
    let softScore = 0;
    const softMatched = [];
    for (const kw of this.softKeywords) {
      if (text.includes(kw) || deepText.includes(kw)) {
        softMatched.push(kw);
        softScore += 1;
      }
    }
    const softThreshold = lowThreshold ? 1 : 2;
    if (softScore >= softThreshold) {
      return { verdict: Verdict.SUSPICIOUS, confidence: 0.6 + softScore * 0.05, layer: 1, reason: 'Multiple soft keywords', matched: softMatched };
    }

    return { verdict: Verdict.SAFE, confidence: 0.1, layer: 1, reason: 'No keywords', matched: [] };
  }

  // ── Layer 2: Behavioral / Structural Signals ─────────────────────────────────

  _layerTwoBehavior(text, context) {
    const signals = [];
    let score = 0;

    // Signal: ALL CAPS (shouting)
    const upperRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
    if (upperRatio > 0.6 && text.length > 10) {
      signals.push('all_caps'); score += 0.2;
    }

    // Signal: Excessive punctuation
    if (/[!?]{3,}/.test(text)) {
      signals.push('excessive_punctuation'); score += 0.15;
    }

    // Signal: @-mentions the current user
    if (context.mentionsUser) {
      score += 0.2;
      signals.push('mentions_user');
    }

    // Signal: Short aggressive reply
    if (context.isReply && text.length < 80 && score > 0) {
      signals.push('short_aggressive_reply'); score += 0.1;
    }

    // Signal: Repeated characters
    if (/(.)\1{4,}/.test(text)) {
      signals.push('char_repetition'); score += 0.1;
    }

    // Signal: Emoji aggression
    const aggressiveEmoji = ['💀', '🖕', '🤡', '🗑️', '🤮', '😡', '🤬', '💩'];
    const emojiHits = aggressiveEmoji.filter(e => text.includes(e));
    if (emojiHits.length >= 2) {
      signals.push('aggressive_emoji'); score += 0.2;
    }

    // ── 上下文敏感规则评估（增强版） ──────────────────────────────
    const ctxResult = this.contextRuleEngine.evaluate(text);
    if (ctxResult) {
      if (ctxResult.verdict === Verdict.SUSPICIOUS) {
        return {
          verdict: Verdict.SUSPICIOUS,
          confidence: ctxResult.confidence,
          layer: 2,
          reason: `Context trigger "${ctxResult.trigger}" + negative signal`,
          matched: [ctxResult.trigger, ctxResult.matchedSignal],
        };
      }
      return {
        verdict: Verdict.SAFE,
        confidence: 1.0,
        layer: 2,
        reason: ctxResult.note,
        matched: [ctxResult.trigger],
      };
    }

    if (score >= 0.5) {
      return { verdict: Verdict.TOXIC, confidence: Math.min(score, 0.9), layer: 2, reason: 'Behavioral signals', matched: signals };
    }
    if (score >= 0.25) {
      return { verdict: Verdict.SUSPICIOUS, confidence: score, layer: 2, reason: 'Weak signals', matched: signals };
    }
    return { verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No behavioral signals', matched: [] };
  }

  // ── 拼音还原 ────────────────────────────────────────────────────────────────

  _normalizePinyin(text) {
    let result = text.toLowerCase();
    // 全角转半角
    result = result.replace(/[\uff01-\uff5e]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    result = result.replace(/\u3000/g, ' ');

    // 拼音还原
    for (const [pinyin, chinese] of Object.entries(this.pinyinMap)) {
      result = result.replace(new RegExp(pinyin, 'gi'), chinese);
    }

    // 去空格
    result = result.replace(/\s+/g, '');

    // 变体映射
    const sortedMap = [...this.variantMap].sort((a, b) => b.from.length - a.from.length);
    for (const rule of sortedMap) {
      result = result.replace(new RegExp(rule.from, 'g'), rule.to);
    }

    // 去特殊符号
    result = result.replace(/[.*\-_~`|\\/^<>{}()\[\]#!$%&+=;:'",?]/g, '');

    return result;
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /** 基础标准化（保持向后兼容） */
  _normalize(text) {
    return normalizeText(text, { preserveNumbers: true });
  }

  /**
   * 变体/谐音深度标准化（保留旧逻辑，作为 fallback）
   * 新版优先使用 text-normalizer.js 的 normalizeDeep
   */
  _normalizeForVariants(text) {
    let result = text.toLowerCase();
    result = result.replace(/[\uff01-\uff5e]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    result = result.replace(/\u3000/g, ' ');
    result = result.replace(/\s+/g, '');
    result = result.replace(/[.*\-_~`|\\/^<>{}()\[\]#!$%&+=;:'",?]/g, '');

    const sortedMap = [...this.variantMap].sort((a, b) => b.from.length - a.from.length);
    for (const rule of sortedMap) {
      result = result.replace(new RegExp(rule.from, 'g'), rule.to);
    }

    return result;
  }
}
