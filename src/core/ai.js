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

// ─── 批处理参数 ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 5000; // 5s

export class AIAnalyzer {
  constructor(config) {
    this.config = config;
    this.dailyCount = 0;
    this.lastResetDate = null;
    this._loadDailyCount();

    // 批处理队列
    this._queue = [];
    this._queueTimer = null;
    this._queueResolvers = new Map();
    this._queueIdCounter = 0;
  }

  /**
   * AI 分析入口 — 支持批处理合并
   * @param {string} text
   * @param {object} context  { platform, isReply, mentionsUser, username }
   * @returns {Promise<object|null>}  { verdict, confidence, layer:3, reason, patterns }
   */
  async analyze(text, context = {}) {
    if (!this.config.apiKey) return null;
    if (!this._checkDailyLimit()) return null;

    // 通过 Promise 入队，攒够批量或超时后统一发送
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

  /** 刷新批处理队列，攒够一批后发送 */
  _flushBatch() {
    if (this._queueTimer) {
      clearTimeout(this._queueTimer);
      this._queueTimer = null;
    }

    const batch = this._queue.splice(0, BATCH_SIZE);
    if (batch.length === 0) return;

    this._callBatchAPI(batch).then(results => {
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const resolve = this._queueResolvers.get(item.id);
        if (resolve) {
          resolve(results[i] || null);
          this._queueResolvers.delete(item.id);
        }
      }
    }).catch(err => {
      console.warn('[CyberShield] Batch AI failed, falling back to single:', err);
      for (const item of batch) {
        const resolve = this._queueResolvers.get(item.id);
        if (resolve) {
          this._singleFallback(item, resolve);
        }
      }
    });
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

    const rawData = await this._gmFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: DEFAULT_SYSTEM_PROMPT,
        max_tokens: 200 * batch.length,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const raw = rawData.content?.[0]?.text || '[]';
    const results = JSON.parse(raw.replace(/```json|```/g, '').trim());

    if (!Array.isArray(results)) return batch.map(() => null);

    return results.map(r => {
      if (!r) return null;
      this.dailyCount++;
      this._saveDailyCount();
      return {
        verdict:    r.verdict     || 'safe',
        confidence: r.confidence  || 0.5,
        layer:      3,
        reason:     r.reason      || 'AI analysis',
        patterns:   r.patterns    || [],
      };
    });
  }

  /** 单条回退（批量失败时降级） */
  async _singleFallback(item, resolve) {
    const prompt = this._buildPrompt(item.text, item.context);
    try {
      const rawData = await this._gmFetch('https://api.anthropic.com/v1/messages', {
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
      const raw = rawData.content?.[0]?.text || '{}';
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