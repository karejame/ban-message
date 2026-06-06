/**
 * openai-provider.js — OpenAI GPT Provider
 *
 * 支持 OpenAI 兼容 API（含第三方兼容端点，如 deepseek、zhipu 等）
 */

import {
  BaseAIProvider,
  DEFAULT_SYSTEM_PROMPT,
  BATCH_PROMPT_TEMPLATE,
  SINGLE_PROMPT_TEMPLATE,
} from './base-provider.js';

export class OpenAIProvider extends BaseAIProvider {
  get name() { return 'openai'; }
  get defaultModel() { return 'gpt-4o-mini'; }
  get apiUrl() {
    return this.config.aiEndpoint || 'https://api.openai.com/v1/chat/completions';
  }

  async analyzeSingle(text, context) {
    const prompt = SINGLE_PROMPT_TEMPLATE(text, context);
    const data = await this._gmFetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    const raw = data.choices?.[0]?.message?.content || '{}';
    const parsed = this._parseAIResponse(raw);
    return this._normalizeResult(parsed);
  }

  async analyzeBatch(items) {
    const batchText = items.map((item, i) =>
      `[${i + 1}] """${item.text}""" (platform: ${item.context?.platform || 'unknown'})`
    ).join('\n\n');

    const prompt = BATCH_PROMPT_TEMPLATE(items.length, batchText);

    const data = await this._gmFetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300 * items.length,
        temperature: 0.1,
      }),
    });

    const raw = data.choices?.[0]?.message?.content || '[]';
    const results = this._parseAIResponse(raw);

    if (!Array.isArray(results)) return items.map(() => null);
    return results.map(r => this._normalizeResult(r));
  }

  async validateKey() {
    try {
      await this._gmFetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}
