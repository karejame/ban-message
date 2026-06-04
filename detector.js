/**
 * detector.js — Three-Layer Toxicity Detection Engine
 *
 * Layer 1: Keyword Rules      (sync,  ~0ms)   — hard pattern match + variant/fuzzy matching
 * Layer 2: Behavioral Rules   (sync,  ~1ms)   — structural/contextual signals
 * Layer 3: Claude AI          (async, ~500ms) — ambiguous gray-zone content
 */

import enPatterns from './en-patterns.json';
import zhPatterns from './zh-patterns.json';

// ─── Result schema ────────────────────────────────────────────────────────────
//
//  {
//    verdict:    'toxic' | 'suspicious' | 'safe',
//    confidence: 0.0–1.0,
//    layer:      1 | 2 | 3,
//    reason:     string,          // human-readable explanation
//    matched:    string[],        // matched keywords or patterns
//  }

export const Verdict = {
  TOXIC:      'toxic',
  SUSPICIOUS: 'suspicious',
  SAFE:       'safe',
};

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

    // ── 变体映射（用于谐音/拼音/符号绕过检测） ──────────────────────────────
    this.variantMap = [
      ...(enPatterns.variant_map || []),
      ...(zhPatterns.variant_map || []),
    ];

    // ── 拼音缩写映射（中文拼音首字母缩写还原） ──────────────────────────────
    this.pinyinMap = zhPatterns.pinyin_map || {};

    // ── 添加用户自定义关键词 ──────────────────────────────────────────────────
    this._addCustomKeywords();
  }

  _addCustomKeywords() {
    const customs = this.config.customKeywords || [];
    for (const entry of customs) {
      // 主词作为 hard keyword
      if (entry.keyword) {
        this.hardKeywords.add(entry.keyword.toLowerCase());
      }
      // 别名/联想词也加入
      if (entry.aliases && entry.aliases.length > 0) {
        for (const alias of entry.aliases) {
          this.hardKeywords.add(alias.toLowerCase());
        }
      }
    }
  }

  /**
   * 主入口 — 运行所有检测层。
   * 同步返回结果对象（AI层结果通过回调添加）。
   *
   * @param {string}   text
   * @param {object}   context   { username, platform, isReply, mentionsUser }
   * @param {Function} onAIResult   Called with final AI result if layer 3 runs
   */
  analyze(text, context = {}, onAIResult = null) {
    const normalized = this._normalize(text);

    // Layer 1: 关键词 + 变体匹配
    const l1 = this._layerOneKeywords(normalized);
    if (l1.verdict === Verdict.TOXIC) return l1;

    // Layer 2: 行为模式
    const l2 = this._layerTwoBehavior(normalized, context);
    if (l2.verdict === Verdict.TOXIC) return l2;

    // Layer 3 — async, only if enabled and text is ambiguous
    if (this.config.aiEnabled && l2.verdict === Verdict.SUSPICIOUS && onAIResult) {
      this._layerThreeAI(text, context).then(onAIResult);
    }

    return l2.verdict === Verdict.SUSPICIOUS ? l2 : { verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No signals', matched: [] };
  }

  // ── Layer 1: Keyword Matching + Variant/Fuzzy Matching ─────────────────────

  _layerOneKeywords(text) {
    const matched = [];

    // Hard keywords: instant toxic verdict
    for (const kw of this.hardKeywords) {
      if (text.includes(kw)) matched.push(kw);
    }
    if (matched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.95, layer: 1, reason: 'Hard keyword match', matched };
    }

    // ── 变体/谐音检测：先对文本做变体还原，再匹配关键词 ────────────────────
    const variantNormalized = this._normalizeForVariants(text);
    const variantMatched = [];
    for (const kw of this.hardKeywords) {
      if (variantNormalized.includes(kw)) variantMatched.push(kw);
    }
    if (variantMatched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.90, layer: 1, reason: 'Variant keyword match', matched: variantMatched };
    }

    // Regex patterns
    const regexMatched = [];
    for (const rx of this.regexPatterns) {
      const m = text.match(rx);
      if (m) regexMatched.push(m[0]);
    }
    if (regexMatched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.88, layer: 1, reason: 'Regex pattern match', matched: regexMatched };
    }

    // ── 变体还原后的正则匹配 ──────────────────────────────────────────────
    const variantRegexMatched = [];
    for (const rx of this.regexPatterns) {
      const m = variantNormalized.match(rx);
      if (m) variantRegexMatched.push(m[0]);
    }
    if (variantRegexMatched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.82, layer: 1, reason: 'Variant regex match', matched: variantRegexMatched };
    }

    // Soft keywords: accumulate score
    let softScore = 0;
    const softMatched = [];
    for (const kw of this.softKeywords) {
      if (text.includes(kw)) {
        softMatched.push(kw);
        softScore += 1;
      }
    }
    if (softScore >= 2) {
      return { verdict: Verdict.SUSPICIOUS, confidence: 0.6 + softScore * 0.05, layer: 1, reason: 'Multiple soft keywords', matched: softMatched };
    }

    // ── 变体还原后的 soft keyword 匹配 ──────────────────────────────────────
    let variantSoftScore = 0;
    const variantSoftMatched = [];
    for (const kw of this.softKeywords) {
      if (variantNormalized.includes(kw)) {
        variantSoftMatched.push(kw);
        variantSoftScore += 1;
      }
    }
    if (variantSoftScore >= 2) {
      return { verdict: Verdict.SUSPICIOUS, confidence: 0.55 + variantSoftScore * 0.05, layer: 1, reason: 'Variant soft keywords', matched: variantSoftMatched };
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

    // Signal: Excessive punctuation (!!!! ????)
    if (/[!?]{3,}/.test(text)) {
      signals.push('excessive_punctuation'); score += 0.15;
    }

    // Signal: This comment @-mentions the current user (set by platform adapter)
    if (context.mentionsUser) {
      score += 0.2;
      signals.push('mentions_user');
    }

    // Signal: Short aggressive reply to user (classic "come at me" pattern)
    if (context.isReply && text.length < 80 && score > 0) {
      signals.push('short_aggressive_reply'); score += 0.1;
    }

    // Signal: Repeated characters (soooo stuuupid)
    if (/(.)\1{4,}/.test(text)) {
      signals.push('char_repetition'); score += 0.1;
    }

    // Signal: Emoji aggression (💀🖕🤡 combos)
    const aggressiveEmoji = ['💀', '🖕', '🤡', '🗑️', '🤮', '😡', '🤬', '💩'];
    const emojiHits = aggressiveEmoji.filter(e => text.includes(e));
    if (emojiHits.length >= 2) {
      signals.push('aggressive_emoji'); score += 0.2;
    }

    if (score >= 0.5) {
      return { verdict: Verdict.TOXIC, confidence: Math.min(score, 0.9), layer: 2, reason: 'Behavioral signals', matched: signals };
    }
    if (score >= 0.25) {
      return { verdict: Verdict.SUSPICIOUS, confidence: score, layer: 2, reason: 'Weak signals', matched: signals };
    }
    return { verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No behavioral signals', matched: [] };
  }

  // ── Layer 3: Claude AI ────────────────────────────────────────────────────────

  async _layerThreeAI(text, context) {
    if (!this.config.apiKey) return null;

    const prompt = `You are a content moderation assistant. Analyze this text for harassment, personal attacks, or toxic behavior toward another user.

Text: """${text}"""
Context: Platform=${context.platform || 'unknown'}, Is a direct reply=${!!context.isReply}

Respond with ONLY valid JSON:
{
  "verdict": "toxic" | "suspicious" | "safe",
  "confidence": 0.0-1.0,
  "reason": "one sentence explanation"
}`;

    try {
      const data = await this._gmFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const raw = data.content?.[0]?.text || '{}';
      const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

      return {
        verdict:    result.verdict     || Verdict.SAFE,
        confidence: result.confidence  || 0.5,
        layer:      3,
        reason:     result.reason      || 'AI analysis',
        matched:    [],
      };
    } catch (err) {
      console.warn('[CyberShield] AI layer failed:', err);
      return null;
    }
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

  // ── Utilities ────────────────────────────────────────────────────────────────

  /**
   * 标准化文本用于关键词匹配。
   * 去除多余空白，转换为小写。
   */
  _normalize(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 针对变体/谐音绕过的深度标准化。
   *
   * 处理以下绕过方式：
   * - 空格拆分：傻 逼 → 傻逼
   * - 特殊符号分隔：傻*逼 → 傻逼
   * - 全角字符转换：ｓｂ → sb
   * - 谐音替换映射：煞笔 → 傻逼
   * - 拼音缩写还原：sha bi → 傻逼
   * - 英文 leetspeak：k1ll → kill
   */
  _normalizeForVariants(text) {
    let result = text.toLowerCase();

    // 1) 全角 → 半角
    result = result.replace(/[\uff01-\uff5e]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    result = result.replace(/\u3000/g, ' '); // 全角空格

    // 2) 去除所有空格（中文词中空格拆分绕过）
    result = result.replace(/\s+/g, '');

    // 3) 去除特殊分隔符号（用于拆分中文词的绕过）
    result = result.replace(/[.*\-_~`|\\/^<>{}()\[\]#!$%&+=;:'",?]/g, '');

    // 4) 应用变体映射（谐音替换、英文 leetspeak）
    // variant_map 按长度从长到短排序，避免短替换干扰长匹配
    const sortedMap = [...this.variantMap].sort((a, b) => b.from.length - a.from.length);
    for (const rule of sortedMap) {
      result = result.replace(new RegExp(rule.from, 'g'), rule.to);
    }

    // 5) 拼音缩写还原（如 sha bi → 傻逼）
    // 因为已经去除了空格，需要先处理带空格的拼音词
    // 这一步在去除空格之前做，所以我们在上面的流程中特殊处理
    // 实际上我们需要在去空格之前做拼音还原
    // 重新实现：先做拼音还原，再去空格

    // 重新计算：带空格的原始文本做拼音还原
    let withPinyin = text.toLowerCase();
    withPinyin = withPinyin.replace(/[\uff01-\uff5e]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    withPinyin = withPinyin.replace(/\u3000/g, ' ');

    // 拼音还原（需要保留空格才能匹配 "sha bi" 等多词拼音）
    for (const [pinyin, chinese] of Object.entries(this.pinyinMap)) {
      withPinyin = withPinyin.replace(new RegExp(pinyin, 'gi'), chinese);
    }

    // 变体映射
    for (const rule of sortedMap) {
      withPinyin = withPinyin.replace(new RegExp(rule.from, 'g'), rule.to);
    }

    // 去空格和特殊符号
    withPinyin = withPinyin.replace(/\s+/g, '');
    withPinyin = withPinyin.replace(/[.*\-_~`|\\/^<>{}()\[\]#!$%&+=;:'",?]/g, '');

    // 合并两种还原路径的结果，取能匹配更多关键词的那个
    // 如果拼音还原路径能匹配更多，优先使用
    let pinyinHits = 0;
    let directHits = 0;
    for (const kw of this.hardKeywords) {
      if (withPinyin.includes(kw)) pinyinHits++;
      if (result.includes(kw)) directHits++;
    }

    return pinyinHits > directHits ? withPinyin : result;
  }
}