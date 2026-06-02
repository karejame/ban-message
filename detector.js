/**
 * detector.js — Three-Layer Toxicity Detection Engine
 *
 * Layer 1: Keyword Rules      (sync,  ~0ms)   — hard pattern match
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
  }

  /**
   * Main entry point — runs all available layers.
   * Returns a result object synchronously (AI layer result added via callback).
   *
   * @param {string}   text
   * @param {object}   context   { username, platform, isReply, mentionsUser }
   * @param {Function} onAIResult   Called with final AI result if layer 3 runs
   */
  analyze(text, context = {}, onAIResult = null) {
    const normalized = this._normalize(text);

    // Layer 1
    const l1 = this._layerOneKeywords(normalized);
    if (l1.verdict === Verdict.TOXIC) return l1;

    // Layer 2
    const l2 = this._layerTwoBehavior(normalized, context);
    if (l2.verdict === Verdict.TOXIC) return l2;

    // Layer 3 — async, only if enabled and text is ambiguous
    if (this.config.aiEnabled && l2.verdict === Verdict.SUSPICIOUS && onAIResult) {
      this._layerThreeAI(text, context).then(onAIResult);
    }

    return l2.verdict === Verdict.SUSPICIOUS ? l2 : { verdict: Verdict.SAFE, confidence: 0.1, layer: 2, reason: 'No signals', matched: [] };
  }

  // ── Layer 1: Keyword Matching ────────────────────────────────────────────────

  _layerOneKeywords(text) {
    const matched = [];

    // Hard keywords: instant toxic verdict
    for (const kw of this.hardKeywords) {
      if (text.includes(kw)) matched.push(kw);
    }
    if (matched.length > 0) {
      return { verdict: Verdict.TOXIC, confidence: 0.95, layer: 1, reason: 'Hard keyword match', matched };
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

  _normalize(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
}
