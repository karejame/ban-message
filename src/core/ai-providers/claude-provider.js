/**
 * claude-provider.js — Anthropic Claude AI Provider
 */

import {
  BaseAIProvider,
  DEFAULT_SYSTEM_PROMPT,
  BATCH_PROMPT_TEMPLATE,
  SINGLE_PROMPT_TEMPLATE,
} from './base-provider.js';

export class ClaudeProvider extends BaseAIProvider {
  get name() { return 'claude'; }
  get defaultModel() { return 'claude-sonnet-4-20250514'; }
  get apiUrl() { return 'https://api.anthropic.com/v1/messages'; }

  async analyzeSingle(text, context) {
    const prompt = SINGLE_PROMPT_TEMPLATE(text, context);
    const data = await this._gmFetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: DEFAULT_SYSTEM_PROMPT,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const raw = data.content?.[0]?.text || '{}';
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
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: DEFAULT_SYSTEM_PROMPT,
        max_tokens: 300 * items.length,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const raw = data.content?.[0]?.text || '[]';
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
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}
