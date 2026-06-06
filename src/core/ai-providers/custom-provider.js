/**
 * custom-provider.js — 自定义 AI 服务商 (OpenAI 兼容)
 *
 * 用户自行填写 API 端点和模型名称，使用 OpenAI 兼容格式通信。
 * 适用于 DeepSeek、通义千问、智谱 GLM、Moonshot 等兼容 OpenAI API 的服务。
 */

import {
  BaseAIProvider,
  DEFAULT_SYSTEM_PROMPT,
  BATCH_PROMPT_TEMPLATE,
  SINGLE_PROMPT_TEMPLATE,
} from './base-provider.js';

export class CustomProvider extends BaseAIProvider {
  get name() { return 'custom'; }
  get defaultModel() { return this.config.aiModel || 'default'; }

  /**
   * API 端点 — 必须由用户配置，否则报错
   */
  get apiUrl() {
    const url = this.config.aiEndpoint;
    if (!url) {
      throw new Error('[CyberShield] Custom provider requires aiEndpoint');
    }
    return url;
  }

  /**
   * 从响应体中自动识别消息内容字段
   * 兼容 OpenAI / Anthropic / 其他常见格式
   */
  _extractContent(data) {
    // OpenAI 格式: choices[0].message.content
    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    // Anthropic 格式: content[0].text
    if (data.content?.[0]?.text) {
      return data.content[0].text;
    }
    // 兜底：尝试直接解析整个 response
    if (typeof data === 'string') return data;
    return '{}';
  }

  /**
   * 构造认证头 — 默认 Bearer，同时支持 x-api-key
   */
  _authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  async analyzeSingle(text, context) {
    const prompt = SINGLE_PROMPT_TEMPLATE(text, context);
    const data = await this._gmFetch(this.apiUrl, {
      method: 'POST',
      headers: this._authHeaders(),
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

    const raw = this._extractContent(data);
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
      headers: this._authHeaders(),
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

    const raw = this._extractContent(data);
    const results = this._parseAIResponse(raw);

    if (!Array.isArray(results)) return items.map(() => null);
    return results.map(r => this._normalizeResult(r));
  }

  async validateKey() {
    try {
      const data = await this._gmFetch(this.apiUrl, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });
      // 只要有有效响应就算通过
      return !!data;
    } catch (e) {
      return false;
    }
  }
}
